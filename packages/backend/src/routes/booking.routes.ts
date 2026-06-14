import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database';
import { requireRole } from '../middleware/roles';
import { BookingAvailabilityService } from '../services/booking-availability.service';

function resolveTenantId(user: any, queryTenantId?: string): string | null {
  if (user.role === 'superadmin' && queryTenantId) return queryTenantId;
  return user.tenantId ?? null;
}

const settingsUpdateSchema = z.object({
  bookingEnabled: z.boolean().optional(),
  bookingMode: z.string().optional(),
  sessionDurationMinutes: z.number().int().min(15).max(480).optional(),
  slotIntervalMinutes: z.number().int().min(15).max(480).optional(),
  bufferMinutes: z.number().int().min(0).max(120).optional(),
  timezone: z.string().optional(),
  currency: z.string().optional(),
  priceMode: z.string().optional(),
  basePrice: z.number().nullable().optional(),
  depositEnabled: z.boolean().optional(),
  depositPercentage: z.number().int().min(1).max(100).optional(),
  depositRefundable: z.boolean().optional(),
  allowFullPayment: z.boolean().optional(),
  paymentLinkExpirationMinutes: z.number().int().min(5).max(120).optional(),
  workingDaysJson: z.array(z.number().int().min(0).max(6)).optional(),
  cancellationPolicyJson: z.record(z.any()).optional(),
  messagesJson: z.record(z.any()).optional(),
  allowCustomSlots: z.boolean().optional(),
  allowCustomServices: z.boolean().optional(),
});

const serviceSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  serviceType: z.string().nullable().optional(),
  shortDescription: z.string().nullable().optional(),
  longDescription: z.string().nullable().optional(),
  durationMinutes: z.number().int().optional(),
  price: z.number().nullable().optional(),
  usesBasePrice: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  recommendationTags: z.array(z.string()).optional(),
  recommendedWhen: z.array(z.string()).optional(),
  botSummary: z.string().nullable().optional(),
  botRecommendationText: z.string().nullable().optional(),
});

