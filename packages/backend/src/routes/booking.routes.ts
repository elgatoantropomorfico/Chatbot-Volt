import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database';
import { requireRole } from '../middleware/roles';
import { BookingAvailabilityService } from '../services/booking-availability.service';
import { BookingPricingService } from '../services/booking-pricing.service';
import { WhatsAppService } from '../services/whatsapp.service';
import { MercadoPagoService } from '../services/mercadopago.service';
import { BookingNotificationService } from '../services/booking-notification.service';
import { BookingSalesService } from '../services/booking-sales.service';
import { AppointmentStatusHistoryService } from '../services/appointment-status-history.service';
import { accountingForStatus } from '../services/appointment-accounting.service';

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
  cancelEnabled: z.boolean().optional(),
  confirmNotifyEnabled: z.boolean().optional(),
  confirmNotifyEmail: z.string().email().nullable().optional(),
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

const appointmentCreateSchema = z.object({
  serviceId: z.string().min(1),
  appointmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  appointmentTime: z.string().regex(/^\d{2}:\d{2}$/),
  customerName: z.string().min(1),
  customerPhone: z.string().min(8),
  status: z.enum([
    'pendiente_datos', 'pendiente_pago', 'senado', 'confirmado', 'cancelado',
    'reprogramado', 'completado', 'no_asistio', 'vencido',
  ]).default('confirmado'),
  customerNotes: z.string().nullable().optional(),
  amountPaid: z.number().min(0).optional(),
  finalPrice: z.number().positive().optional(),
});

const appointmentPatchSchema = z.object({
  status: z.enum([
    'pendiente_datos', 'pendiente_pago', 'senado', 'confirmado', 'cancelado',
    'reprogramado', 'completado', 'no_asistio', 'vencido',
  ]).optional(),
  customerName: z.string().nullable().optional(),
  appointmentDate: z.string().optional(),
  appointmentTime: z.string().optional(),
  customerNotes: z.string().nullable().optional(),
  amountPaid: z.number().min(0).optional(),
  finalPrice: z.number().positive().optional(),
  serviceId: z.string().optional(),
});

