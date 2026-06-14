import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../config/database';
import { MercadoPagoService } from '../services/mercadopago.service';
import { BookingNotificationService } from '../services/booking-notification.service';
import crypto from 'crypto';

export async function mercadopagoWebhookRoutes(app: FastifyInstance) {
  app.post('/mercadopago/:tenantId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = request.params as { tenantId: string };
    const body = request.body as any;

    try {
      const topic = body?.type || body?.topic || request.query;
      const paymentId = body?.data?.id || (request.query as any)?.['data.id'];

      if (!paymentId) {
        return reply.send({ received: true });
      }

      const payment = await MercadoPagoService.getPayment(tenantId, String(paymentId));
      const appointmentId = payment?.external_reference;
      const status = payment?.status;

      if (!appointmentId) return reply.send({ received: true });

      const appointment = await prisma.appointment.findFirst({
        where: { id: appointmentId, tenantId },
        include: { service: true },
      });
      if (!appointment) return reply.send({ received: true });

      if (status === 'approved') {
        const paid = Number(payment.transaction_amount || 0);
        const balance = Math.max(0, Number(appointment.finalPrice) - paid);

        await prisma.appointment.update({
          where: { id: appointment.id },
          data: {
            status: 'confirmado',
            mpPaymentId: String(paymentId),
            mpStatus: status,
            amountPaid: paid,
            balanceDue: balance,
            confirmedAt: new Date(),
            receiptToken: appointment.receiptToken || crypto.randomBytes(16).toString('hex'),
          },
        });

        await BookingNotificationService.sendPaymentConfirmation(appointment.id);
      } else {
        await prisma.appointment.update({
          where: { id: appointment.id },
          data: { mpPaymentId: String(paymentId), mpStatus: status },
        });
      }
    } catch (err: any) {
      console.error('⚠️ MP webhook error:', err.message);
    }

    return reply.send({ received: true });
  });
}
