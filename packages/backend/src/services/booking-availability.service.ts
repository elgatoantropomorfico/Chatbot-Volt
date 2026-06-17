import { prisma } from '../config/database';
import { AppointmentStatus } from '@prisma/client';

export interface AvailableSlot {
  date: string;
  time: string;
  label: string;
  dateObj: Date;
}

const OCCUPYING_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.confirmado,
  AppointmentStatus.pendiente_pago,
  AppointmentStatus.pendiente_datos,
];

function formatDateLabel(date: Date, time: string, timezone: string): string {
  const now = new Date();
  const todayStr = date.toLocaleDateString('en-CA', { timeZone: timezone });
  const nowStr = now.toLocaleDateString('en-CA', { timeZone: timezone });
  const dayLabel = todayStr === nowStr
    ? 'Hoy'
    : date.toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: timezone });
  return `${dayLabel} — ${time}`;
}

function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export class BookingAvailabilityService {
  static async isBookingEnabled(tenantId: string): Promise<boolean> {
    const s = await prisma.bookingSettings.findUnique({ where: { tenantId } });
    return !!s?.bookingEnabled;
  }

  static async getAvailableSlots(
    tenantId: string,
    opts: { limit?: number; fromDate?: Date; serviceId?: string } = {},
  ): Promise<AvailableSlot[]> {
    const limit = opts.limit ?? 5;
    const settings = await prisma.bookingSettings.findUnique({ where: { tenantId } });
    if (!settings?.bookingEnabled) return [];

    const timezone = settings.timezone;
    const workingDays = (settings.workingDaysJson as number[]) || [1, 2, 3, 4, 5];

    const [slots, blocks, appointments] = await Promise.all([
      prisma.bookingSlot.findMany({
        where: { tenantId, isActive: true },
        orderBy: { sortOrder: 'asc' },
      }),
      prisma.bookingBlock.findMany({ where: { tenantId } }),
      prisma.appointment.findMany({
        where: {
          tenantId,
          status: { in: OCCUPYING_STATUSES },
        },
      }),
    ]);

    if (slots.length === 0) return [];

    const now = opts.fromDate ?? new Date();
    const results: AvailableSlot[] = [];

    for (let dayOffset = 0; dayOffset < 60 && results.length < limit; dayOffset++) {
      const candidate = new Date(now);
      candidate.setDate(candidate.getDate() + dayOffset);

      const weekday = candidate.toLocaleDateString('en-US', { weekday: 'short', timeZone: timezone });
      const weekdayMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };
      const dow = weekdayMap[weekday] ?? candidate.getDay();
      if (!workingDays.includes(dow)) continue;

      const dateStr = candidate.toLocaleDateString('en-CA', { timeZone: timezone });

      for (const slot of slots) {
        if (results.length >= limit) break;

        const slotMinutes = parseTimeToMinutes(slot.time);
        if (dayOffset === 0) {
          const nowMinutes = parseTimeToMinutes(
            now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone }),
          );
          if (slotMinutes <= nowMinutes) continue;
        }

        const blockedAllDay = blocks.some(
          (b) => b.date.toISOString().slice(0, 10) === dateStr && !b.time,
        );
        if (blockedAllDay) continue;

        const blockedSlot = blocks.some(
          (b) => b.date.toISOString().slice(0, 10) === dateStr && b.time === slot.time,
        );
        if (blockedSlot) continue;

        const occupied = appointments.some((a) => {
          const aDate = a.appointmentDate.toISOString().slice(0, 10);
          if (aDate !== dateStr || a.appointmentTime !== slot.time) return false;
          if (a.status === AppointmentStatus.pendiente_pago && a.holdExpiresAt && a.holdExpiresAt < new Date()) {
            return false;
          }
          return true;
        });
        if (occupied) continue;

        const dateObj = new Date(`${dateStr}T12:00:00`);
        results.push({
          date: dateStr,
          time: slot.time,
          label: formatDateLabel(dateObj, slot.time, timezone),
          dateObj,
        });
      }
    }

    return results;
  }

  /** Slots from today through end of current calendar week (Sunday) */
  static async getSlotsThisWeek(
    tenantId: string,
    opts: { serviceId?: string } = {},
  ): Promise<AvailableSlot[]> {
    const settings = await prisma.bookingSettings.findUnique({ where: { tenantId } });
    const timezone = settings?.timezone || 'America/Argentina/Cordoba';
    const now = new Date();
    const weekdayNum = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
      now.toLocaleDateString('en-US', { weekday: 'short', timeZone: timezone }),
    );
    const daysUntilSunday = weekdayNum === 0 ? 0 : 7 - weekdayNum;
    const end = new Date(now);
    end.setDate(end.getDate() + daysUntilSunday);
    const endStr = end.toLocaleDateString('en-CA', { timeZone: timezone });

    const all = await this.getAvailableSlots(tenantId, { limit: 80, serviceId: opts.serviceId });
    return all.filter((s) => s.date <= endStr).slice(0, 12);
  }

  /** Si el horario existe en la grilla pero está tomado/bloqueado, o no se ofrece ese día. */
  static async getSlotStatus(
    tenantId: string,
    dateStr: string,
    time: string,
  ): Promise<'available' | 'occupied' | 'not_offered'> {
    const open = await this.getAvailableSlots(tenantId, { limit: 120 });
    if (open.some((s) => s.date === dateStr && s.time === time)) return 'available';

    const settings = await prisma.bookingSettings.findUnique({ where: { tenantId } });
    if (!settings) return 'not_offered';

    const configured = await prisma.bookingSlot.findFirst({
      where: { tenantId, isActive: true, time },
    });
    if (!configured) return 'not_offered';

    const now = new Date();
    const occupying = await prisma.appointment.findFirst({
      where: {
        tenantId,
        appointmentDate: new Date(`${dateStr}T12:00:00`),
        appointmentTime: time,
        status: { in: OCCUPYING_STATUSES },
      },
    });
    if (occupying) {
      if (
        occupying.status === 'pendiente_pago'
        && occupying.holdExpiresAt
        && occupying.holdExpiresAt < now
      ) {
        return 'available';
      }
      return 'occupied';
    }

    return 'not_offered';
  }
}
