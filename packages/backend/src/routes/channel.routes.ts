import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database';
import { requireRole } from '../middleware/roles';

const createChannelSchema = z.object({
  tenantId: z.string(),
  phoneNumberId: z.string(),
  wabaId: z.string(),
  displayPhone: z.string().optional(),
});

const updateChannelSchema = z.object({
  phoneNumberId: z.string().optional(),
  wabaId: z.string().optional(),
  isActive: z.boolean().optional(),
  displayPhone: z.string().optional(),
});

export async function channelRoutes(app: FastifyInstance) {
  // List channels (superadmin: all, tenant_admin/agent: own tenant)
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;
    const where = user.role === 'superadmin' ? {} : { tenantId: user.tenantId! };

    const channels = await prisma.channel.findMany({
      where,
      include: { tenant: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return reply.send({ channels });
  });

  // Create channel (superadmin only)
  app.post('/', {
    preHandler: [requireRole('superadmin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createChannelSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'Validation failed', details: body.error.flatten() });
    }

    const channel = await prisma.channel.create({ data: body.data });
    return reply.status(201).send({ channel });
  });

  // Update channel (superadmin only)
  app.patch('/:id', {
    preHandler: [requireRole('superadmin')],
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const body = updateChannelSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'Validation failed', details: body.error.flatten() });
    }

    const channel = await prisma.channel.update({
      where: { id: request.params.id },
      data: body.data,
    });
    return reply.send({ channel });
  });

  // Delete channel (superadmin only)
  app.delete('/:id', {
    preHandler: [requireRole('superadmin')],
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    await prisma.channel.delete({ where: { id: request.params.id } });
    return reply.send({ message: 'Channel deleted' });
  });
}
