import { prisma } from '../config/database';
import { BookingAvailabilityService } from './booking-availability.service';
import { AppointmentStatusHistoryService } from './appointment-status-history.service';

const RESCHEDULABLE_STATUSES = ['confirmado', 'senado'] as const;

export type ReschedulableAppointment = {
  id: string;
  serviceId: string;
  serviceName: string;
  label: string;
  date: string;
  time: string;
};

export class BookingRescheduleService {
  static async listActive(params: {
    tenantId: string;
    leadId: string;
    timezone?: string;
  }): Promise<ReschedulableAppointment[]> {
    const tz = params.timezone || 'America/Argentina/Cordoba';
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: tz });

    const apts = await prisma.appointment.findMany({
      where: {
        tenantId: params.tenantId,
        leadId: params.leadId,
        status: { in: [...RESCHEDULABLE_STATUSES] },
        appointmentDate: { gte: new Date(`${todayStr}T00:00:00.000Z`) },
      },
      include: { service: { select: { id: true, name: true } } },
      orderBy: [{ appointmentDate: 'asc' }, { appointmentTime: 'asc' }],
      take: 8,
    });

    return apts.map((a) => {
      const day = a.appointmentDate.toLocaleDateString('es-AR', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        timeZone: tz,
      });
      return {
        id: a.id,
        serviceId: a.serviceId,
        serviceName: a.service.name,
        date: a.appointmentDate.toISOString().slice(0, 10),
        time: a.appointmentTime,
        label: `${a.service.name} — ${day} ${a.appointmentTime}`,
      };
    });
  }

  static async getAvailableSlotsForReschedule(params: {
    tenantId: string;
    appointmentId: string;
    limit?: number;
    fromDateStr?: string;
    toDateStr?: string;
  }) {
    return BookingAvailabilityService.getAvailableSlots(params.tenantId, {
      limit: params.limit ?? 5,
      fromDateStr: params.fromDateStr,
      toDateStr: params.toDateStr,
      excludeAppointmentId: params.appointmentId,
    });
  }

  /** Mueve el turno in place: misma fila, mismo cobro/estado; solo fecha/hora. */
  static async applyInPlace(params: {
    tenantId: string;
    leadId?: string | null;
    appointmentId: string;
    date: string;
    time: string;
    source?: 'bot' | 'admin';
    changedByUserId?: string | null;
    changedByName?: string | null;
  }) {
    const where: any = {
      id: params.appointmentId,
      tenantId: params.tenantId,
      status: { in: [...RESCHEDULABLE_STATUSES] },
    };
    if (params.leadId) where.leadId = params.leadId;

    const apt = await prisma.appointment.findFirst({
      where,
      include: { service: { select: { name: true } } },
    });
    if (!apt) {
      return { ok: false as const, error: 'Turno no encontrado o no se puede reprogramar' };
    }

    const status = await BookingAvailabilityService.getSlotStatus(
      params.tenantId,
      params.date,
      params.time,
      params.appointmentId,
    );
    if (status !== 'available') {
      return {
        ok: false as const,
        error: status === 'occupied'
          ? 'Ese horario ya no está libre. Elegí otro.'
          : 'Ese horario no se ofrece. Elegí uno de la lista.',
      };
    }

    const tz = 'America/Argentina/Cordoba';
    const settings = await prisma.bookingSettings.findUnique({ where: { tenantId: params.tenantId } });
    const timezone = settings?.timezone || tz;
    const oldDay = apt.appointmentDate.toLocaleDateString('es-AR', {
      weekday: 'short', day: '2-digit', month: '2-digit', timeZone: timezone,
    });
    const newDateObj = new Date(`${params.date}T12:00:00`);
    const newDay = newDateObj.toLocaleDateString('es-AR', {
      weekday: 'short', day: '2-digit', month: '2-digit', timeZone: timezone,
    });

    const updated = await prisma.appointment.update({
      where: { id: apt.id },
      data: {
        appointmentDate: new Date(`${params.date}T12:00:00`),
        appointmentTime: params.time,
      },
      include: { service: true, lead: { select: { id: true, name: true, phone: true } } },
    });

    const note = `Reprogramado: ${oldDay} ${apt.appointmentTime} → ${newDay} ${params.time}`;
    await AppointmentStatusHistoryService.record({
      appointmentId: apt.id,
      fromStatus: apt.status,
      toStatus: apt.status,
      source: params.source || 'bot',
      changedByUserId: params.changedByUserId,
      changedByName: params.changedByName,
      note,
      allowSameStatus: true,
    });

    return {
      ok: true as const,
      appointment: updated,
      oldLabel: `${apt.service.name} — ${oldDay} ${apt.appointmentTime}`,
      newLabel: `${apt.service.name} — ${newDay} ${params.time}`,
      note,
    };
  }
}
