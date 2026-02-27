import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database';
import { HandoffService } from '../services/handoff.service';
import { WhatsAppService } from '../services/whatsapp.service';
import { ConversationService } from '../services/conversation.service';

function getTenantFilter(user: any) {
  return user.role === 'superadmin' ? {} : { tenantId: user.tenantId! };
}

export async function conversationRoutes(app: FastifyInstance) {
  // List conversations (inbox)
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;
    const query = request.query as { status?: string; page?: string; limit?: string };
    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '20');
    const skip = (page - 1) * limit;

    const where: any = { ...getTenantFilter(user) };
    if (query.status) where.status = query.status;

    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        include: {
          lead: { select: { id: true, name: true, phone: true, stage: true } },
          channel: { select: { id: true, displayPhone: true } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.conversation.count({ where }),
    ]);

    return reply.send({ conversations, total, page, limit, totalPages: Math.ceil(total / limit) });
  });

  // Get conversation with messages
  app.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const conversation = await prisma.conversation.findUnique({
      where: { id: request.params.id },
      include: {
        lead: true,
        channel: true,
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!conversation) return reply.status(404).send({ error: 'Conversation not found' });

    const user = request.user;
    if (user.role !== 'superadmin' && conversation.tenantId !== user.tenantId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    return reply.send({ conversation });
  });

  // Handoff to human
  app.post('/:id/handoff', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const body = request.body as { reason?: string; customMessage?: string };

    try {
      const result = await HandoffService.executeHandoff(
        request.params.id,
        body.reason || 'Manual handoff from panel',
        body.customMessage,
      );
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Reactivate bot
  app.post('/:id/reactivate', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const conversation = await prisma.conversation.update({
      where: { id: request.params.id },
      data: { status: 'open' },
    });
    return reply.send({ conversation, message: 'Bot reactivated' });
  });

  // Close conversation
  app.post('/:id/close', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const conversation = await prisma.conversation.update({
      where: { id: request.params.id },
      data: { status: 'closed' },
    });
    return reply.send({ conversation, message: 'Conversation closed' });
  });

  // Send message as agent (auto-pauses AI)
  app.post('/:id/send', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { text } = request.body as { text: string };
    if (!text?.trim()) return reply.status(400).send({ error: 'Text is required' });

    const conversation = await prisma.conversation.findUnique({
      where: { id: request.params.id },
      include: { lead: true, channel: true },
    });

    if (!conversation) return reply.status(404).send({ error: 'Conversation not found' });

    const user = request.user;
    if (user.role !== 'superadmin' && conversation.tenantId !== user.tenantId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    // Send via WhatsApp
    let providerMessageId: string | null = null;
    try {
      providerMessageId = await WhatsAppService.sendTextMessage({
        phoneNumberId: conversation.channel.phoneNumberId,
        to: conversation.lead.phone,
        text: text.trim(),
      });
    } catch (err: any) {
      console.error('Agent send error:', err.message);
      return reply.status(500).send({ error: 'Failed to send WhatsApp message: ' + err.message });
    }

    // Save message as outgoing (agent)
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'out',
        text: text.trim(),
        providerMessageId,
      },
    });

    // Auto-pause AI when agent intervenes
    if (conversation.status === 'open') {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { status: 'pending_human', handoffReason: 'Agent intervention from panel' },
      });
    }

    return reply.send({ message, aiPaused: true });
  });

  // Toggle AI on/off for conversation
  app.post('/:id/toggle-ai', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { enabled } = request.body as { enabled: boolean };

    const conversation = await prisma.conversation.findUnique({
      where: { id: request.params.id },
    });

    if (!conversation) return reply.status(404).send({ error: 'Conversation not found' });

    const user = request.user;
    if (user.role !== 'superadmin' && conversation.tenantId !== user.tenantId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const newStatus = enabled ? 'open' : 'pending_human';
    const updated = await prisma.conversation.update({
      where: { id: request.params.id },
      data: {
        status: newStatus,
        handoffReason: enabled ? null : 'AI paused manually from panel',
      },
    });

    return reply.send({ conversation: updated, aiEnabled: enabled });
  });

  // Poll messages since timestamp (for real-time refresh)
  app.get('/:id/messages', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const query = request.query as { since?: string };
    const conversation = await prisma.conversation.findUnique({
      where: { id: request.params.id },
    });

    if (!conversation) return reply.status(404).send({ error: 'Conversation not found' });

    const user = request.user;
    if (user.role !== 'superadmin' && conversation.tenantId !== user.tenantId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const where: any = { conversationId: request.params.id };
    if (query.since) {
      where.createdAt = { gt: new Date(query.since) };
    }

    const messages = await prisma.message.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    return reply.send({ messages, status: conversation.status });
  });
}