const slotSchema = z.object({
  time: z.string().regex(/^\d{2}:\d{2}$/),
  durationMinutes: z.number().int().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const blockSchema = z.object({
  date: z.string(),
  time: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
});

const priceRuleSchema = z.object({
  label: z.string().min(1),
  ruleType: z.enum(['percentage_discount', 'fixed_price']),
  value: z.number().positive(),
  validFrom: z.string().datetime().nullable().optional(),
  validUntil: z.string().datetime().nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const appointmentPatchSchema = z.object({
  status: z.enum([
    'pendiente_datos', 'pendiente_pago', 'confirmado', 'cancelado',
    'reprogramado', 'completado', 'no_asistio', 'vencido',
  ]).optional(),
  customerName: z.string().nullable().optional(),
  appointmentDate: z.string().optional(),
  appointmentTime: z.string().optional(),
  customerNotes: z.string().nullable().optional(),
  amountPaid: z.number().optional(),
});

export async function bookingRoutes(app: FastifyInstance) {
  // ── Settings ──
  app.get('/settings', {
    preHandler: [requireRole('superadmin', 'tenant_admin', 'agent')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = resolveTenantId(request.user, (request.query as any).tenantId);
    if (!tenantId) return reply.status(400).send({ error: 'tenantId required' });

    let settings = await prisma.bookingSettings.findUnique({ where: { tenantId } });
    if (!settings) {
      settings = await prisma.bookingSettings.create({ data: { tenantId } });
    }
    return reply.send({ settings });
  });

  app.patch('/settings', {
    preHandler: [requireRole('superadmin', 'tenant_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = resolveTenantId(request.user, (request.query as any).tenantId);
    if (!tenantId) return reply.status(400).send({ error: 'tenantId required' });

    const body = settingsUpdateSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'Validation failed', details: body.error.flatten() });
    }

    const data: any = { ...body.data };
    if (data.basePrice !== undefined) {
      data.basePrice = data.basePrice;
    }

    const settings = await prisma.bookingSettings.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
    });
    return reply.send({ settings });
  });

  // ── Services ──
  app.get('/services', {
    preHandler: [requireRole('superadmin', 'tenant_admin', 'agent')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = resolveTenantId(request.user, (request.query as any).tenantId);
    if (!tenantId) return reply.status(400).send({ error: 'tenantId required' });

    const services = await prisma.bookingService.findMany({
      where: { tenantId },
      orderBy: { sortOrder: 'asc' },
    });
    return reply.send({ services });
  });

  app.post('/services', {
    preHandler: [requireRole('superadmin', 'tenant_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = resolveTenantId(request.user, (request.query as any).tenantId);
    if (!tenantId) return reply.status(400).send({ error: 'tenantId required' });

    const body = serviceSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'Validation failed', details: body.error.flatten() });
    }

    const service = await prisma.bookingService.create({
      data: {
        tenantId,
        ...body.data,
        recommendationTags: body.data.recommendationTags ?? [],
        recommendedWhen: body.data.recommendedWhen ?? [],
      },
    });
    return reply.status(201).send({ service });
  });

  app.patch('/services/:id', {
    preHandler: [requireRole('superadmin', 'tenant_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.bookingService.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'Not found' });

    const user = request.user;
    if (user.role === 'tenant_admin' && user.tenantId !== existing.tenantId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const body = serviceSchema.partial().safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'Validation failed', details: body.error.flatten() });
    }

    const service = await prisma.bookingService.update({ where: { id }, data: body.data });
    return reply.send({ service });
  });

  app.delete('/services/:id', {
    preHandler: [requireRole('superadmin', 'tenant_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.bookingService.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'Not found' });
    if (request.user.role === 'tenant_admin' && request.user.tenantId !== existing.tenantId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
    await prisma.bookingService.delete({ where: { id } });
    return reply.send({ message: 'Deleted' });
  });

  // ── Slots ──
  app.get('/slots', {
    preHandler: [requireRole('superadmin', 'tenant_admin', 'agent')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = resolveTenantId(request.user, (request.query as any).tenantId);
    if (!tenantId) return reply.status(400).send({ error: 'tenantId required' });

    const slots = await prisma.bookingSlot.findMany({
      where: { tenantId },
      orderBy: { sortOrder: 'asc' },
    });
    return reply.send({ slots });
  });

  app.post('/slots', {
    preHandler: [requireRole('superadmin', 'tenant_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = resolveTenantId(request.user, (request.query as any).tenantId);
    if (!tenantId) return reply.status(400).send({ error: 'tenantId required' });

    const body = slotSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'Validation failed', details: body.error.flatten() });
    }

    const slot = await prisma.bookingSlot.create({ data: { tenantId, ...body.data } });
    return reply.status(201).send({ slot });
  });

  app.patch('/slots/:id', {
    preHandler: [requireRole('superadmin', 'tenant_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.bookingSlot.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'Not found' });
    if (request.user.role === 'tenant_admin' && request.user.tenantId !== existing.tenantId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
    const body = slotSchema.partial().safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation failed' });
    const slot = await prisma.bookingSlot.update({ where: { id }, data: body.data });
    return reply.send({ slot });
  });

  app.delete('/slots/:id', {
    preHandler: [requireRole('superadmin', 'tenant_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.bookingSlot.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'Not found' });
    if (request.user.role === 'tenant_admin' && request.user.tenantId !== existing.tenantId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
    await prisma.bookingSlot.delete({ where: { id } });
    return reply.send({ message: 'Deleted' });
  });

  // ── Blocks ──
  app.get('/blocks', {
    preHandler: [requireRole('superadmin', 'tenant_admin', 'agent')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = resolveTenantId(request.user, (request.query as any).tenantId);
    if (!tenantId) return reply.status(400).send({ error: 'tenantId required' });

    const blocks = await prisma.bookingBlock.findMany({
      where: { tenantId },
      orderBy: { date: 'asc' },
    });
    return reply.send({ blocks });
  });

  app.post('/blocks', {
    preHandler: [requireRole('superadmin', 'tenant_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = resolveTenantId(request.user, (request.query as any).tenantId);
    if (!tenantId) return reply.status(400).send({ error: 'tenantId required' });

    const body = blockSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation failed' });

    const block = await prisma.bookingBlock.create({
      data: {
        tenantId,
        date: new Date(body.data.date),
        time: body.data.time ?? null,
        reason: body.data.reason ?? null,
      },
    });
    return reply.status(201).send({ block });
  });

  app.delete('/blocks/:id', {
    preHandler: [requireRole('superadmin', 'tenant_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.bookingBlock.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'Not found' });
    if (request.user.role === 'tenant_admin' && request.user.tenantId !== existing.tenantId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
    await prisma.bookingBlock.delete({ where: { id } });
    return reply.send({ message: 'Deleted' });
  });

  // ── Price rules ──
  app.get('/price-rules', {
    preHandler: [requireRole('superadmin', 'tenant_admin', 'agent')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = resolveTenantId(request.user, (request.query as any).tenantId);
    if (!tenantId) return reply.status(400).send({ error: 'tenantId required' });

    const rules = await prisma.bookingPriceRule.findMany({
      where: { tenantId },
      orderBy: { sortOrder: 'asc' },
    });
    return reply.send({ rules });
  });

  app.post('/price-rules', {
    preHandler: [requireRole('superadmin', 'tenant_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = resolveTenantId(request.user, (request.query as any).tenantId);
    if (!tenantId) return reply.status(400).send({ error: 'tenantId required' });

    const body = priceRuleSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation failed' });

    const rule = await prisma.bookingPriceRule.create({
      data: {
        tenantId,
        label: body.data.label,
        ruleType: body.data.ruleType,
        value: body.data.value,
        validFrom: body.data.validFrom ? new Date(body.data.validFrom) : null,
        validUntil: body.data.validUntil ? new Date(body.data.validUntil) : null,
        isActive: body.data.isActive ?? true,
        sortOrder: body.data.sortOrder ?? 0,
      },
    });
    return reply.status(201).send({ rule });
  });

  app.patch('/price-rules/:id', {
    preHandler: [requireRole('superadmin', 'tenant_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.bookingPriceRule.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'Not found' });
    if (request.user.role === 'tenant_admin' && request.user.tenantId !== existing.tenantId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
    const body = priceRuleSchema.partial().safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation failed' });
    const data: any = { ...body.data };
    if (data.validFrom !== undefined) data.validFrom = data.validFrom ? new Date(data.validFrom) : null;
    if (data.validUntil !== undefined) data.validUntil = data.validUntil ? new Date(data.validUntil) : null;
    const rule = await prisma.bookingPriceRule.update({ where: { id }, data });
    return reply.send({ rule });
  });

  app.delete('/price-rules/:id', {
    preHandler: [requireRole('superadmin', 'tenant_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.bookingPriceRule.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'Not found' });
    if (request.user.role === 'tenant_admin' && request.user.tenantId !== existing.tenantId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
    await prisma.bookingPriceRule.delete({ where: { id } });
    return reply.send({ message: 'Deleted' });
  });

  // ── Availability preview ──
  app.get('/availability', {
    preHandler: [requireRole('superadmin', 'tenant_admin', 'agent')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = resolveTenantId(request.user, (request.query as any).tenantId);
    if (!tenantId) return reply.status(400).send({ error: 'tenantId required' });
    const limit = Number((request.query as any).limit) || 5;

    const slots = await BookingAvailabilityService.getAvailableSlots(tenantId, { limit });
    return reply.send({ slots });
  });

  // ── Appointments ──
  app.get('/appointments', {
    preHandler: [requireRole('superadmin', 'tenant_admin', 'agent')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = resolveTenantId(request.user, (request.query as any).tenantId);
    if (!tenantId) return reply.status(400).send({ error: 'tenantId required' });

    const q = request.query as any;
    const where: any = { tenantId };
    if (q.status) where.status = q.status;
    if (q.from) where.appointmentDate = { gte: new Date(q.from) };
    if (q.to) {
      where.appointmentDate = { ...(where.appointmentDate || {}), lte: new Date(q.to) };
    }
    if (q.leadId) where.leadId = q.leadId;

    const appointments = await prisma.appointment.findMany({
      where,
      include: { service: true, lead: { select: { id: true, name: true, phone: true } } },
      orderBy: [{ appointmentDate: 'asc' }, { appointmentTime: 'asc' }],
    });
    return reply.send({ appointments });
  });

  app.get('/appointments/:id', {
    preHandler: [requireRole('superadmin', 'tenant_admin', 'agent')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: { service: true, lead: true, priceRule: true },
    });
    if (!appointment) return reply.status(404).send({ error: 'Not found' });
    if (request.user.role === 'tenant_admin' && request.user.tenantId !== appointment.tenantId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
    return reply.send({ appointment });
  });

  app.patch('/appointments/:id', {
    preHandler: [requireRole('superadmin', 'tenant_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.appointment.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'Not found' });
    if (request.user.role === 'tenant_admin' && request.user.tenantId !== existing.tenantId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const body = appointmentPatchSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation failed' });

    const data: any = { ...body.data };
    if (data.appointmentDate) data.appointmentDate = new Date(data.appointmentDate);
    if (data.status === 'confirmado' && !existing.confirmedAt) data.confirmedAt = new Date();
    if (data.status === 'cancelado' && !existing.cancelledAt) data.cancelledAt = new Date();
    if (data.status === 'completado' && !existing.completedAt) data.completedAt = new Date();

    const appointment = await prisma.appointment.update({
      where: { id },
      data,
      include: { service: true },
    });
    return reply.send({ appointment });
  });

  // Public receipt by token (no auth)
  app.get('/receipt/:token', async (request: FastifyRequest, reply: FastifyReply) => {
    const { token } = request.params as { token: string };
    const appointment = await prisma.appointment.findUnique({
      where: { receiptToken: token },
      include: { service: true, tenant: { select: { name: true, timezone: true } } },
    });
    if (!appointment) return reply.status(404).send({ error: 'Comprobante no encontrado' });
    return reply.send({ appointment });
  });
}
