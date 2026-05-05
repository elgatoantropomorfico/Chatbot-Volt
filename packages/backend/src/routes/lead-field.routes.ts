import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database';
import { requireRole } from '../middleware/roles';

const createSchema = z.object({
  tenantId: z.string(),
  fieldKey: z.string(),
  label: z.string(),
  fieldType: z.enum(['text', 'picklist', 'photo', 'multi_photo', 'number', 'email', 'date']).default('text'),
  step: z.number().int().min(1).default(1),
  isRequired: z.boolean().default(false),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  optionsJson: z.any().default([]),
  promptHint: z.string().optional(),
  description: z.string().optional(),
});

const updateSchema = createSchema.partial().omit({ tenantId: true, fieldKey: true });

export async function leadFieldRoutes(app: FastifyInstance) {
  // List all configs for a tenant
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;
    const { tenantId } = request.query as { tenantId?: string };

    const where: any = {};
    if (user.role === 'superadmin' && tenantId) {
      where.tenantId = tenantId;
    } else if (user.role !== 'superadmin') {
      where.tenantId = user.tenantId;
    }

    const configs = await prisma.leadFieldConfig.findMany({
      where,
      orderBy: [{ step: 'asc' }, { sortOrder: 'asc' }],
    });
    return reply.send({ configs });
  });

  // Create a new field config
  app.post('/', {
    preHandler: [requireRole('superadmin', 'tenant_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'Validation failed', details: body.error.flatten() });
    }

    const user = request.user;
    if (user.role !== 'superadmin' && body.data.tenantId !== user.tenantId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const config = await prisma.leadFieldConfig.create({ data: body.data });
    return reply.status(201).send({ config });
  });

  // Update a field config
  app.patch('/:id', {
    preHandler: [requireRole('superadmin', 'tenant_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = updateSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'Validation failed', details: body.error.flatten() });
    }

    const existing = await prisma.leadFieldConfig.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'Not found' });

    const user = request.user;
    if (user.role !== 'superadmin' && existing.tenantId !== user.tenantId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const config = await prisma.leadFieldConfig.update({ where: { id }, data: body.data });
    return reply.send({ config });
  });

  // Delete a field config
  app.delete('/:id', {
    preHandler: [requireRole('superadmin', 'tenant_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.leadFieldConfig.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'Not found' });

    const user = request.user;
    if (user.role !== 'superadmin' && existing.tenantId !== user.tenantId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    await prisma.leadFieldConfig.delete({ where: { id } });
    return reply.send({ message: 'Deleted' });
  });
}
