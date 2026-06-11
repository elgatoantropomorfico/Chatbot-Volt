import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database';
import { requireRole } from '../middleware/roles';

const optionSchema = z.object({
  value: z.string(),
  label: z.string().optional(),
  aliases: z.array(z.string()).optional().default([]),
});

const createSchema = z.object({
  tenantId: z.string(),
  localKey: z.string(),
  pilotField: z.string(),
  label: z.string(),
  fieldType: z.string().default('text'),
  isRequired: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().optional().default(0),
  defaultValue: z.string().nullable().optional(),
  includeInNotes: z.boolean().optional().default(false),
  optionsJson: z.array(optionSchema).optional().default([]),
  description: z.string().nullable().optional(),
});

const updateSchema = z.object({
  pilotField: z.string().optional(),
  label: z.string().optional(),
  fieldType: z.string().optional(),
  isRequired: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().optional(),
  defaultValue: z.string().nullable().optional(),
  includeInNotes: z.boolean().optional(),
  optionsJson: z.array(optionSchema).optional(),
  description: z.string().nullable().optional(),
});

export async function pilotFieldRoutes(app: FastifyInstance) {
  app.get('/', {
    preHandler: [requireRole('superadmin', 'tenant_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;
    const { tenantId } = request.query as { tenantId?: string };

    const where: any = {};
    if (user.role === 'superadmin' && tenantId) {
      where.tenantId = tenantId;
    } else if (user.tenantId) {
      where.tenantId = user.tenantId;
    }

    const fields = await prisma.pilotFieldConfig.findMany({
      where,
      orderBy: { sortOrder: 'asc' },
    });

    return reply.send({ fields });
  });

  app.post('/', {
    preHandler: [requireRole('superadmin', 'tenant_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'Validation failed', details: body.error.flatten() });
    }

    const user = request.user;
    if (user.role === 'tenant_admin' && user.tenantId !== body.data.tenantId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const field = await prisma.pilotFieldConfig.create({
      data: {
        tenantId: body.data.tenantId,
        localKey: body.data.localKey,
        pilotField: body.data.pilotField,
        label: body.data.label,
        fieldType: body.data.fieldType,
        isRequired: body.data.isRequired,
        isActive: body.data.isActive,
        sortOrder: body.data.sortOrder,
        defaultValue: body.data.defaultValue ?? null,
        includeInNotes: body.data.includeInNotes,
        optionsJson: body.data.optionsJson,
        description: body.data.description ?? null,
      },
    });

    return reply.status(201).send({ field });
  });

  app.patch('/:id', {
    preHandler: [requireRole('superadmin', 'tenant_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = updateSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'Validation failed', details: body.error.flatten() });
    }

    const existing = await prisma.pilotFieldConfig.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'Not found' });

    const user = request.user;
    if (user.role === 'tenant_admin' && user.tenantId !== existing.tenantId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const data: any = { ...body.data };
    const field = await prisma.pilotFieldConfig.update({ where: { id }, data });
    return reply.send({ field });
  });

  app.delete('/:id', {
    preHandler: [requireRole('superadmin', 'tenant_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.pilotFieldConfig.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'Not found' });

    const user = request.user;
    if (user.role === 'tenant_admin' && user.tenantId !== existing.tenantId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    await prisma.pilotFieldConfig.delete({ where: { id } });
    return reply.send({ message: 'Deleted' });
  });
}