async function getOrCreateLeadForAppointment(
  tenantId: string,
  phone: string,
  name: string,
) {
  const cleanPhone = phone.replace(/\s/g, '');
  let lead = await prisma.lead.findFirst({
    where: { tenantId, phone: cleanPhone },
  });
  if (!lead) {
    const channel = await prisma.channel.findFirst({
      where: { tenantId, isActive: true },
    });
    lead = await prisma.lead.create({
      data: {
        tenantId,
        phone: cleanPhone,
        name,
        channelId: channel?.id,
      },
    });
  } else if (name && lead.name !== name) {
    lead = await prisma.lead.update({
      where: { id: lead.id },
      data: { name },
    });
  }
  return lead;
}

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
    if (q.from) {
      const fromStr = String(q.from).slice(0, 10);
      where.appointmentDate = { ...(where.appointmentDate || {}), gte: new Date(`${fromStr}T00:00:00.000Z`) };
    }
    if (q.to) {
      const toStr = String(q.to).slice(0, 10);
      where.appointmentDate = { ...(where.appointmentDate || {}), lte: new Date(`${toStr}T23:59:59.999Z`) };
    }
    if (q.leadId) where.leadId = q.leadId;

    const appointments = await prisma.appointment.findMany({
      where,
      include: { service: true, lead: { select: { id: true, name: true, phone: true } } },
      orderBy: [{ appointmentDate: 'asc' }, { appointmentTime: 'asc' }],
    });
    return reply.send({ appointments });
  });

  app.post('/appointments', {
    preHandler: [requireRole('superadmin', 'tenant_admin', 'agent')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = resolveTenantId(request.user, (request.body as any)?.tenantId);
    if (!tenantId) return reply.status(400).send({ error: 'tenantId required' });

    const body = appointmentCreateSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation failed', details: body.error.flatten() });

    const service = await prisma.bookingService.findFirst({
      where: { id: body.data.serviceId, tenantId, isActive: true },
    });
    if (!service) return reply.status(400).send({ error: 'Servicio no encontrado' });

    const pricing = body.data.finalPrice != null
      ? {
          listPrice: body.data.finalPrice,
          finalPrice: body.data.finalPrice,
          priceRuleId: null,
          discountLabel: null,
        }
      : await BookingPricingService.resolvePrice(tenantId, service.id);

    const settings = await prisma.bookingSettings.findUnique({ where: { tenantId } });
    const accounting = accountingForStatus({
      status: body.data.status,
      finalPrice: pricing.finalPrice,
      depositPercentage: settings?.depositPercentage ?? 50,
    });
    // amountPaid explícito solo si el estado no impone contabilidad fuerte
    const statusDriven = ['senado', 'confirmado', 'completado', 'pendiente_pago', 'pendiente_datos', 'vencido', 'cancelado', 'no_asistio', 'reprogramado'].includes(body.data.status);
    const amountPaid = statusDriven ? accounting.amountPaid : (body.data.amountPaid ?? accounting.amountPaid);
    const balanceDue = statusDriven ? accounting.balanceDue : Math.max(0, pricing.finalPrice - amountPaid);

    const lead = await getOrCreateLeadForAppointment(
      tenantId,
      body.data.customerPhone,
      body.data.customerName,
    );

    const appointment = await prisma.appointment.create({
      data: {
        tenantId,
        leadId: lead.id,
        conversationId: null,
        serviceId: service.id,
        customerName: body.data.customerName,
        customerPhone: lead.phone,
        appointmentDate: new Date(body.data.appointmentDate + 'T12:00:00'),
        appointmentTime: body.data.appointmentTime,
        status: body.data.status,
        listPrice: pricing.listPrice,
        finalPrice: pricing.finalPrice,
        priceRuleId: pricing.priceRuleId,
        discountLabel: pricing.discountLabel,
        amountTotal: pricing.finalPrice,
        amountPaid,
        balanceDue,
        paymentType: accounting.paymentType,
        customerNotes: body.data.customerNotes,
        confirmedAt: accounting.confirmedAt ?? undefined,
        completedAt: accounting.completedAt ?? undefined,
        cancelledAt: accounting.cancelledAt ?? undefined,
      },
      include: { service: true, lead: { select: { id: true, name: true, phone: true } } },
    });

    return reply.status(201).send({ appointment });
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
    preHandler: [requireRole('superadmin', 'tenant_admin', 'agent')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.appointment.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'Not found' });
    if (request.user.role === 'tenant_admin' && request.user.tenantId !== existing.tenantId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
    if (request.user.role === 'agent' && request.user.tenantId !== existing.tenantId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const body = appointmentPatchSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation failed' });

    const data: any = { ...body.data };
    if (data.appointmentDate) data.appointmentDate = new Date(data.appointmentDate + (data.appointmentDate.includes('T') ? '' : 'T12:00:00'));

    const finalPrice = data.finalPrice ?? Number(existing.finalPrice);
    if (data.finalPrice != null) {
      data.amountTotal = data.finalPrice;
      data.listPrice = data.finalPrice;
    }

    // Cambio de estado → contabilidad sincronizada (incluye revertir a estados inferiores)
    if (data.status && data.status !== existing.status) {
      const settings = await prisma.bookingSettings.findUnique({ where: { tenantId: existing.tenantId } });
      const accounting = accountingForStatus({
        status: data.status,
        finalPrice,
        depositPercentage: settings?.depositPercentage ?? 50,
      });
      data.amountPaid = accounting.amountPaid;
      data.balanceDue = accounting.balanceDue;
      data.amountTotal = accounting.amountTotal;
      data.paymentType = accounting.paymentType;
      if (accounting.confirmedAt !== undefined) data.confirmedAt = accounting.confirmedAt;
      if (accounting.completedAt !== undefined) data.completedAt = accounting.completedAt;
      if (accounting.cancelledAt !== undefined) data.cancelledAt = accounting.cancelledAt;
    } else if (data.finalPrice != null || data.amountPaid != null) {
      const amountPaid = data.amountPaid ?? Number(existing.amountPaid);
      data.balanceDue = Math.max(0, finalPrice - amountPaid);
    }

    const wasNotBooked = !['confirmado', 'senado'].includes(existing.status);
    const appointment = await prisma.appointment.update({
      where: { id },
      data,
      include: { service: true, lead: { select: { id: true, name: true, phone: true } } },
    });
    if (data.status && data.status !== existing.status) {
      const u = request.user as any;
      await AppointmentStatusHistoryService.record({
        appointmentId: id,
        fromStatus: existing.status,
        toStatus: data.status,
        source: 'admin',
        changedByUserId: u?.userId || u?.id || null,
        changedByName: u?.name || u?.email || 'Admin',
        note: `Estado → ${data.status} (contabilidad ajustada)`,
      });
    }
    if (
      data.status &&
      ['confirmado', 'senado'].includes(data.status) &&
      wasNotBooked &&
      appointment.conversationId
    ) {
      void BookingNotificationService.sendStaffConfirmationEmail(appointment.id);
    }
    return reply.send({ appointment });
  });

  // ── Ventas (agenda) ──
  app.get('/sales', {
    preHandler: [requireRole('superadmin', 'tenant_admin', 'agent')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as any;
    const tenantId = resolveTenantId(request.user, q.tenantId);
    if (!tenantId) return reply.status(400).send({ error: 'tenantId required' });

    const result = await BookingSalesService.list({
      tenantId,
      year: q.year ? Number(q.year) : undefined,
      month: q.month ? Number(q.month) : undefined,
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
      status: q.status,
      search: q.search,
      page: q.page ? Number(q.page) : 1,
      limit: q.limit ? Number(q.limit) : 20,
    });
    return reply.send(result);
  });

  app.get('/sales/stats', {
    preHandler: [requireRole('superadmin', 'tenant_admin', 'agent')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as any;
    const tenantId = resolveTenantId(request.user, q.tenantId);
    if (!tenantId) return reply.status(400).send({ error: 'tenantId required' });

    const stats = await BookingSalesService.stats({
      tenantId,
      year: q.year ? Number(q.year) : undefined,
      month: q.month ? Number(q.month) : undefined,
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
    });
    return reply.send({ stats });
  });

  app.post('/sales/:id/confirm-payment', {
    preHandler: [requireRole('superadmin', 'tenant_admin', 'agent')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const tenantId = resolveTenantId(request.user, (request.body as any)?.tenantId);
    if (!tenantId) return reply.status(400).send({ error: 'tenantId required' });
    try {
      const u = request.user as any;
      const sale = await BookingSalesService.confirmPayment({
        tenantId,
        appointmentId: id,
        userId: u?.userId || u?.id,
        userName: u?.name || u?.email || 'Admin',
      });
      return reply.send({ sale });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message || 'No se pudo confirmar el pago' });
    }
  });

  app.get('/appointments/:id/status-history', {
    preHandler: [requireRole('superadmin', 'tenant_admin', 'agent')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.appointment.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'Not found' });
    if (request.user.role !== 'superadmin' && request.user.tenantId !== existing.tenantId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
    const history = await AppointmentStatusHistoryService.list(id);
    return reply.send({ history });
  });

  app.delete('/appointments/:id', {
    preHandler: [requireRole('superadmin', 'tenant_admin', 'agent')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.appointment.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'Not found' });
    if (request.user.role !== 'superadmin' && request.user.tenantId !== existing.tenantId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    await prisma.appointment.delete({ where: { id } });
    return reply.send({ message: 'Turno eliminado' });
  });
}

async function resolveWhatsAppReturnUrl(tenantId: string, phoneNumberId?: string | null): Promise<string | null> {
  if (phoneNumberId) {
    const fromMeta = await WhatsAppService.getBusinessPhoneE164(phoneNumberId);
    if (fromMeta) return `https://wa.me/${fromMeta}`;
  }
  const bot = await prisma.botSettings.findUnique({ where: { tenantId } });
  if (bot?.handoffPhoneE164) {
    const digits = bot.handoffPhoneE164.replace(/\D/g, '');
    if (digits) return `https://wa.me/${digits}`;
  }
  return null;
}

function paymentReturnHtml(params: {
  tenantName: string;
  serviceName: string;
  date: string;
  time: string;
  waUrl: string | null;
}): string {
  const redirect = params.waUrl
    ? `<meta http-equiv="refresh" content="1;url=${params.waUrl}">`
    : '';
  const cta = params.waUrl
    ? `<a href="${params.waUrl}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#25D366;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Volver a WhatsApp</a>`
    : '<p style="color:#666;">Volvé a WhatsApp para ver la confirmación de tu turno.</p>';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  ${redirect}
  <title>Turno confirmado</title>
</head>
<body style="font-family:system-ui,sans-serif;max-width:420px;margin:40px auto;padding:0 20px;text-align:center;color:#1a1a1a;">
  <p style="font-size:48px;margin:0;">🌿</p>
  <h1 style="font-size:22px;margin:12px 0 8px;">¡Turno confirmado!</h1>
  <p style="color:#555;line-height:1.5;">
    <strong>${params.serviceName}</strong><br>
    ${params.date} — ${params.time}<br>
    ${params.tenantName}
  </p>
  ${params.waUrl ? '<p style="color:#888;font-size:14px;">Te redirigimos a WhatsApp…</p>' : ''}
  ${cta}
</body>
</html>`;
}

/** Public booking endpoints (no JWT) — registered outside auth in app.ts */
export async function bookingPublicRoutes(app: FastifyInstance) {
  async function loadAppointmentByReceipt(token: string) {
    return prisma.appointment.findUnique({
      where: { receiptToken: token },
      include: {
        service: true,
        tenant: { select: { name: true, timezone: true } },
        conversation: { include: { channel: true } },
      },
    });
  }

  app.get('/receipt/:token', async (request: FastifyRequest, reply: FastifyReply) => {
    const { token } = request.params as { token: string };
    const format = (request.query as { format?: string }).format;
    const appointment = await loadAppointmentByReceipt(token);
    if (!appointment) return reply.status(404).send({ error: 'Comprobante no encontrado' });

    if (format === 'json') {
      return reply.send({
        appointment: {
          id: appointment.id,
          status: appointment.status,
          customerName: appointment.customerName,
          appointmentDate: appointment.appointmentDate,
          appointmentTime: appointment.appointmentTime,
          amountPaid: appointment.amountPaid,
          balanceDue: appointment.balanceDue,
          service: appointment.service,
          tenant: appointment.tenant,
        },
      });
    }

    const waUrl = await resolveWhatsAppReturnUrl(
      appointment.tenantId,
      appointment.conversation?.channel?.phoneNumberId,
    );
    const date = appointment.appointmentDate.toISOString().slice(0, 10);
    return reply.type('text/html').send(paymentReturnHtml({
      tenantName: appointment.tenant.name,
      serviceName: appointment.service.name,
      date,
      time: appointment.appointmentTime,
      waUrl,
    }));
  });

  // Alias used by Mercado Pago back_urls — también confirma el pago si el webhook no llegó
  app.get('/payment-return/:token', async (request: FastifyRequest, reply: FastifyReply) => {
    const { token } = request.params as { token: string };
    const query = request.query as { payment_id?: string; collection_id?: string };
    const paymentId = query.payment_id || query.collection_id;

    if (paymentId) {
      const appointment = await loadAppointmentByReceipt(token);
      if (appointment) {
        try {
          await MercadoPagoService.processPaymentNotification(appointment.tenantId, paymentId);
        } catch (err: any) {
          console.error(`⚠️ payment-return MP fallback (${token}):`, err.message);
        }
      }
    }

    return reply.redirect(`/api/booking/receipt/${token}`);
  });
}
