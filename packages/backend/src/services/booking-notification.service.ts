import { prisma } from '../config/database';
import { WhatsAppService } from './whatsapp.service';
import { ConversationService } from './conversation.service';

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
        conversation: { include: { channel: true } },
        lead: true,
      },
    });
    if (!appointment?.conversation?.channel) return;

    const settings = await prisma.bookingSettings.findUnique({
      where: { tenantId: appointment.tenantId },
    });
    const messages = (settings?.messagesJson || {}) as Record<string, string>;
    const template = messages.confirmation || 'Listo, tu turno quedó confirmado 🌿';

    const text = `${template}

Camino: ${appointment.service.name}
Día y horario: ${appointment.appointmentDate.toISOString().slice(0, 10)} — ${appointment.appointmentTime}
Seña abonada: $${Number(appointment.amountPaid).toLocaleString('es-AR')}
Saldo pendiente: $${Number(appointment.balanceDue).toLocaleString('es-AR')}`;

    const phoneNumberId = appointment.conversation.channel.phoneNumberId;
    const to = appointment.customerPhone;

    try {
      const providerMessageId = await WhatsAppService.sendTextMessage({
        phoneNumberId,
        to,
        text,
      });
      await ConversationService.saveOutgoingMessage(
        appointment.conversationId!,
        text,
        providerMessageId,
      );

      if (appointment.conversationId) {
        await prisma.conversation.update({
          where: { id: appointment.conversationId },
          data: { bookingFlowJson: { state: 'confirmed' } as any },
        });
      }
    } catch (err: any) {
      console.error('⚠️ Failed to send booking confirmation WhatsApp:', err.message);
    }
  }
}
