import { prisma } from '../config/database';
import { AppointmentStatusHistoryService } from './appointment-status-history.service';
import type { AppointmentStatus } from '@prisma/client';

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'object' && v !== null && 'toNumber' in (v as object)) {
    return (v as { toNumber: () => number }).toNumber();
  }
  return Number(v);
}

function monthBounds(year: number, month: number): { from: Date; to: Date } {
  const from = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const to = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { from, to };
}

function parseYmd(s: string): Date {
  return new Date(`${s.slice(0, 10)}T12:00:00.000Z`);
}

/** Cobro mostrado en UI de ventas */
export function paymentBadge(apt: {
  status: string;
  paymentType?: string | null;
  amountPaid?: unknown;
  finalPrice?: unknown;
  balanceDue?: unknown;
}): { key: string; label: string } {
  const paid = toNum(apt.amountPaid);
  const total = toNum(apt.finalPrice);
  const balance = toNum(apt.balanceDue);

  if (apt.status === 'completado' || (total > 0 && paid >= total - 0.5)) {
    return { key: 'paid_100', label: 'Cobrado 100%' };
  }
  if (apt.paymentType === 'total' && paid > 0) {
    return { key: 'paid_100', label: 'Cobrado 100%' };
  }
  if (apt.paymentType === 'sena' && paid > 0) {
    return { key: 'paid_50', label: 'Cobrado 50% (seña)' };
  }
  if (paid > 0 && balance > 0) {
    const pct = total > 0 ? Math.round((paid / total) * 100) : 0;
    return { key: 'paid_partial', label: `Cobrado ${pct}%` };
  }
  if (apt.status === 'confirmado') {
    return { key: 'confirmed', label: 'Confirmado' };
  }
  if (apt.status === 'pendiente_pago') {
    return { key: 'pending', label: 'Pendiente de pago' };
  }
  if (apt.status === 'vencido') return { key: 'expired', label: 'Vencido' };
  if (apt.status === 'cancelado') return { key: 'cancelled', label: 'Cancelado' };
  if (apt.status === 'no_asistio') return { key: 'noshow', label: 'No asistió' };
  return { key: 'other', label: apt.status };
}

