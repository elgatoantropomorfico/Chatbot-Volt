import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database';
import { requireRole } from '../middleware/auth';

const optionSchema = z.object({
  value: z.string(),
  label: z.string().optional(),
  aliases: z.array(z.string()).optional().default([]),
  slug: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  description: z.string().optional(),
});

const createSchema = z.object({
  tenantId: z.string(),
  localKey: z.string(),
  zohoField: z.string(),
  label: z.string(),
  fieldType: z.string().default('single_line'),
  isRequired: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().optional().default(0),
  fixedValue: z.string().nullable().optional(),
  optionsJson: z.array(optionSchema).optional().default([]),
  description: z.string().nullable().optional(),
});

const updateSchema = z.object({
  zohoField: z.string().optional(),
  label: z.string().optional(),
  fieldType: z.string().optional(),
  isRequired: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().optional(),
  fixedValue: z.string().nullable().optional(),
  optionsJson: z.array(optionSchema).optional(),
  description: z.string().nullable().optional(),
});

export async function zohoFieldRoutes(app: FastifyInstance) {
  // List all field configs for a tenant
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

    const fields = await prisma.zohoFieldConfig.findMany({
      where,
      orderBy: { sortOrder: 'asc' },
    });

    return reply.send({ fields });
  });

  // Create field config
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

    const field = await prisma.zohoFieldConfig.create({
      data: {
        tenantId: body.data.tenantId,
        localKey: body.data.localKey,
        zohoField: body.data.zohoField,
        label: body.data.label,
        fieldType: body.data.fieldType,
        isRequired: body.data.isRequired,
        isActive: body.data.isActive,
        sortOrder: body.data.sortOrder,
        fixedValue: body.data.fixedValue ?? null,
        optionsJson: body.data.optionsJson,
        description: body.data.description ?? null,
      },
    });

    return reply.status(201).send({ field });
  });

  // Update field config
  app.patch('/:id', {
    preHandler: [requireRole('superadmin', 'tenant_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = updateSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'Validation failed', details: body.error.flatten() });
    }

    const existing = await prisma.zohoFieldConfig.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'Not found' });

    const user = request.user;
    if (user.role === 'tenant_admin' && user.tenantId !== existing.tenantId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const data: any = {};
    if (body.data.zohoField !== undefined) data.zohoField = body.data.zohoField;
    if (body.data.label !== undefined) data.label = body.data.label;
    if (body.data.fieldType !== undefined) data.fieldType = body.data.fieldType;
    if (body.data.isRequired !== undefined) data.isRequired = body.data.isRequired;
    if (body.data.isActive !== undefined) data.isActive = body.data.isActive;
    if (body.data.sortOrder !== undefined) data.sortOrder = body.data.sortOrder;
    if (body.data.fixedValue !== undefined) data.fixedValue = body.data.fixedValue;
    if (body.data.optionsJson !== undefined) data.optionsJson = body.data.optionsJson;
    if (body.data.description !== undefined) data.description = body.data.description;

    const field = await prisma.zohoFieldConfig.update({ where: { id }, data });
    return reply.send({ field });
  });

  // Delete field config
  app.delete('/:id', {
    preHandler: [requireRole('superadmin', 'tenant_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.zohoFieldConfig.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'Not found' });

    const user = request.user;
    if (user.role === 'tenant_admin' && user.tenantId !== existing.tenantId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    await prisma.zohoFieldConfig.delete({ where: { id } });
    return reply.send({ message: 'Deleted' });
  });
}
