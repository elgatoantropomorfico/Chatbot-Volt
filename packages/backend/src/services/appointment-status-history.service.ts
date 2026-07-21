import { prisma } from '../config/database';
import type { AppointmentStatus } from '@prisma/client';

export type StatusChangeSource = 'admin' | 'mp' | 'system' | 'bot';

export class AppointmentStatusHistoryService {
  static async record(params: {
    appointmentId: string;
    fromStatus: AppointmentStatus | string | null | undefined;
    toStatus: AppointmentStatus | string;
    source?: StatusChangeSource;
    changedByUserId?: string | null;
    changedByName?: string | null;
    note?: string | null;
  }): Promise<void> {
    if (!params.toStatus) return;
    if (params.fromStatus && params.fromStatus === params.toStatus) return;

    try {
      await prisma.appointmentStatusHistory.create({
        data: {
          appointmentId: params.appointmentId,
          fromStatus: (params.fromStatus as AppointmentStatus) || null,
          toStatus: params.toStatus as AppointmentStatus,
          source: params.source || 'system',
          changedByUserId: params.changedByUserId || null,
          changedByName: params.changedByName || null,
          note: params.note || null,
        },
      });
    } catch (err: any) {
      console.warn('⚠️ No se pudo guardar historial de estado:', err.message || err);
    }
  }

  static async list(appointmentId: string) {
    return prisma.appointmentStatusHistory.findMany({
      where: { appointmentId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
