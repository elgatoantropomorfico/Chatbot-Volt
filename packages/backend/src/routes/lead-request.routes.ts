import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database';
import { requireRole } from '../middleware/roles';
import { R2Service } from '../services/r2.service';
import { LeadRequestService } from '../services/lead-request.service';

const createRequestSchema = z.object({
  label: z.string().optional(),
});

const updateRequestSchema = z.object({
  status: z.enum(['in_progress', 'completed', 'cancelled']).optional(),
  data: z.record(z.any()).optional(),
  label: z.string().nullable().optional(),
});

async function loadLeadOr403(leadId: string, user: any, reply: FastifyReply) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) {
    reply.status(404).send({ error: 'Lead not found' });
    return null;
  }
  if (user.role !== 'superadmin' && lead.tenantId !== user.tenantId) {
    reply.status(403).send({ error: 'Forbidden' });
    return null;
  }
  return lead;
}

export async function leadRequestRoutes(app: FastifyInstance) {
  // List all requests of a lead, with their photos.
  app.get('/leads/:leadId/requests', async (request: FastifyRequest<{ Params: { leadId: string } }>, reply: FastifyReply) => {
    const lead = await loadLeadOr403(request.params.leadId, request.user, reply);
    if (!lead) return;

    const requests = await LeadRequestService.listByLead(lead.id);
    return reply.send({ requests });
  });

  // Create a new request manually from the dashboard.
  app.post('/leads/:leadId/requests', {
    preHandler: [requireRole('superadmin', 'tenant_admin', 'agent')],
  }, async (request: FastifyRequest<{ Params: { leadId: string } }>, reply: FastifyReply) => {
    const lead = await loadLeadOr403(request.params.leadId, request.user, reply);
    if (!lead) return;

    const body = createRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'Validation failed', details: body.error.flatten() });
    }

    const created = await (prisma as any).leadRequest.create({
      data: {
        leadId: lead.id,
        tenantId: lead.tenantId,
        status: 'in_progress',
        data: {},
        label: body.data.label || null,
      },
    });
    return reply.status(201).send({ request: created });
  });

  // Update fields / status / label of a request.
  app.patch('/leads/:leadId/requests/:requestId', {
    preHandler: [requireRole('superadmin', 'tenant_admin', 'agent')],
  }, async (request: FastifyRequest<{ Params: { leadId: string; requestId: string } }>, reply: FastifyReply) => {
    const lead = await loadLeadOr403(request.params.leadId, request.user, reply);
    if (!lead) return;

    const body = updateRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'Validation failed', details: body.error.flatten() });
    }

    const existing = await (prisma as any).leadRequest.findUnique({
      where: { id: request.params.requestId },
    });
    if (!existing || existing.leadId !== lead.id) {
      return reply.status(404).send({ error: 'Request not found' });
    }

    const patch: Record<string, any> = {};
    if (body.data.label !== undefined) patch.label = body.data.label;

    if (body.data.data !== undefined) {
      // Merge so partial PATCHes don't blow away unrelated fields.
      const merged = { ...((existing.data as Record<string, any>) || {}), ...body.data.data };
      // Strip empty strings/nulls to "clear" fields cleanly.
      for (const k of Object.keys(merged)) {
        const v = merged[k];
        if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) {
          delete merged[k];
        }
      }
      patch.data = merged;
    }

    if (body.data.status !== undefined) {
      patch.status = body.data.status;
      if (body.data.status === 'completed') {
        patch.completedAt = new Date();
      } else if (body.data.status !== 'completed') {
        patch.completedAt = null;
      }
    }

    const updated = await (prisma as any).leadRequest.update({
      where: { id: existing.id },
      data: patch,
      include: { photos: { orderBy: { createdAt: 'asc' } } },
    });
    return reply.send({ request: updated });
  });

  // Delete a single request: cascade DB rows + wipe its R2 objects.
  app.delete('/leads/:leadId/requests/:requestId', {
    preHandler: [requireRole('superadmin', 'tenant_admin')],
  }, async (request: FastifyRequest<{ Params: { leadId: string; requestId: string } }>, reply: FastifyReply) => {
    const lead = await loadLeadOr403(request.params.leadId, request.user, reply);
    if (!lead) return;

    const existing = await (prisma as any).leadRequest.findUnique({
      where: { id: request.params.requestId },
      include: { photos: true },
    });
    if (!existing || existing.leadId !== lead.id) {
      return reply.status(404).send({ error: 'Request not found' });
    }

    // R2 cleanup: keys are `{tenantId}/{leadId}/{requestId}/...` for objects
    // uploaded after the multi-request migration. Older photos might live at
    // `{tenantId}/{leadId}/...` instead — fall back to deleting each photo
    // by URL for backward compatibility.
    try {
      await R2Service.deleteByPrefix(`${lead.tenantId}/${lead.id}/${existing.id}/`);
      for (const p of existing.photos as any[]) {
        if (p?.url) await R2Service.deleteByUrl(p.url);
      }
    } catch (err) {
      console.warn(`⚠️ R2 cleanup partial failure for request ${existing.id}:`, err);
    }

    await (prisma as any).leadRequest.delete({ where: { id: existing.id } });
    console.log(`🗑️ Deleted LeadRequest ${existing.id}`);
    return reply.send({ message: 'Request deleted successfully' });
  });
}
