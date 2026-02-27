import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database';
import { requireRole } from '../middleware/roles';

const createIntegrationSchema = z.object({
  tenantId: z.string(),
  type: z.enum(['woocommerce']),
  config: z.object({
    baseUrl: z.string().url(),
    consumerKey: z.string(),
    consumerSecret: z.string(),
    maxSearchResults: z.number().min(1).max(20).optional(),
    enableProductSearch: z.boolean().optional(),
    enableOrderLookup: z.boolean().optional(),
    enableCart: z.boolean().optional(),
    checkoutMode: z.enum(['wa_human', 'mercadopago']).optional(),
    checkoutPhone: z.string().optional(),
  }),
});

const updateIntegrationSchema = z.object({
  config: z.object({
    baseUrl: z.string().url(),
    consumerKey: z.string(),
    consumerSecret: z.string(),
    maxSearchResults: z.number().min(1).max(20).optional(),
    enableProductSearch: z.boolean().optional(),
    enableOrderLookup: z.boolean().optional(),
    enableCart: z.boolean().optional(),
    checkoutMode: z.enum(['wa_human', 'mercadopago']).optional(),
    checkoutPhone: z.string().optional(),
  }).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export async function integrationRoutes(app: FastifyInstance) {
  // List integrations for tenant
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;
    const where = user.role === 'superadmin' ? {} : { tenantId: user.tenantId! };

    const integrations = await prisma.integration.findMany({
      where,
      select: { id: true, tenantId: true, type: true, status: true, createdAt: true },
    });
    return reply.send({ integrations });
  });

  // Create integration (superadmin or tenant_admin)
  app.post('/', {
    preHandler: [requireRole('superadmin', 'tenant_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createIntegrationSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'Validation failed', details: body.error.flatten() });
    }

    const user = request.user;
    if (user.role === 'tenant_admin' && user.tenantId !== body.data.tenantId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const integration = await prisma.integration.create({
      data: {
        tenantId: body.data.tenantId,
        type: body.data.type,
        configEncrypted: JSON.stringify(body.data.config),
        status: 'active',
      },
    });

    return reply.status(201).send({ integration: { id: integration.id, type: integration.type, status: integration.status } });
  });

  // Update integration
  app.patch('/:id', {
    preHandler: [requireRole('superadmin', 'tenant_admin')],
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const body = updateIntegrationSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'Validation failed', details: body.error.flatten() });
    }

    const data: any = {};
    if (body.data.config) data.configEncrypted = JSON.stringify(body.data.config);
    if (body.data.status) data.status = body.data.status;

    const integration = await prisma.integration.update({
      where: { id: request.params.id },
      data,
    });

    return reply.send({ integration: { id: integration.id, type: integration.type, status: integration.status } });
  });

  // Delete integration
  app.delete('/:id', {
    preHandler: [requireRole('superadmin')],
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    await prisma.integration.delete({ where: { id: request.params.id } });
    return reply.send({ message: 'Integration deleted' });
  });
}
