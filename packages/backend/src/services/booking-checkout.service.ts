import { BookingFlowService, type FlowHandleResult } from './booking-flow.service';
import { BookingContextService, v1FlowFromCheckout } from './booking-context.service';
import { BookingExpiryService } from './booking-notification.service';
import { BookingPricingService } from './booking-pricing.service';
import { BookingToolExecutor } from './booking-tool-executor.service';
import { emptyAgentState } from './booking-agent.types';
import { prisma } from '../config/database';

function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function isChangeScheduleChoice(text: string): boolean {
  const t = normalize(text);
  // Texto explícito (incluye título de botón / list row)
  if (t.includes('cambiar horario')) return true;
  // Índice 3 del menú de pago SOLO si el mensaje es únicamente "3"
  // (no "3\n..." de debounce, ni etiquetas de horario)
  if (t === '3') return true;
  return false;
}

function isPaymentHomeChoice(text: string): boolean {
  const t = normalize(text);
  if (t === 'volver al inicio' || t === 'menu' || t === 'menú') return true;
  if (t.includes('volver al inicio')) return true;
  // Opción 4 del menú de pago (3 formas de pago + home)
  if (t === '4') return true;
  return false;
}

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
    // Mantener v2 en DB; no pisar con FSM salvo al tomar seña/100%
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

  /** Sale del checkout y vuelve a ofrecer horarios sin resetear servicio/cliente. */
  static async changeSchedule(params: {
    tenantId: string;
    conversationId: string;
    leadId: string;
    phone: string;
  }): Promise<FlowHandleResult> {
    const settings = await prisma.bookingSettings.findUnique({ where: { tenantId: params.tenantId } });
    if (!settings) return { handled: false };

    const ctx = await BookingContextService.load(params.conversationId);
    const checkout = ctx.checkout;
    if (!checkout) return { handled: false };

    // Liberar hold si ya había turno pendiente de pago
    if (checkout.appointmentId) {
      await prisma.appointment.updateMany({
        where: {
          id: checkout.appointmentId,
          tenantId: params.tenantId,
          status: 'pendiente_pago',
        },
        data: { status: 'cancelado', cancelledAt: new Date() },
      });
    }

    const keptCustomer = ctx.agentState.customer?.fullName
      ? ctx.agentState.customer
      : checkout.customerName
        ? {
            fullName: checkout.customerName,
            nameConfirmed: true,
            notes: checkout.customerNotes ?? null,
            notesCollected: true,
          }
        : null;

    let next = {
      ...ctx,
      checkout: null,
      agentState: {
        ...emptyAgentState({
          greetingPending: false,
          mode: 'booking' as const,
          service: {
            id: checkout.serviceId,
            name: checkout.serviceName,
            confirmed: true,
          },
          customer: keptCustomer,
          datePreference: { mode: 'ASAP' as const, daypart: 'ANY' as const },
          shownSlotKeys: [],
          listedSlots: [],
          offeredSlot: null,
          browsePhase: null,
          uiPresentation: null,
        }),
      },
    };
    await BookingContextService.save(params.conversationId, next);

    const { ctx: withSlots } = await BookingToolExecutor.execute(
      'find_available_slots',
      { mode: 'ASAP', limit: 2, exclude_shown: false },
      next,
      {
        tenantId: params.tenantId,
        conversationId: params.conversationId,
        leadId: params.leadId,
        phone: params.phone,
        settings,
      },
    );

    const ui = withSlots.agentState.uiPresentation;
    if (ui?.options?.length) {
      await BookingContextService.save(params.conversationId, {
        ...withSlots,
        agentState: { ...withSlots.agentState, uiPresentation: null },
      });
      return BookingFlowService.buildOptionsReply(
        'Sin problema. Elegí un nuevo horario:',
        ui.options,
      );
    }

    return {
      handled: true,
      text: 'No encontré horarios libres ahora. Escribí *menu* o pedime otra fecha.',
    };
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

    // "Cambiar horario" no pasa por el FSM v1 (rompe el contexto v2)
    if (isChangeScheduleChoice(params.text)) {
      return this.changeSchedule({
        tenantId: params.tenantId,
        conversationId: params.conversationId,
        leadId: params.leadId,
        phone: params.phone,
      });
    }

    // Volver al inicio / menu desde pago
    if (isPaymentHomeChoice(params.text)) {
      if (ctx.checkout.appointmentId) {
        await prisma.appointment.updateMany({
          where: {
            id: ctx.checkout.appointmentId,
            tenantId: params.tenantId,
            status: 'pendiente_pago',
          },
          data: { status: 'cancelado', cancelledAt: new Date() },
        });
      }
      const keepName = ctx.agentState.customer?.fullName || ctx.checkout.customerName;
      await BookingContextService.resetAfterBooking(params.conversationId, keepName);
      return BookingFlowService.buildWelcomeReply(params.tenantId, settings);
    }

    const priorAgent = { ...ctx.agentState };
    const v1Flow = v1FlowFromCheckout(ctx.checkout);
    await BookingFlowService.saveFlow(params.conversationId, v1Flow);

    const result = await BookingFlowService.handle(params);

    const updatedV1 = await BookingFlowService.getFlow(params.conversationId);

    // Si el FSM se fue a slot_selection u otro estado pre-pago, NO asumir "cambiar horario"
    // (eso reabría ASAP y pisaba el slot recién confirmado). Re-mostrar pago o menú limpio.
    if (
      updatedV1.state === 'slot_selection'
      || updatedV1.state === 'booking_start'
      || updatedV1.state === 'idle'
    ) {
      if (ctx.checkout && ctx.checkout.phase === 'payment_choice') {
        await BookingContextService.save(params.conversationId, {
          version: 2,
          agentState: {
            ...priorAgent,
            greetingPending: false,
            mode: 'booking',
            browsePhase: null,
            uiPresentation: null,
          },
          checkout: ctx.checkout,
          aiWindow: { fromMessageId: null },
        });
        return this.presentPaymentChoice({
          tenantId: params.tenantId,
          conversationId: params.conversationId,
        });
      }
      await BookingContextService.save(params.conversationId, {
        version: 2,
        agentState: {
          ...priorAgent,
          offeredSlot: null,
          listedSlots: [],
          browsePhase: null,
          uiPresentation: null,
          greetingPending: false,
          mode: 'booking',
        },
        checkout: null,
        aiWindow: { fromMessageId: null },
      });
      return {
        handled: true,
        text: 'No entendí esa opción de pago. Escribí *1* para seña, *2* para pagar 100%, o *Cambiar horario*.',
      };
    }

    await BookingContextService.syncFromV1Flow(params.conversationId, updatedV1, priorAgent);

    if (updatedV1.state === 'confirmed' && result.handled) {
      const name = updatedV1.customerName || ctx.checkout.customerName;
      await BookingContextService.resetAfterBooking(params.conversationId, name);
    }

    return result;
  }
}
