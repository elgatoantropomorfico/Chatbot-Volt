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
  return false;
}

function isPaymentChangeScheduleIndex(text: string): boolean {
  // Índice 3 del menú de pago SOLO si el mensaje es únicamente "3"
  return normalize(text) === '3';
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
  /** Tras iniciar checkout: promo (si hay 2+) o menú de pago. */
  static async presentAfterCheckoutStarted(params: {
    tenantId: string;
    conversationId: string;
  }): Promise<FlowHandleResult> {
    const ctx = await BookingContextService.load(params.conversationId);
    if (!ctx.checkout) return { handled: false };
    if (ctx.checkout.phase === 'promo_choice') {
      return this.presentPromoChoice(params);
    }
    return this.presentPaymentChoice(params);
  }

  static async presentPromoChoice(params: {
    tenantId: string;
    conversationId: string;
  }): Promise<FlowHandleResult> {
    const settings = await prisma.bookingSettings.findUnique({ where: { tenantId: params.tenantId } });
    if (!settings?.bookingEnabled) return { handled: false };

    const ctx = await BookingContextService.load(params.conversationId);
    if (!ctx.checkout || ctx.checkout.phase !== 'promo_choice') return { handled: false };

    const rules = await BookingPricingService.getActivePriceRules(params.tenantId);
    if (rules.length === 0) {
      await BookingContextService.save(params.conversationId, {
        ...ctx,
        checkout: { ...ctx.checkout, phase: 'payment_choice', priceRuleId: null, discountLabel: null },
      });
      return this.presentPaymentChoice(params);
    }

    const checkout = ctx.checkout;
    const body = `Antes de pagar, elegí cómo cobramos tu sesión:

Camino: ${checkout.serviceName}
Día y horario: ${checkout.slotLabel}

Elegí una opción:`;

    const options = [...rules.map((r) => r.label), 'Precio de lista', 'Cambiar horario'];
    return BookingFlowService.buildOptionsReply(body, options, true);
  }

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
    let priceLabel = 'consultá en sala';
    let promoLine = '';
    try {
      const pricing = await BookingPricingService.resolvePrice(
        params.tenantId,
        checkout.serviceId,
        new Date(),
        checkout.priceRuleId ?? null,
      );
      priceLabel = `$${pricing.finalPrice.toLocaleString('es-AR')}`;
      if (pricing.discountLabel) promoLine = `\nPromo: ${pricing.discountLabel}`;
    } catch (err: any) {
      console.warn('⚠️ presentPaymentChoice: no se pudo resolver precio:', err.message || err);
    }
    const depositPct = settings.depositPercentage || 50;
    const policyShort = (settings.cancellationPolicyJson as any)?.cancellation
      || (settings.cancellationPolicyJson as any)?.policy_short_text
      || 'En caso de cancelación, la seña no es reembolsable.';

    const body = `Te dejo el resumen de tu turno:

Camino: ${checkout.serviceName}
Día y horario: ${checkout.slotLabel}
Valor de la sesión: ${priceLabel}${promoLine}

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
    if (
      isChangeScheduleChoice(params.text)
      || (ctx.checkout.phase === 'payment_choice' && isPaymentChangeScheduleIndex(params.text))
    ) {
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

    // Elegir promo (2+ activas) o precio de lista
    if (ctx.checkout.phase === 'promo_choice') {
      const rules = await BookingPricingService.getActivePriceRules(params.tenantId);
      const t = normalize(params.text);
      const listIdx = rules.length + 1;
      const changeIdx = rules.length + 2;
      if (t === String(changeIdx) || t.includes('cambiar horario')) {
        return this.changeSchedule({
          tenantId: params.tenantId,
          conversationId: params.conversationId,
          leadId: params.leadId,
          phone: params.phone,
        });
      }
      if (t === String(listIdx) || t.includes('precio de lista') || t === 'sin promo' || t === 'sin descuento') {
        await BookingContextService.save(params.conversationId, {
          ...ctx,
          checkout: {
            ...ctx.checkout,
            phase: 'payment_choice',
            priceRuleId: null,
            discountLabel: null,
          },
        });
        return this.presentPaymentChoice({
          tenantId: params.tenantId,
          conversationId: params.conversationId,
        });
      }
      let picked = rules.find((r) => normalize(r.label) === t) ?? null;
      if (!picked) {
        const idx = Number.parseInt(t, 10);
        if (Number.isFinite(idx) && idx >= 1 && idx <= rules.length) {
          picked = rules[idx - 1];
        }
      }
      if (!picked) {
        return this.presentPromoChoice({
          tenantId: params.tenantId,
          conversationId: params.conversationId,
        });
      }
      await BookingContextService.save(params.conversationId, {
        ...ctx,
        checkout: {
          ...ctx.checkout,
          phase: 'payment_choice',
          priceRuleId: picked.id,
          discountLabel: picked.label,
        },
      });
      return this.presentPaymentChoice({
        tenantId: params.tenantId,
        conversationId: params.conversationId,
      });
    }

    // En payment_choice solo 1/2 (seña/100%) siguen al cobro.
    // "hola?", texto libre, etc. → re-mostrar resumen completo (no el menú corto del FSM).
    if (ctx.checkout.phase === 'payment_choice') {
      const t = normalize(params.text);
      const isPaySena = t === '1' || /^(senar|señar)\b/.test(t) || /\bsena\b/.test(t);
      const isPayTotal = t === '2'
        || /pagar\s*100|100\s*%|pago\s*total|cien\s*por\s*ciento|abonar\s*todo/.test(t);
      if (!isPaySena && !isPayTotal) {
        return this.presentPaymentChoice({
          tenantId: params.tenantId,
          conversationId: params.conversationId,
        });
      }
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
