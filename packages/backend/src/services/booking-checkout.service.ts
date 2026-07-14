import { BookingFlowService, type FlowHandleResult } from './booking-flow.service';
import { BookingContextService, v1FlowFromCheckout } from './booking-context.service';
import { BookingExpiryService } from './booking-notification.service';
import { prisma } from '../config/database';

export class BookingCheckoutService {
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

    let ctx = await BookingContextService.reconcileCheckoutWithAppointment(params.conversationId);
    if (!ctx.checkout) {
      // Hold ya confirmado/vencido: salir del checkout y no forzar FSM
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
