import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database';
import { requireRole } from '../middleware/roles';
import { TenantCleanupService } from '../services/tenant-cleanup.service';

const createTenantSchema = z.object({
  name: z.string().min(1),
  timezone: z.string().default('America/Argentina/Buenos_Aires'),
});

const updateTenantSchema = z.object({
  name: z.string().min(1).optional(),
  displayName: z.string().min(1).optional().nullable(),
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
  timezone: z.string().optional(),
});

const updateTenantDisplayNameSchema = z.object({
  displayName: z.string().min(1).max(120),
});

export async function tenantRoutes(app: FastifyInstance) {
  // List all tenants (superadmin only)
  app.get('/', {
    preHandler: [requireRole('superadmin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tenants = await prisma.tenant.findMany({
      include: {
        _count: {
          select: { users: true, channels: true, leads: true, conversations: true, integrations: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return reply.send({ tenants });
  });

  // Get single tenant
  app.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const user = request.user;
    const { id } = request.params;

    if (user.role !== 'superadmin' && user.tenantId !== id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: {
        channels: true,
        botSettings: true,
        _count: { select: { users: true, leads: true, conversations: true } },
      },
    });

    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' });
    return reply.send({ tenant });
  });

  // Create tenant (superadmin only)
  app.post('/', {
    preHandler: [requireRole('superadmin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createTenantSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'Validation failed', details: body.error.flatten() });
    }

    const tenant = await prisma.tenant.create({
      data: {
        ...body.data,
        botSettings: {
          create: {},
        },
      },
      include: { botSettings: true },
    });

    return reply.status(201).send({ tenant });
  });

  // Update tenant display name (tenant_admin — solo su tenant, no toca name interno)
  app.patch('/me/display-name', {
    preHandler: [requireRole('tenant_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = updateTenantDisplayNameSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'Validation failed', details: body.error.flatten() });
    }

    const tenantId = request.user.tenantId;
    if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });

    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: { displayName: body.data.displayName.trim() },
      select: { id: true, name: true, displayName: true, status: true },
    });

    return reply.send({ tenant });
  });

  // Update tenant (superadmin only — name interno, status, timezone)
  app.patch('/:id', {
    preHandler: [requireRole('superadmin')],
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const body = updateTenantSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'Validation failed', details: body.error.flatten() });
    }

    const tenant = await prisma.tenant.update({
      where: { id: request.params.id },
      data: {
        ...(body.data.name !== undefined ? { name: body.data.name } : {}),
        ...(body.data.status !== undefined ? { status: body.data.status } : {}),
        ...(body.data.timezone !== undefined ? { timezone: body.data.timezone } : {}),
        // superadmin no modifica displayName desde este endpoint
      },
    });

    return reply.send({ tenant });
  });

  // Delete tenant (superadmin only) — full cascade + R2 cleanup.
  app.delete('/:id', {
    preHandler: [requireRole('superadmin')],
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;
    try {
      const result = await TenantCleanupService.deleteTenant(id);
      return reply.send({
        message: 'Tenant deleted successfully',
        ...result,
      });
    } catch (err: any) {
      if (err.message === 'Tenant not found') {
        return reply.status(404).send({ error: 'Tenant not found' });
      }
      console.error(`❌ Failed to delete tenant ${id}:`, err);
      return reply.status(500).send({ error: 'Failed to delete tenant' });
    }
  });
}
