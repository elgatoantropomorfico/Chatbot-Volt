import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database';
import { requireRole } from '../middleware/roles';

const createOfferSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  zohoPicklistValue: z.string().min(1),
  synonymsJson: z.array(z.string()).optional(),
  keywordsJson: z.array(z.string()).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().optional(),
});

const updateOfferSchema = createOfferSchema.partial();

export async function offerRoutes(app: FastifyInstance) {
  // List offers for tenant
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;
    const query = request.query as { tenantId?: string };
    const tenantId = user.role === 'superadmin' && query.tenantId ? query.tenantId : user.tenantId;

    if (!tenantId) return reply.status(400).send({ error: 'Tenant ID required' });

    const offers = await prisma.tenantOffer.findMany({
      where: { tenantId },
      orderBy: { sortOrder: 'asc' },
    });

    return reply.send({ offers });
  });

  // Create offer
  app.post('/', {
    preHandler: [requireRole('superadmin', 'tenant_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createOfferSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation failed', details: body.error.flatten() });

    const user = request.user;
    const reqBody = request.body as any;
    const tenantId = user.role === 'superadmin' && reqBody.tenantId ? reqBody.tenantId : user.tenantId;

    if (!tenantId) return reply.status(400).send({ error: 'Tenant ID required' });

    const offer = await prisma.tenantOffer.create({
      data: {
        tenantId,
        name: body.data.name,
        slug: body.data.slug,
        zohoPicklistValue: body.data.zohoPicklistValue,
        synonymsJson: body.data.synonymsJson || [],
        keywordsJson: body.data.keywordsJson || [],
        description: body.data.description || null,
        isActive: body.data.isActive ?? true,
        sortOrder: body.data.sortOrder ?? 0,
      },
    });

    return reply.status(201).send({ offer });
  });

  // Update offer
  app.patch('/:id', {
    preHandler: [requireRole('superadmin', 'tenant_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = updateOfferSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation failed', details: body.error.flatten() });

    const offer = await prisma.tenantOffer.update({
      where: { id },
      data: body.data,
    });

    return reply.send({ offer });
  });

  // Delete offer
  app.delete('/:id', {
    preHandler: [requireRole('superadmin', 'tenant_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    await prisma.tenantOffer.delete({ where: { id } });
    return reply.send({ message: 'Offer deleted' });
  });
}