export class BookingSalesService {
  static async list(params: {
    tenantId: string;
    year?: number;
    month?: number;
    dateFrom?: string;
    dateTo?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(50, Math.max(1, params.limit || 20));
    const where: any = { tenantId: params.tenantId };

    if (params.dateFrom || params.dateTo) {
      where.appointmentDate = {};
      if (params.dateFrom) where.appointmentDate.gte = parseYmd(params.dateFrom);
      if (params.dateTo) where.appointmentDate.lte = parseYmd(params.dateTo);
    } else if (params.year && params.month) {
      const { from, to } = monthBounds(params.year, params.month);
      where.appointmentDate = { gte: from, lte: to };
    } else {
      const now = new Date();
      const { from, to } = monthBounds(now.getUTCFullYear(), now.getUTCMonth() + 1);
      where.appointmentDate = { gte: from, lte: to };
    }

    if (params.status) where.status = params.status as AppointmentStatus;

    if (params.search?.trim()) {
      const q = params.search.trim();
      where.OR = [
        { customerName: { contains: q, mode: 'insensitive' } },
        { customerPhone: { contains: q } },
        { service: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [total, rows] = await Promise.all([
      prisma.appointment.count({ where }),
      prisma.appointment.findMany({
        where,
        include: {
          service: { select: { id: true, name: true } },
          lead: { select: { id: true, name: true, phone: true } },
        },
        orderBy: [{ appointmentDate: 'desc' }, { appointmentTime: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const sales = rows.map((a) => ({
      ...a,
      listPrice: toNum(a.listPrice),
      finalPrice: toNum(a.finalPrice),
      amountTotal: toNum(a.amountTotal),
      amountPaid: toNum(a.amountPaid),
      balanceDue: toNum(a.balanceDue),
      payment: paymentBadge(a),
      canConfirmPayment: !['completado', 'cancelado', 'vencido'].includes(a.status),
    }));

    return {
      sales,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  static async stats(params: {
    tenantId: string;
    year?: number;
    month?: number;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const where: any = {
      tenantId: params.tenantId,
      status: { in: ['confirmado', 'completado'] as AppointmentStatus[] },
    };

    if (params.dateFrom || params.dateTo) {
      where.appointmentDate = {};
      if (params.dateFrom) where.appointmentDate.gte = parseYmd(params.dateFrom);
      if (params.dateTo) where.appointmentDate.lte = parseYmd(params.dateTo);
    } else if (params.year && params.month) {
      const { from, to } = monthBounds(params.year, params.month);
      where.appointmentDate = { gte: from, lte: to };
    } else {
      const now = new Date();
      const { from, to } = monthBounds(now.getUTCFullYear(), now.getUTCMonth() + 1);
      where.appointmentDate = { gte: from, lte: to };
    }

    const rows = await prisma.appointment.findMany({
      where,
      select: {
        status: true,
        amountPaid: true,
        finalPrice: true,
        paymentType: true,
        balanceDue: true,
      },
    });

    let revenue = 0;
    let paid50 = 0;
    let paid100 = 0;
    let confirmed = 0;
    let completed = 0;

    for (const r of rows) {
      revenue += toNum(r.amountPaid);
      const badge = paymentBadge(r);
      if (badge.key === 'paid_50' || badge.key === 'paid_partial') paid50 += 1;
      if (badge.key === 'paid_100') paid100 += 1;
      if (r.status === 'confirmado') confirmed += 1;
      if (r.status === 'completado') completed += 1;
    }

    return {
      totalSales: rows.length,
      revenue,
      paid50,
      paid100,
      confirmed,
      completed,
    };
  }

  /** Confirma el pago restante y pasa a completado */
  static async confirmPayment(params: {
    tenantId: string;
    appointmentId: string;
    userId?: string;
    userName?: string;
  }) {
    const existing = await prisma.appointment.findFirst({
      where: { id: params.appointmentId, tenantId: params.tenantId },
    });
    if (!existing) throw new Error('Turno no encontrado');
    if (['completado', 'cancelado', 'vencido'].includes(existing.status)) {
      throw new Error('Este turno no admite confirmar pago');
    }

    const finalPrice = toNum(existing.finalPrice);
    const now = new Date();
    const appointment = await prisma.appointment.update({
      where: { id: existing.id },
      data: {
        status: 'completado',
        amountPaid: finalPrice,
        balanceDue: 0,
        amountTotal: finalPrice,
        completedAt: now,
        confirmedAt: existing.confirmedAt || now,
      },
      include: {
        service: { select: { id: true, name: true } },
        lead: { select: { id: true, name: true, phone: true } },
      },
    });

    await AppointmentStatusHistoryService.record({
      appointmentId: existing.id,
      fromStatus: existing.status,
      toStatus: 'completado',
      source: 'admin',
      changedByUserId: params.userId,
      changedByName: params.userName,
      note: 'Pago confirmado manualmente → completado',
    });

    return {
      ...appointment,
      listPrice: toNum(appointment.listPrice),
      finalPrice: toNum(appointment.finalPrice),
      amountTotal: toNum(appointment.amountTotal),
      amountPaid: toNum(appointment.amountPaid),
      balanceDue: toNum(appointment.balanceDue),
      payment: paymentBadge(appointment),
      canConfirmPayment: false,
    };
  }

  /**
   * confirmado cuya fecha/hora ya pasó → completado.
   * Usa timezone del tenant (default AR).
   */
  static async autoCompletePastConfirmed(tenantId?: string): Promise<number> {
    const where: any = { status: 'confirmado' };
    if (tenantId) where.tenantId = tenantId;

    const candidates = await prisma.appointment.findMany({
      where,
      select: {
        id: true,
        tenantId: true,
        status: true,
        appointmentDate: true,
        appointmentTime: true,
      },
      take: 200,
    });
    if (!candidates.length) return 0;

    const settingsByTenant = new Map<string, string>();
    const tenantIds = [...new Set(candidates.map((c) => c.tenantId))];
    const settings = await prisma.bookingSettings.findMany({
      where: { tenantId: { in: tenantIds } },
      select: { tenantId: true, timezone: true },
    });
    for (const s of settings) {
      settingsByTenant.set(s.tenantId, s.timezone || 'America/Argentina/Cordoba');
    }

    const now = new Date();
    let updated = 0;

    for (const apt of candidates) {
      const tz = settingsByTenant.get(apt.tenantId) || 'America/Argentina/Cordoba';
      const ymd = apt.appointmentDate.toISOString().slice(0, 10);
      const time = (apt.appointmentTime || '00:00').slice(0, 5);
      // Comparar instante local del turno vs ahora
      const endLocal = this.zonedDateTimeToUtc(ymd, time, tz);
      if (!endLocal || endLocal > now) continue;

      await prisma.appointment.update({
        where: { id: apt.id },
        data: { status: 'completado', completedAt: now },
      });
      await AppointmentStatusHistoryService.record({
        appointmentId: apt.id,
        fromStatus: 'confirmado',
        toStatus: 'completado',
        source: 'system',
        changedByName: 'Sistema',
        note: 'Auto-completado: pasó la hora del turno',
      });
      updated += 1;
    }

    if (updated) console.log(`✅ Auto-completados ${updated} turno(s) confirmados vencidos`);
    return updated;
  }

  /** Interpreta YYYY-MM-DD + HH:MM en una zona como Date UTC aproximada */
  private static zonedDateTimeToUtc(ymd: string, hm: string, timeZone: string): Date | null {
    try {
      const [y, m, d] = ymd.split('-').map(Number);
      const [hh, mm] = hm.split(':').map(Number);
      // Construir como si fuera UTC y corregir con offset de la zona
      const probe = new Date(Date.UTC(y, m - 1, d, hh, mm || 0, 0));
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      const parts = fmt.formatToParts(probe);
      const get = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0);
      const asLocal = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
      const offset = asLocal - probe.getTime();
      return new Date(probe.getTime() - offset);
    } catch {
      return null;
    }
  }
}
