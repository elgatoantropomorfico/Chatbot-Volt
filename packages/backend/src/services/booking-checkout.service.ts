import { BookingFlowService, type FlowHandleResult } from './booking-flow.service';
import { BookingContextService, v1FlowFromCheckout } from './booking-context.service';
import { BookingExpiryService } from './booking-notification.service';
import { BookingPricingService } from './booking-pricing.service';
import { prisma } from '../config/database';

export class BookingCheckoutService {
  /** Solo muestra opciones de pago (sin interpretar el mensaje del usuario). */
  static async presentPaymentChoice(params: {
    tenantId: string;
    conversationId: string;
  }): Promise<FlowHandleResult> {
    const settings = await prisma.bookingSettings.findUnique({ where: { tenantId: params.tenantId } });
    if (!settings?.bookingEnabled) return { handled: false };

    const ctx = await BookingContextService.load(params.conversationId);
    if (!ctx.checkout || ctx.checkout.phase !== 'payment_choice') return { handled: false };

    const checkout = ctx.checkout;
    await BookingFlowService.saveFlow(params.conversationId, v1FlowFromCheckout(checkout));

    const pricing = await BookingPricingService.resolvePrice(params.tenantId, checkout.serviceId);
    const depositPct = settings.depositPercentage || 50;
    const policyShort = (settings.cancellationPolicyJson as any)?.policy_short_text
      || 'En caso de cancelación, la seña no es reembolsable.';

    const body = `Te dejo el resumen de tu turno:

Camino: ${checkout.serviceName}
Día y horario: ${checkout.slotLabel}
Valor de la sesión: $${pricing.finalPrice.toLocaleString('es-AR')}

Para confirmar se abona una seña del ${depositPct}%. También podés abonar el 100% ahora.

Importante: ${policyShort}

Elegí cómo querés pagar:`;

    const options = [`Señar ${depositPct}%`, 'Pagar 100%', 'Cambiar horario'];
    return BookingFlowService.buildOptionsReply(body, options, true);
  }

  static async handle(params: {
    tenantId: string;
    conversationId: string;
    leadId: string;
    phone: string;
    text: string;
    profileName?: string | null;
  }): Promise<FlowHandleResult> {
    const settings = await prisma.bookingSettings.findUnique({ where: { tenantId: params.tenantId } });
    if (!settings?.bookingEnabled) return { handled: false };

    await BookingExpiryService.expireStaleHolds(params.tenantId);

    const ctx = await BookingContextService.reconcileCheckoutWithAppointment(params.conversationId);
    if (!ctx.checkout) {
      return { handled: false };
    }

    const priorAgent = { ...ctx.agentState };
    const v1Flow = v1FlowFromCheckout(ctx.checkout);
    await BookingFlowService.saveFlow(params.conversationId, v1Flow);

    const result = await BookingFlowService.handle(params);

    const updatedV1 = await BookingFlowService.getFlow(params.conversationId);
    await BookingContextService.syncFromV1Flow(params.conversationId, updatedV1, priorAgent);

    if (updatedV1.state === 'confirmed' && result.handled) {
      const name = updatedV1.customerName || ctx.checkout.customerName;
      await BookingContextService.resetAfterBooking(params.conversationId, name);
    }

    return result;
  }
}
