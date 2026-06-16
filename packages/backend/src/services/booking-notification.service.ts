import { prisma } from '../config/database';
import { WhatsAppService } from './whatsapp.service';
import { ConversationService } from './conversation.service';
import { ResendService } from './resend.service';

export class BookingExpiryService {
  /** Mark expired pending-payment appointments and release slots */
  static async expireStaleHolds(tenantId?: string) {
    const now = new Date();
    const where: any = {
      status: 'pendiente_pago',
      holdExpiresAt: { lt: now },
    };
    if (tenantId) where.tenantId = tenantId;

    const expired = await prisma.appointment.updateMany({
      where,
      data: { status: 'vencido' },
    });
    if (expired.count > 0) {
      console.log(`⏱️ Expired ${expired.count} pending-payment appointment(s)`);
    }
    return expired.count;
  }
}

export class BookingNotificationService {
  static async sendPaymentConfirmation(appointmentId: string) {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        service: true,
        tenant: { select: { name: true } },
        conversation: { include: { channel: true } },
        lead: true,
      },
    });
    if (!appointment) {
      console.warn(`📧 Booking notify: turno ${appointmentId} no encontrado`);
      return;
    }

    const settings = await prisma.bookingSettings.findUnique({
      where: { tenantId: appointment.tenantId },
    });

    if (appointment.conversation?.channel) {
      const messages = (settings?.messagesJson || {}) as Record<string, string>;
      const template = messages.confirmation || 'Listo, tu turno quedó confirmado 🌿';
      const text = `${template}

Camino: ${appointment.service.name}
Día y horario: ${appointment.appointmentDate.toISOString().slice(0, 10)} — ${appointment.appointmentTime}
Seña abonada: $${Number(appointment.amountPaid).toLocaleString('es-AR')}
Saldo pendiente: $${Number(appointment.balanceDue).toLocaleString('es-AR')}`;

      try {
        const providerMessageId = await WhatsAppService.sendTextMessage({
          phoneNumberId: appointment.conversation.channel.phoneNumberId,
          to: appointment.customerPhone,
          text,
        });
        await ConversationService.saveOutgoingMessage(
          appointment.conversationId!,
          text,
          providerMessageId,
        );
      } catch (err: any) {
        console.error('⚠️ Failed to send booking confirmation WhatsApp:', err.message);
      }
    } else {
      console.warn(`📱 Booking WA skip: sin canal para turno ${appointmentId}`);
    }

    if (appointment.conversationId) {
      const existing = (appointment.conversation?.bookingFlowJson as Record<string, unknown>) || {};
      const dateStr = appointment.appointmentDate.toISOString().slice(0, 10);
      await prisma.conversation.update({
        where: { id: appointment.conversationId },
        data: {
          bookingFlowJson: {
            ...existing,
            state: 'confirmed',
            appointmentId: appointment.id,
            serviceId: appointment.serviceId,
            serviceName: appointment.service.name,
            slotDate: dateStr,
            slotTime: appointment.appointmentTime,
            slotLabel: `${dateStr} — ${appointment.appointmentTime}`,
            customerName: appointment.customerName ?? (existing as any).customerName,
            customerNotes: appointment.customerNotes ?? (existing as any).customerNotes,
          },
        },
      });
    }

    await this.sendStaffConfirmationEmail(appointmentId);
  }

  /** Email al equipo — solo turnos confirmados vía chatbot (conversationId presente). */
  static async sendStaffConfirmationEmail(appointmentId: string) {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        service: true,
        tenant: { select: { name: true } },
      },
    });
    if (!appointment) {
      console.warn(`📧 Booking email skip: turno ${appointmentId} no encontrado`);
      return;
    }
    if (!appointment.conversationId) {
      console.log(`📧 Booking email skip: turno ${appointmentId} sin conversationId (carga manual)`);
      return;
    }

    const booking = await prisma.bookingSettings.findUnique({
      where: { tenantId: appointment.tenantId },
    });
    if (!booking?.confirmNotifyEnabled) {
      console.log(`📧 Booking email skip: avisos desactivados (tenant ${appointment.tenantId})`);
      return;
    }
    if (!booking.confirmNotifyEmail?.trim()) {
      console.log(`📧 Booking email skip: sin confirmNotifyEmail (tenant ${appointment.tenantId})`);
      return;
    }

    const resendOk = await ResendService.getConfig(appointment.tenantId);
    if (!resendOk) {
      console.warn(`📧 Booking email skip: Resend no configurado/activo (tenant ${appointment.tenantId})`);
      return;
    }

    const dateStr = appointment.appointmentDate.toISOString().slice(0, 10);
    const fmt = (n: number) => `$${n.toLocaleString('es-AR')}`;
    const paymentLabel = appointment.paymentType === 'total' ? 'Pago total' : 'Seña';
    const firstTimeLabel = appointment.isFirstTime == null
      ? '—'
      : appointment.isFirstTime ? 'Sí (primera vez)' : 'No (ya vino antes)';

    const rows = [
      ['Cliente', appointment.customerName || '—'],
      ['WhatsApp', appointment.customerPhone],
      ['Camino', appointment.service.name],
      ['Fecha', dateStr],
      ['Horario', appointment.appointmentTime],
      ['Primera vez', firstTimeLabel],
      ['Tipo de pago', paymentLabel],
      ['Abonado', fmt(Number(appointment.amountPaid))],
      ['Saldo', fmt(Number(appointment.balanceDue))],
      ['Total sesión', fmt(Number(appointment.finalPrice))],
    ];
    if (appointment.customerNotes) {
      rows.push(['Notas del cliente', appointment.customerNotes]);
    }
    if (appointment.discountLabel) {
      rows.push(['Descuento', appointment.discountLabel]);
    }

    const tableRows = rows.map(([label, value]) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#666;font-size:13px;white-space:nowrap;">${label}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:14px;">${value}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html>
<html lang="es">
<body style="font-family:system-ui,sans-serif;background:#f5f5f7;margin:0;padding:24px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;border:1px solid #e5e5ea;">
    <p style="margin:0 0 4px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:0.5px;">Nuevo turno por chatbot</p>
    <h1 style="margin:0 0 20px;font-size:20px;color:#1a1a1a;">${appointment.tenant.name}</h1>
    <table style="width:100%;border-collapse:collapse;">${tableRows}</table>
    <p style="margin:20px 0 0;font-size:12px;color:#999;">Confirmado automáticamente vía WhatsApp + Mercado Pago.</p>
  </div>
</body>
</html>`;

    const to = booking.confirmNotifyEmail.trim();
    try {
      await ResendService.sendEmail({
        tenantId: appointment.tenantId,
        to,
        subject: `Turno confirmado — ${appointment.customerName || appointment.customerPhone} — ${dateStr}`,
        html,
      });
      console.log(`📧 Booking email enviado a ${to} (turno ${appointmentId})`);
    } catch (err: any) {
      console.error(`⚠️ Failed to send booking staff email to ${to}:`, err.message);
    }
  }
}
