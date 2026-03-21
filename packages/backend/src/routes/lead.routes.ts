import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database';
import { requireRole } from '../middleware/roles';
import { ZohoSyncService } from '../services/zoho-sync.service';

const updateLeadSchema = z.object({
  name: z.string().optional(),
  stage: z.enum(['nuevo', 'contactado', 'interesado', 'venta', 'perdido']).optional(),
  assignedUserId: z.string().nullable().optional(),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  dni: z.string().nullable().optional(),
  offerInterest: z.string().nullable().optional(),
  modalityInterest: z.string().nullable().optional(),
  periodInterest: z.string().nullable().optional(),
});

const createNoteSchema = z.object({
  content: z.string().min(1),
});

function getTenantFilter(user: any) {
  return user.role === 'superadmin' ? {} : { tenantId: user.tenantId! };
}

export async function leadRoutes(app: FastifyInstance) {
  // List leads
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;
    const query = request.query as { stage?: string; search?: string; page?: string; limit?: string };
    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '20');
    const skip = (page - 1) * limit;

    const where: any = { ...getTenantFilter(user) };
    if (query.stage) where.stage = query.stage;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search } },
      ];
    }

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        include: {
          assignedUser: { select: { id: true, email: true } },
          channel: { select: { id: true, displayPhone: true } },
          _count: { select: { conversations: true, notes: true } },
        },
        orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
        skip,
        take: limit,
      }),
      prisma.lead.count({ where }),
    ]);

    return reply.send({ leads, total, page, limit, totalPages: Math.ceil(total / limit) });
  });

  // Get single lead with notes and recent conversations
  app.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const user = request.user;
    const lead = await prisma.lead.findUnique({
      where: { id: request.params.id },
      include: {
        assignedUser: { select: { id: true, email: true } },
        channel: { select: { id: true, displayPhone: true, phoneNumberId: true } },
        notes: { orderBy: { createdAt: 'desc' }, take: 20 },
        conversations: {
          orderBy: { updatedAt: 'desc' },
          take: 5,
          include: { _count: { select: { messages: true } } },
        },
      },
    });

    if (!lead) return reply.status(404).send({ error: 'Lead not found' });
    if (user.role !== 'superadmin' && lead.tenantId !== user.tenantId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    return reply.send({ lead });
  });

  // Update lead
  app.patch('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const body = updateLeadSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'Validation failed', details: body.error.flatten() });
    }

    const lead = await prisma.lead.update({
      where: { id: request.params.id },
      data: body.data,
    });
    return reply.send({ lead });
  });

  // Add note to lead
  app.post('/:id/notes', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const body = createNoteSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'Validation failed', details: body.error.flatten() });
    }

    const note = await prisma.leadNote.create({
      data: {
        leadId: request.params.id,
        authorId: request.user.userId,
        content: body.data.content,
      },
    });
    return reply.status(201).send({ note });
  });

  // Delete lead (cascade: conversations, messages, notes)
  app.delete('/:id', {
    preHandler: [requireRole('superadmin', 'tenant_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const lead = await prisma.lead.findUnique({ where: { id } });
    if (!lead) return reply.status(404).send({ error: 'Lead not found' });

    const user = request.user;
    if (user.role !== 'superadmin' && lead.tenantId !== user.tenantId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    await prisma.lead.delete({ where: { id } });
    console.log(`🗑️ Deleted lead ${id} and all related records`);

    return reply.send({ message: 'Lead deleted successfully' });
  });

  // Manual Zoho sync for a lead
  app.post('/:id/sync-zoho', {
    preHandler: [requireRole('superadmin', 'tenant_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const lead = await prisma.lead.findUnique({ where: { id } });
    if (!lead) return reply.status(404).send({ error: 'Lead not found' });

    const user = request.user;
    if (user.role !== 'superadmin' && lead.tenantId !== user.tenantId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    try {
      const result = await ZohoSyncService.syncLeadToZoho(lead.id, lead.tenantId);
      return reply.send({ message: `Lead ${result.action} in Zoho`, zohoContactId: result.zohoContactId });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
}
