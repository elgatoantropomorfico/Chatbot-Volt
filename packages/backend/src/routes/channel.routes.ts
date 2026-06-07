import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database';
import { requireRole } from '../middleware/roles';
import { TenantCleanupService } from '../services/tenant-cleanup.service';

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

  // Delete channel (superadmin only) — removes linked conversations first.
  app.delete('/:id', {
    preHandler: [requireRole('superadmin')],
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;
    try {
      const result = await TenantCleanupService.deleteChannel(id);
      return reply.send({
        message: 'Channel deleted successfully',
        conversationsRemoved: result.conversationsRemoved,
      });
    } catch (err: any) {
      if (err.message === 'Channel not found') {
        return reply.status(404).send({ error: 'Channel not found' });
      }
      console.error(`❌ Failed to delete channel ${id}:`, err);
      return reply.status(500).send({ error: 'Failed to delete channel' });
    }
  });
}
