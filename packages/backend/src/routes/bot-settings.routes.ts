import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database';
import { requireRole } from '../middleware/roles';

const updateBotSettingsSchema = z.object({
  systemPrompt: z.string().optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxContextMessages: z.number().min(1).max(50).optional(),
  handoffEnabled: z.boolean().optional(),
  handoffPhoneE164: z.string().nullable().optional(),
  handoffMessageTemplate: z.string().nullable().optional(),
  handoffTriggersJson: z.any().optional(),
});

export async function botSettingsRoutes(app: FastifyInstance) {
  // Get bot settings for tenant
  app.get('/:tenantId', async (request: FastifyRequest<{ Params: { tenantId: string } }>, reply: FastifyReply) => {
    const user = request.user;
    const { tenantId } = request.params;

    if (user.role !== 'superadmin' && user.tenantId !== tenantId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const settings = await prisma.botSettings.findUnique({ where: { tenantId } });
    if (!settings) return reply.status(404).send({ error: 'Bot settings not found' });
    return reply.send({ settings });
  });

  // Update bot settings
  app.patch('/:tenantId', {
    preHandler: [requireRole('superadmin', 'tenant_admin')],
  }, async (request: FastifyRequest<{ Params: { tenantId: string } }>, reply: FastifyReply) => {
    const user = request.user;
    const { tenantId } = request.params;

    if (user.role === 'tenant_admin' && user.tenantId !== tenantId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const body = updateBotSettingsSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'Validation failed', details: body.error.flatten() });
    }

    const settings = await prisma.botSettings.upsert({
      where: { tenantId },
      update: body.data,
      create: { tenantId, ...body.data },
    });

    return reply.send({ settings });
  });
}
