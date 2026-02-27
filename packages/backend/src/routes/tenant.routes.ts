import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database';
import { requireRole } from '../middleware/roles';

const createTenantSchema = z.object({
  name: z.string().min(1),
  timezone: z.string().default('America/Argentina/Buenos_Aires'),
});

const updateTenantSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
  timezone: z.string().optional(),
});

export async function tenantRoutes(app: FastifyInstance) {
  // List all tenants (superadmin only)
  app.get('/', {
    preHandler: [requireRole('superadmin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tenants = await prisma.tenant.findMany({
      include: { _count: { select: { users: true, channels: true, leads: true } } },
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

  // Update tenant (superadmin only)
  app.patch('/:id', {
    preHandler: [requireRole('superadmin')],
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const body = updateTenantSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'Validation failed', details: body.error.flatten() });
    }

    const tenant = await prisma.tenant.update({
      where: { id: request.params.id },
      data: body.data,
    });

    return reply.send({ tenant });
  });

  // Delete tenant (superadmin only)
  app.delete('/:id', {
    preHandler: [requireRole('superadmin')],
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    await prisma.tenant.delete({ where: { id: request.params.id } });
    return reply.send({ message: 'Tenant deleted' });
  });
}
