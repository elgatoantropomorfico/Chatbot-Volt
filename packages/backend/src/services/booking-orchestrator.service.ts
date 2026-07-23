import { prisma } from '../config/database';
import { BookingContextService } from './booking-context.service';
import { BookingAgentService } from './booking-agent.service';
import { BookingCheckoutService } from './booking-checkout.service';
import { BookingFlowService, type FlowHandleResult } from './booking-flow.service';
import { BookingAiService } from './booking-ai.service';
import { BookingPricingService } from './booking-pricing.service';
import {
  BookingRecommenderService,
  RECOMMENDER_CONFIRM_OPTIONS,
  RECOMMENDER_Q1_OPTIONS,
  RECOMMENDER_Q2_OPTIONS,
} from './booking-recommender.service';
import {
  formatServicePreviewBody,
  looksLikeBrowseReleaseQuery,
  looksLikePriceQuery,
  looksLikeServiceInfoQuery,
  matchServiceFromText,
} from './booking-flow-nav.service';
import { BookingExpiryService } from './booking-notification.service';
import { BookingToolExecutor } from './booking-tool-executor.service';
import { BookingRescheduleService } from './booking-reschedule.service';
import type { BookingConversationContext } from './booking-agent.types';
import { slotKey } from './booking-agent.types';
import { looksLikeDateQuery } from './booking-datetime.service';
import { isCatalogConfigV2 } from './booking-catalog-config.service';

const AUDIO_BLOCK_MSG = '🎤 Por ahora la turnera funciona solo con mensajes de *texto*. Escribime lo que necesitás y te ayudo con la reserva 🌿';

const MAIN_MENU_OPTIONS = ['Ayudame a elegir', 'Ya sé cuál quiero', 'Ver precios'];
const MAIN_MENU_OPTIONS_V2 = ['Ver todos los servicios', 'Ver precios'];

function mainMenuOptions(settings: any): string[] {
  return isCatalogConfigV2(settings) ? MAIN_MENU_OPTIONS_V2 : MAIN_MENU_OPTIONS;
}
const MORE_SLOTS_LABEL = 'ver más horarios';
const MORE_MENU = {
  thisWeek: 'esta semana',
  nextWeek: 'semana proxima',
  pickDate: 'elegir fecha',
} as const;

function normalizeInput(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function isMenuCommand(input: string): boolean {
  return ['menú', 'menu', 'empezar de nuevo', 'inicio'].some((c) => input === c || input === c.replace('ó', 'o'));
}

function isHumanCommand(input: string): boolean {
  return input === 'humano' || input === 'hablar con persona';
}

function looksLikeCancelIntent(input: string): boolean {
  if (/no\s+(quiero|voy\s+a)\s+cancelar/.test(input)) return false;
  if (/^(cancelar|anular)(\s+(mi|el|un))?\s*(turno|reserva|cita)?\s*$/.test(input)) return true;
  if (/quiero\s+cancelar/.test(input)) return true;
  if (/cancel(ar|ación|acion).*(turno|reserva|cita)/.test(input)) return true;
  return false;
}

function looksLikeRescheduleIntent(input: string): boolean {
  if (looksLikeCancelIntent(input)) return false;
  if (/reprogramar|reagendar/.test(input)) return true;
  if (/cambiar\s+(de\s+)?fecha/.test(input)) return true;
  if (/mover\s+(el\s+)?turno/.test(input)) return true;
  if (/cambiar\s+(el\s+)?turno/.test(input)) return true;
  if (/otro\s+(d[ií]a|horario).*(turno|reserva)?/.test(input)) return true;
  if (/quiero\s+cambiar\s+(la\s+)?(fecha|horario)/.test(input)) return true;
  // "cambiar horario" fuera de checkout = reprogramar activo
  if (/cambiar\s+horario/.test(input)) return true;
  return false;
}

export class BookingOrchestrator {
  static audioBlockMessage(): string {
    return AUDIO_BLOCK_MSG;
  }

  static async handle(params: {
    tenantId: string;
    conversationId: string;
    leadId: string;
    phone: string;
    text: string;
    profileName?: string | null;
    messageType?: string;
  }): Promise<FlowHandleResult> {
    const settings = await prisma.bookingSettings.findUnique({ where: { tenantId: params.tenantId } });
    if (!settings?.bookingEnabled) return { handled: false };

    if (params.messageType === 'audio') {
      return { handled: true, text: AUDIO_BLOCK_MSG };
    }

    await BookingExpiryService.expireStaleHolds(params.tenantId);

    const input = normalizeInput(params.text);
    let ctx = await BookingContextService.reconcileCheckoutWithAppointment(params.conversationId);

    // Cancelación pendiente: botones Sí/No sin pasar por el LLM
    if (ctx.agentState.pendingCancel) {
      const hardYes = /^(sí|si|dale|ok|confirmo|1|sí,? cancelar|si,? cancelar)$/i.test(input.trim())
        || /sí,\s*cancelar|si,\s*cancelar/i.test(input);
      const hardNo = /^(no|mejor no|2|no,? volver)$/i.test(input.trim())
        || /no,\s*volver/i.test(input);
      if (hardYes || hardNo) {
        const { BookingToolExecutor } = await import('./booking-tool-executor.service');
        const exec = {
          tenantId: params.tenantId,
          conversationId: params.conversationId,
          leadId: params.leadId,
          phone: params.phone,
          settings,
        };
        if (hardYes) {
          const pendingLabel = ctx.agentState.pendingCancel.label;
          const { result } = await BookingToolExecutor.execute(
            'cancel_appointment',
            { appointment_id: ctx.agentState.pendingCancel.appointmentId, confirm: true },
            ctx,
            exec,
          );
          if (result.ok) {
            return {
              handled: true,
              text: `Listo, cancelamos tu turno:\n\n${pendingLabel}\n\nSi querés reservar otro, decime 🌿`,
            };
          }
          return { handled: true, text: result.error || 'No pude cancelar ese turno.' };
        }
        await BookingContextService.save(params.conversationId, {
          ...ctx,
          agentState: { ...ctx.agentState, pendingCancel: null, uiPresentation: null },
        });
        return { handled: true, text: 'Perfecto, dejamos el turno como está. ¿En qué más te ayudo?' };
      }
    }

    // Reprogramación en curso: elegir turno o nuevo horario (sin LLM)
    if (ctx.agentState.pendingReschedule) {
      const rescheduleHandled = await this.handlePendingReschedule(params, ctx, settings);
      if (rescheduleHandled) return rescheduleHandled;
      ctx = await BookingContextService.load(params.conversationId);
    }

    if (ctx.legacyV1) {
      return BookingFlowService.handle(params);
    }

    if (isHumanCommand(input)) {
      await BookingContextService.save(params.conversationId, {
        ...ctx,
        agentState: { ...ctx.agentState, mode: 'idle' },
      });
      return { handled: true, handoff: true, text: 'Te comunico con una persona del equipo.' };
    }

    if (ctx.checkout) {
      const checkoutResult = await BookingCheckoutService.handle(params);
      if (checkoutResult.handled) return checkoutResult;
      // checkout reconciliado (ya pagó/venció) → seguir con agente
      ctx = await BookingContextService.load(params.conversationId);
    }

    if (isMenuCommand(input)) {
      const keepName = ctx.agentState.customer?.fullName;
      await BookingContextService.resetAfterBooking(params.conversationId, keepName);
      return BookingFlowService.buildWelcomeReply(params.tenantId, settings!);
    }

    if (looksLikeCancelIntent(input)) {
      return this.handleCancelIntent(params, ctx);
    }

    if (looksLikeRescheduleIntent(input) && !ctx.checkout) {
      return this.startRescheduleFlow(params, ctx, settings!);
    }

    // Recomendador "Ayudame a elegir" (q1/q2) — deshabilitado en catalog v2
    if (!isCatalogConfigV2(settings)) {
      const reco = await this.tryHardRecommender(params, ctx, settings);
      if (reco) return reco;

      // Tras Q1/Q2: confirmar / reservar el camino recomendado
      const hadPendingRecommend = !!ctx.agentState.pendingRecommend;
      const recoConfirm = await this.tryHardRecommendConfirm(params, ctx, settings);
      if (recoConfirm) return recoConfirm;
      // Texto libre limpió pendingRecommend en DB — refrescar ctx en memoria
      if (hadPendingRecommend) {
        ctx = await BookingContextService.load(params.conversationId);
      }
    }

    // Lista "Ya sé cuál quiero" / "Ver todos los servicios"
    const serviceListPick = await this.tryHardServiceListPick(params, ctx, settings);
    if (serviceListPick) return serviceListPick;

    // Menú principal
    const mainMenu = await this.tryHardMainMenu(params, ctx, settings);
    if (mainMenu) return mainMenu;

    // Saludo puro con browse colgado → soltar el menú viejo y saludar limpio
    if (BookingAiService.looksLikeGreeting(params.text) && params.text.trim().length < 60) {
      const soft = {
        ...ctx,
        agentState: {
          ...ctx.agentState,
          browsePhase: null,
          uiPresentation: null,
          greetingPending: false,
        },
      };
      await BookingContextService.save(params.conversationId, soft);
      ctx = soft;
      // no return: si además pide reserva en el mismo debounce, sigue abajo
      if (!/reserv|turno|quiero|necesito|camino|masaje|sesi[oó]n/.test(input)) {
        return {
          handled: true,
          text: '¡Hola de nuevo! 😊 Contame qué camino querés reservar o qué necesitás.',
        };
      }
    }

    // Browse de horarios ANTES: con nm/notes listos, un tap "3" no debe ir a notas/pago
    const hadBrowse = !!ctx.agentState.browsePhase;
    const browseHandled = await this.handleBrowseRouting(params, ctx, settings);
    if (browseHandled) return browseHandled;
    // Texto libre soltó browse sticky en DB — refrescar ctx en memoria
    if (hadBrowse) {
      ctx = await BookingContextService.load(params.conversationId);
    }

    const checkoutProgress = await this.tryHardCheckoutProgress(params, ctx, settings);
    if (checkoutProgress) return checkoutProgress;

    // Cambio/pedido de servicio: si matchea un camino, NO pasar por menú Ver más viejo
    const serviceSwitch = await this.tryHardServiceSwitch(params, ctx, settings);
    if (serviceSwitch) return serviceSwitch;

    // (browse ya evaluado arriba)

    if (ctx.agentState.greetingPending) {
      const specific = await this.looksLikeSpecificIntent(params.tenantId, params.text, input);
      if (!specific) {
        await BookingContextService.save(params.conversationId, {
          ...ctx,
          agentState: { ...ctx.agentState, greetingPending: false },
        });
        return BookingFlowService.buildWelcomeReply(params.tenantId, settings);
      }
      await BookingContextService.save(params.conversationId, {
        ...ctx,
        agentState: { ...ctx.agentState, greetingPending: false, mode: 'booking' },
      });
    }

    const { reply, ctx: nextCtx, checkoutStarted } = await this.runAgent(params, ctx, settings);
    if (checkoutStarted) {
      // Nunca interpretar el mensaje de notas como opción de pago/promo
      return BookingCheckoutService.presentAfterCheckoutStarted({
        tenantId: params.tenantId,
        conversationId: params.conversationId,
      });
    }

    // Post-agente: si quedó listo para pago, forzar resumen
    if (
      nextCtx.agentState.service?.confirmed
      && nextCtx.agentState.offeredSlot?.confirmed
      && nextCtx.agentState.customer?.nameConfirmed
      && nextCtx.agentState.customer?.notesCollected
      && !nextCtx.checkout
    ) {
      const forced = await this.forceInitiateCheckout(params, nextCtx, settings);
      if (forced) return forced;
    }

    const withSlots = await this.ensureAvailabilityUi(params, nextCtx, settings);
    return this.deliverAgentResult(params.conversationId, reply, withSlots);
  }

  private static toolExec(
    params: {
      tenantId: string;
      conversationId: string;
      leadId: string;
      phone: string;
    },
    settings: any,
  ) {
    return {
      tenantId: params.tenantId,
      conversationId: params.conversationId,
      leadId: params.leadId,
      phone: params.phone,
      settings,
    };
  }

  private static async tryHardServiceListPick(
    params: {
      tenantId: string;
      conversationId: string;
      leadId: string;
      phone: string;
      text: string;
    },
    ctx: BookingConversationContext,
    settings: any,
  ): Promise<FlowHandleResult | null> {
    if (!ctx.agentState.pickingServiceList) return null;

    const t = normalizeInput(params.text);
    if (t === 'volver al inicio' || t === 'menu' || t === 'menú') {
      await BookingContextService.resetAfterBooking(
        params.conversationId,
        ctx.agentState.customer?.fullName,
      );
      return BookingFlowService.buildWelcomeReply(params.tenantId, settings);
    }

    const services = await prisma.bookingService.findMany({
      where: { tenantId: params.tenantId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    if (!services.length) return null;

    let chosen = matchServiceFromText(params.text, services);
    if (!chosen && /^\d+$/.test(t)) {
      const n = parseInt(t, 10);
      if (n >= 1 && n <= services.length) {
        chosen = { id: services[n - 1].id, name: services[n - 1].name };
      }
    }
    if (!chosen) {
      return BookingFlowService.buildOptionsReply(
        'Elegí un camino de la lista:',
        services.map((s) => s.name),
        true,
      );
    }

    const exec = this.toolExec(params, settings);
    let next: BookingConversationContext = {
      ...ctx,
      agentState: { ...ctx.agentState, pickingServiceList: false },
    };
    const { ctx: afterConfirm } = await BookingToolExecutor.execute(
      'confirm_service',
      { service_id: chosen.id, service_name: chosen.name },
      next,
      exec,
    );
    next = afterConfirm;
    const { ctx: afterSlots } = await BookingToolExecutor.execute(
      'find_available_slots',
      { mode: 'ASAP', limit: 2, exclude_shown: false },
      next,
      exec,
    );
    const ui = afterSlots.agentState.uiPresentation;
    if (ui?.options?.length) {
      await BookingContextService.save(params.conversationId, {
        ...afterSlots,
        agentState: { ...afterSlots.agentState, uiPresentation: null, pickingServiceList: false },
      });
      const svc = services.find((s) => s.id === chosen!.id);
      const intro = svc
        ? formatServicePreviewBody(svc, chosen.name).split('¿Querés reservar')[0].trim()
        : `Perfecto, *${chosen.name}*.`;
      return BookingFlowService.buildOptionsReply(
        `${intro}\n\nEstos son los primeros horarios disponibles:`,
        ui.options,
      );
    }
    await BookingContextService.save(params.conversationId, {
      ...afterSlots,
      agentState: { ...afterSlots.agentState, pickingServiceList: false },
    });
    return { handled: true, text: `Quedó anotado *${chosen.name}*. Por ahora no hay horarios libres.` };
  }

  private static async tryHardMainMenu(
    params: {
      tenantId: string;
      conversationId: string;
      leadId: string;
      phone: string;
      text: string;
    },
    ctx: BookingConversationContext,
    settings: any,
  ): Promise<FlowHandleResult | null> {
    if (ctx.checkout || ctx.agentState.pendingCancel || ctx.agentState.pendingReschedule || ctx.agentState.recommender) return null;
    if (ctx.agentState.pendingRecommend) return null;
    if (ctx.agentState.pickingServiceList) return null;
    if (ctx.agentState.browsePhase) return null;
    // No pisar una reserva en curso (camino ya elegido / slots en pantalla)
    if (ctx.agentState.service?.confirmed) return null;
    if (ctx.agentState.listedSlots?.length) return null;

    const raw = params.text.trim();
    const t = normalizeInput(raw);
    const v2 = isCatalogConfigV2(settings);
    let pick: 1 | 2 | 3 | null = null;

    if (v2) {
      if (t === '1' || t === 'ver todos los servicios' || /^ver todos\b/.test(t)) pick = 1;
      if (t === '2' || t.includes('precio') || t.includes('ver precio')) pick = 2;
      if (pick && raw.length > 40 && !/^\d+$/.test(t)) {
        if (pick === 1 && !/ver todos|servicios/.test(t)) pick = null;
        if (pick === 2 && !/precio/.test(t)) pick = null;
      }
    } else {
      if (t === '1' || t.includes('ayudame') || t === 'ayudame a elegir') pick = 1;
      if (t === '2' || t.includes('ya se') || t.includes('cual quiero') || t.includes('se cual')) pick = 2;
      if (t === '3' || t.includes('precio') || t.includes('ver precio')) pick = 3;
      if (pick && raw.length > 40 && !/^\d+$/.test(t)) {
        if (pick === 1 && !/ayudame|elegir/.test(t)) pick = null;
        if (pick === 2 && !/ya se|cual quiero/.test(t)) pick = null;
        if (pick === 3 && !/precio/.test(t)) pick = null;
      }
    }
    if (!pick) return null;

    // v2 pick 1 = lista servicios; v1 pick 1 = recomendador
    if (pick === 1 && !v2) {
      await BookingContextService.save(params.conversationId, {
        ...ctx,
        agentState: {
          ...ctx.agentState,
          mode: 'booking',
          greetingPending: false,
          recommender: { step: 'q1' },
          pendingRecommend: null,
          pickingServiceList: false,
          browsePhase: null,
          uiPresentation: null,
          listedSlots: [],
          service: null,
          offeredSlot: null,
        },
      });
      return BookingFlowService.buildOptionsReply(
        '¿Qué sentís que necesitás hoy?',
        RECOMMENDER_Q1_OPTIONS,
        true,
      );
    }

    if ((pick === 1 && v2) || (pick === 2 && !v2)) {
      const services = await prisma.bookingService.findMany({
        where: { tenantId: params.tenantId, isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: { name: true },
      });
      if (!services.length) {
        return {
          handled: true,
          text: v2
            ? 'Por ahora no hay servicios cargados. Escribí *humano*.'
            : 'Por ahora no hay caminos cargados. Escribí *humano*.',
        };
      }
      await BookingContextService.save(params.conversationId, {
        ...ctx,
        agentState: {
          ...ctx.agentState,
          mode: 'booking',
          greetingPending: false,
          recommender: null,
          pendingRecommend: null,
          pickingServiceList: true,
          browsePhase: null,
        },
      });
      return BookingFlowService.buildOptionsReply(
        v2 ? 'Estos son nuestros servicios. Elegí el que querés:' : 'Estos son nuestros caminos. Elegí el que querés:',
        services.map((s) => s.name),
        true,
      );
    }

    // Ver precios
    const depositPct = settings.depositPercentage || 50;
    const promoBlock = await BookingPricingService.formatActivePromosSummary(params.tenantId);
    const promoSection = promoBlock ? `\n\n${promoBlock}` : '';
    await BookingContextService.save(params.conversationId, {
      ...ctx,
      agentState: {
        ...ctx.agentState,
        greetingPending: false,
        pricePreviewShown: true,
        mode: 'booking',
      },
    });

    if (v2) {
      const list = await BookingPricingService.formatServicesPriceList(params.tenantId);
      return {
        handled: true,
        text: `💆‍♀️ *Precios de servicios*\n\n${list}${promoSection}\n\nPara reservar pedimos una seña del *${depositPct}%* por Mercado Pago 🌿\n\nEscribí *1* para ver todos los servicios o decime cuál querés.`,
      };
    }

    const basePrice = settings.basePrice ? Number(settings.basePrice) : null;
    const price = basePrice ? `$${basePrice.toLocaleString('es-AR')}` : 'consultá en sala';
    const duration = settings.sessionDurationMinutes || 80;
    const promoWithBase = await BookingPricingService.formatActivePromosSummary(params.tenantId, basePrice);
    const promoLegacy = promoWithBase ? `\n\n${promoWithBase}` : '';
    return {
      handled: true,
      text: `💆‍♀️ *Valor de sesión* (${duration} min): ${price}${promoLegacy}\n\nPara reservar pedimos una seña del *${depositPct}%* por Mercado Pago 🌿\n\nDecime qué camino querés o escribí *1* si preferís que te ayude a elegir.`,
    };
  }

  private static async tryHardRecommender(
    params: {
      tenantId: string;
      conversationId: string;
      leadId: string;
      phone: string;
      text: string;
    },
    ctx: BookingConversationContext,
    settings: any,
  ): Promise<FlowHandleResult | null> {
    const rec = ctx.agentState.recommender;
    if (!rec) return null;

    const t = normalizeInput(params.text);
    const options = rec.step === 'q1' ? RECOMMENDER_Q1_OPTIONS : RECOMMENDER_Q2_OPTIONS;
    // "Volver al inicio" es la última fila (5 opciones + home → 6), NO el botón 4
    const homeIndex = options.length + 1;
    if (
      t === String(homeIndex)
      || t === 'volver al inicio'
      || t === 'menu'
      || t === 'menú'
    ) {
      await BookingContextService.resetAfterBooking(
        params.conversationId,
        ctx.agentState.customer?.fullName,
      );
      return BookingFlowService.buildWelcomeReply(params.tenantId, settings);
    }

    let index: number | null = null;
    if (/^\d+$/.test(t)) {
      const n = parseInt(t, 10);
      if (n >= 1 && n <= options.length) index = n;
    } else {
      const hit = options.findIndex((o) => {
        const n = normalizeInput(o);
        return n === t || n.includes(t) || t.includes(n.slice(0, 8));
      });
      if (hit >= 0) index = hit + 1;
    }

    if (!index) {
      return BookingFlowService.buildOptionsReply(
        rec.step === 'q1' ? '¿Qué sentís que necesitás hoy?' : '¿Cómo te gustaría vivir la sesión?',
        options,
        true,
      );
    }

    if (rec.step === 'q1') {
      await BookingContextService.save(params.conversationId, {
        ...ctx,
        agentState: {
          ...ctx.agentState,
          recommender: { step: 'q2', q1: index },
        },
      });
      return BookingFlowService.buildOptionsReply(
        '¿Cómo te gustaría vivir la sesión?',
        RECOMMENDER_Q2_OPTIONS,
        true,
      );
    }

    const q1 = rec.q1 || 1;
    const best = await BookingRecommenderService.recommend(params.tenantId, q1, index);
    if (!best) {
      return { handled: true, text: 'No encontramos caminos disponibles. Escribí *humano*.' };
    }

    await BookingContextService.save(params.conversationId, {
      ...ctx,
      agentState: {
        ...ctx.agentState,
        recommender: null,
        pendingRecommend: {
          id: best.id,
          name: best.name,
          recommendationText: best.recommendationText,
        },
        mode: 'booking',
      },
    });
    return BookingFlowService.buildOptionsReply(
      best.recommendationText,
      RECOMMENDER_CONFIRM_OPTIONS,
      true,
    );
  }

  /** Confirmación post-recomendación: Reservar / Ver otros / Humano (como FSM v1). */
  private static async tryHardRecommendConfirm(
    params: {
      tenantId: string;
      conversationId: string;
      leadId: string;
      phone: string;
      text: string;
    },
    ctx: BookingConversationContext,
    settings: any,
  ): Promise<FlowHandleResult | null> {
    const pending = ctx.agentState.pendingRecommend;
    if (!pending) return null;

    const raw = params.text.trim();
    const t = normalizeInput(raw);
    const homeIndex = RECOMMENDER_CONFIRM_OPTIONS.length + 1; // 4
    if (
      t === String(homeIndex)
      || t === 'volver al inicio'
      || t === 'menu'
      || t === 'menú'
    ) {
      await BookingContextService.resetAfterBooking(
        params.conversationId,
        ctx.agentState.customer?.fullName,
      );
      return BookingFlowService.buildWelcomeReply(params.tenantId, settings);
    }

    // Preguntas de info / texto libre → soltar la recomendación (no perpetuar botones)
    if (looksLikeServiceInfoQuery(raw) || raw.length > 48) {
      await BookingContextService.save(params.conversationId, {
        ...ctx,
        agentState: { ...ctx.agentState, pendingRecommend: null },
      });
      return null;
    }

    let pick: 1 | 2 | 3 | null = null;
    if (/^\d+$/.test(t)) {
      const n = parseInt(t, 10);
      if (n >= 1 && n <= 3) pick = n as 1 | 2 | 3;
    } else {
      const hit = RECOMMENDER_CONFIRM_OPTIONS.findIndex((o) => {
        const n = normalizeInput(o);
        return n === t || t.startsWith(n) || n.startsWith(t);
      });
      if (hit >= 0) pick = (hit + 1) as 1 | 2 | 3;
      else if (/^(reservar|si|sí|dale|vamos|ok|oka)\b/.test(t) || /^reservar\s+este/.test(t)) pick = 1;
      else if (/^ver\s+otros/.test(t) || t === 'otros caminos') pick = 2;
      else if (t === 'humano' || /^hablar\s+con/.test(t)) pick = 3;
    }

    // Sin opción clara: limpiar recomendación y dejar al agente
    if (!pick) {
      await BookingContextService.save(params.conversationId, {
        ...ctx,
        agentState: { ...ctx.agentState, pendingRecommend: null },
      });
      return null;
    }

    if (pick === 3 || isHumanCommand(t)) {
      await BookingContextService.save(params.conversationId, {
        ...ctx,
        agentState: { ...ctx.agentState, pendingRecommend: null },
      });
      return { handled: true, handoff: true, text: 'Te comunico con una persona del equipo.' };
    }

    if (pick === 2) {
      const services = await prisma.bookingService.findMany({
        where: { tenantId: params.tenantId, isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: { name: true },
      });
      await BookingContextService.save(params.conversationId, {
        ...ctx,
        agentState: {
          ...ctx.agentState,
          pendingRecommend: null,
          pickingServiceList: true,
          service: null,
          offeredSlot: null,
          listedSlots: [],
          browsePhase: null,
        },
      });
      return BookingFlowService.buildOptionsReply(
        'Estos son nuestros caminos. Elegí el que querés:',
        services.map((s) => s.name),
        true,
      );
    }

    // pick === 1 Reservar este camino → ASAP slots
    const exec = this.toolExec(params, settings);
    let next: BookingConversationContext = {
      ...ctx,
      agentState: {
        ...ctx.agentState,
        pendingRecommend: null,
        mode: 'booking',
      },
    };
    const { ctx: afterConfirm } = await BookingToolExecutor.execute(
      'confirm_service',
      { service_id: pending.id, service_name: pending.name },
      next,
      exec,
    );
    next = afterConfirm;
    const { ctx: afterSlots } = await BookingToolExecutor.execute(
      'find_available_slots',
      { mode: 'ASAP', limit: 2, exclude_shown: false },
      next,
      exec,
    );
    next = afterSlots;
    const ui = next.agentState.uiPresentation;
    if (ui?.options?.length) {
      await BookingContextService.save(params.conversationId, {
        ...next,
        agentState: { ...next.agentState, uiPresentation: null },
      });
      return BookingFlowService.buildOptionsReply(
        `Genial, vamos con *${pending.name}*.\n\nEstos son los primeros horarios disponibles:`,
        ui.options,
      );
    }
    await BookingContextService.save(params.conversationId, next);
    return {
      handled: true,
      text: `Quedó anotado *${pending.name}*. Por ahora no hay horarios libres. Probá más tarde o escribí *humano*.`,
    };
  }

  /** Nombre → notas → initiate_checkout → resumen de pago (sin LLM). */
  private static async tryHardCheckoutProgress(
    params: {
      tenantId: string;
      conversationId: string;
      leadId: string;
      phone: string;
      text: string;
      profileName?: string | null;
    },
    ctx: BookingConversationContext,
    settings: any,
  ): Promise<FlowHandleResult | null> {
    if (ctx.checkout || ctx.agentState.pendingCancel || ctx.agentState.pendingReschedule) return null;
    if (!ctx.agentState.service?.confirmed || !ctx.agentState.offeredSlot?.confirmed) return null;

    const raw = params.text.trim();
    if (!raw || /^\d+$/.test(raw)) return null;
    // No robar taps de menús de slots
    if (ctx.agentState.browsePhase === 'presenting_slots'
      || ctx.agentState.browsePhase === 'day_slots'
      || ctx.agentState.browsePhase === 'more_menu'
      || ctx.agentState.browsePhase === 'picking_day'
      || ctx.agentState.browsePhase === 'awaiting_date') {
      return null;
    }

    const exec = this.toolExec(params, settings);
    const cust = ctx.agentState.customer;

    // 1) Falta nombre
    if (!cust?.nameConfirmed || !cust.fullName) {
      if (!this.looksLikePersonName(raw)) return null;
      const { ctx: named } = await BookingToolExecutor.execute(
        'set_customer_name',
        { full_name: raw },
        ctx,
        exec,
      );
      await BookingContextService.save(params.conversationId, named);
      return {
        handled: true,
        text: `Gracias, *${raw.trim()}*.\n\n¿Hay algo que quieras avisar antes de la sesión? (piel sensible, preferencias, etc.)\nSi no hay nada, respondé *no*.`,
      };
    }

    // 2) Faltan notas → este mensaje ES la nota (o skip)
    if (!cust.notesCollected) {
      const skip = /^(no|nada|ninguno|ninguna|nop|na|sin notas|no hay nada|nope)$/i.test(raw);
      // Si parece otro pedido de servicio, no tratarlo como nota
      const services = await prisma.bookingService.findMany({
        where: { tenantId: params.tenantId, isActive: true },
        select: { id: true, name: true, shortDescription: true, longDescription: true, serviceType: true },
      });
      if (!skip && matchServiceFromText(raw, services)) return null;

      const { ctx: noted } = await BookingToolExecutor.execute(
        'set_customer_notes',
        skip ? { skip: true } : { notes: raw },
        ctx,
        exec,
      );
      return this.forceInitiateCheckout(params, noted, settings);
    }

    return null;
  }

  private static async forceInitiateCheckout(
    params: {
      tenantId: string;
      conversationId: string;
      leadId: string;
      phone: string;
    },
    ctx: BookingConversationContext,
    settings: any,
  ): Promise<FlowHandleResult | null> {
    const exec = this.toolExec(params, settings);
    const { result, ctx: next } = await BookingToolExecutor.execute(
      'initiate_checkout',
      {},
      ctx,
      exec,
    );
    if (!result.ok || !next.checkout) {
      if (next.agentState.uiPresentation?.options?.length) {
        return this.deliverFromCtx(params.conversationId, next);
      }
      return {
        handled: true,
        text: result.error || 'No pude iniciar el pago. Escribí *menu* o *humano*.',
      };
    }
    try {
      return await BookingCheckoutService.presentAfterCheckoutStarted({
        tenantId: params.tenantId,
        conversationId: params.conversationId,
      });
    } catch (err: any) {
      console.error('⚠️ forceInitiateCheckout presentAfterCheckoutStarted:', err.message || err);
      return {
        handled: true,
        text: 'Tu turno quedó armado. Escribí *1* para seña, *2* para pagar 100%, o *Cambiar horario*.',
      };
    }
  }

  private static looksLikePersonName(raw: string): boolean {
    const t = raw.trim();
    if (!t || t.length < 3 || t.includes('?')) return false;
    if (BookingAiService.looksLikeQuestion(t)) return false;
    if (!/^[\p{L}\s'.-]{2,80}$/u.test(t)) return false;
    const words = t.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 5) return false;
    const blocked = /^(quisiera|quiero|turno|reserv|camino|masaje|piel|no|hola|buen)/i;
    if (words.some((w) => blocked.test(w))) return false;
    return true;
  }

  /**
   * Si el usuario nombra un camino distinto (o arranca reserva), confirma + ASAP con botones.
   * Evita el caso "Voy a buscar..." sin selector.
   */
  private static async tryHardServiceSwitch(
    params: {
      tenantId: string;
      conversationId: string;
      leadId: string;
      phone: string;
      text: string;
    },
    ctx: BookingConversationContext,
    settings: any,
  ): Promise<FlowHandleResult | null> {
    const raw = params.text.trim();
    if (raw.length < 6) return null;
    // No interceptar taps numéricos del menú
    if (/^\d+$/.test(raw.trim())) return null;
    // Pregunta de info: no forzar ASAP; deja al agente explicar
    if (looksLikeServiceInfoQuery(raw) || looksLikePriceQuery(raw)) return null;

    const services = await prisma.bookingService.findMany({
      where: { tenantId: params.tenantId, isActive: true },
      select: {
        id: true, name: true, shortDescription: true, longDescription: true, serviceType: true,
      },
    });
    const match = matchServiceFromText(raw, services);
    if (!match) return null;

    // No pisar checkout ni cancelación pendiente
    if (ctx.checkout || ctx.agentState.pendingCancel || ctx.agentState.pendingReschedule) return null;

    // Si ya hay horario confirmado del MISMO camino, dejar seguir nombre/notas
    if (
      ctx.agentState.offeredSlot?.confirmed
      && ctx.agentState.service?.id === match.id
    ) {
      return null;
    }

    const sameAlready =
      ctx.agentState.service?.confirmed
      && ctx.agentState.service.id === match.id
      && ctx.agentState.browsePhase === 'presenting_slots'
      && (ctx.agentState.listedSlots?.length || 0) > 0;

    if (sameAlready) {
      // Reenviar selector del mismo camino
      return this.deliverFromCtx(params.conversationId, this.rebuildUiFromState(ctx));
    }

    const exec = this.toolExec(params, settings);
    let next = ctx;
    const { ctx: afterConfirm } = await BookingToolExecutor.execute(
      'confirm_service',
      { service_id: match.id, service_name: match.name },
      next,
      exec,
    );
    next = afterConfirm;

    const { ctx: afterSlots } = await BookingToolExecutor.execute(
      'find_available_slots',
      { mode: 'ASAP', limit: 2, exclude_shown: false },
      next,
      exec,
    );
    next = afterSlots;

    const svc = await prisma.bookingService.findUnique({ where: { id: match.id } });
    const intro = svc
      ? formatServicePreviewBody(svc, match.name).split('¿Querés reservar')[0].trim()
      : `Perfecto, *${match.name}*.`;

    // Entregar selector; body corto + slots (sin chat vacío del LLM)
    const delivered = this.rebuildUiFromState(next);
    if (delivered.agentState.uiPresentation) {
      delivered.agentState.uiPresentation = {
        ...delivered.agentState.uiPresentation,
        body: `${intro}\n\nEstos son los primeros horarios disponibles:`,
      };
    }
    return this.deliverFromCtx(params.conversationId, delivered);
  }

  /** Routing determinístico del segundo nivel de disponibilidad. */
  private static async handleBrowseRouting(
    params: {
      tenantId: string;
      conversationId: string;
      leadId: string;
      phone: string;
      text: string;
      profileName?: string | null;
    },
    ctx: BookingConversationContext,
    settings: any,
  ): Promise<FlowHandleResult | null> {
    const phase = ctx.agentState.browsePhase;
    if (!phase) return null;

    // Debounce a veces pega el menú del bot + la opción; usar la última línea no vacía
    const rawFull = params.text.trim();
    const lastLine = rawFull.split(/\n+/).map((l) => l.trim()).filter(Boolean).pop() || rawFull;
    const raw = lastLine;
    const input = normalizeInput(raw);
    const exec = this.toolExec(params, settings);

    const isMoreSlots = (itemCountBeforeMore: number) => {
      if (input === MORE_SLOTS_LABEL || input === 'ver mas' || /ver mas horarios|mas horarios|otros horarios/.test(input)) {
        return true;
      }
      // WhatsApp buttons envían "1","2","3" (id opt_N). "Ver más" es SIEMPRE la última opción.
      if (/^\d+$/.test(input)) {
        return parseInt(input, 10) === itemCountBeforeMore + 1;
      }
      return false;
    };

    // "Ver más" desde propuesta de slots / días / horas del día
    if (phase === 'presenting_slots' || phase === 'day_slots') {
      const n = ctx.agentState.listedSlots?.length || 0;
      if (n > 0 && isMoreSlots(n)) {
        const { ctx: next } = await BookingToolExecutor.execute('show_slot_browse_menu', {}, ctx, exec);
        return this.deliverFromCtx(params.conversationId, next);
      }
    }
    if (phase === 'picking_day') {
      const n = Math.min(ctx.agentState.availableDays?.length || 0, 8);
      if (n > 0 && isMoreSlots(n)) {
        const { ctx: next } = await BookingToolExecutor.execute('show_slot_browse_menu', {}, ctx, exec);
        return this.deliverFromCtx(params.conversationId, next);
      }
    }

    if (phase === 'more_menu') {
      if (input === MORE_MENU.thisWeek || input === '1') {
        const { ctx: next } = await BookingToolExecutor.execute(
          'get_available_days',
          { range: 'this_week' },
          ctx,
          exec,
        );
        return this.deliverFromCtx(params.conversationId, next);
      }
      if (input === MORE_MENU.nextWeek || input === '2' || input === 'proxima semana' || input === 'la semana proxima') {
        const { ctx: next } = await BookingToolExecutor.execute(
          'get_available_days',
          { range: 'next_week' },
          ctx,
          exec,
        );
        return this.deliverFromCtx(params.conversationId, next);
      }
      if (input === MORE_MENU.pickDate || input === '3' || input === 'elegir dia' || input === 'otra fecha') {
        await BookingContextService.save(params.conversationId, {
          ...ctx,
          agentState: {
            ...ctx.agentState,
            browsePhase: 'awaiting_date',
            datePreference: { mode: 'EXACT_DATE', daypart: ctx.agentState.datePreference?.daypart || 'ANY' },
            uiPresentation: null,
          },
        });
        return {
          handled: true,
          text: 'Decime qué día te queda bien. Podés escribir *jueves*, *mañana*, *20/07* o algo como *viernes a la tarde*.',
        };
      }
      // Día/fecha escrita directo sobre el menú de rangos → buscar esa fecha
      if (looksLikeDateQuery(raw)) {
        const { ctx: next } = await BookingToolExecutor.execute(
          'find_available_slots',
          { mode: 'EXACT_DATE', date_query: raw, exclude_shown: false, limit: 3 },
          ctx,
          exec,
        );
        return this.deliverFromCtx(params.conversationId, next);
      }
      // Texto libre sobre more_menu → soltar y dejar al agente
      if (looksLikeBrowseReleaseQuery(raw) || raw.length >= 3) {
        await BookingContextService.save(params.conversationId, {
          ...ctx,
          agentState: { ...ctx.agentState, browsePhase: null, uiPresentation: null },
        });
      }
      return null;
    }

    if (phase === 'awaiting_date') {
      if (!looksLikeDateQuery(raw) && raw.length < 3) {
        return {
          handled: true,
          text: 'Necesito una fecha o día. Ej: *jueves*, *mañana*, *25/07* o *el viernes después de las 17*.',
        };
      }
      const { ctx: next } = await BookingToolExecutor.execute(
        'find_available_slots',
        {
          mode: 'EXACT_DATE',
          date_query: raw,
          exclude_shown: false,
          limit: 3,
        },
        ctx,
        exec,
      );
      return this.deliverFromCtx(params.conversationId, next);
    }

    if (phase === 'picking_day') {
      const days = (ctx.agentState.availableDays || []).slice(0, 8);
      const byIndex = /^\d+$/.test(input) ? days[parseInt(input, 10) - 1] : null;
      const byLabel = days.find((d) => {
        const label = normalizeInput(d.label);
        return label === input || d.date === input || label.includes(input) || input.includes(label);
      });
      const day = byIndex || byLabel;
      if (day) {
        const { ctx: next } = await BookingToolExecutor.execute(
          'get_slots_for_day',
          { date: day.date },
          ctx,
          exec,
        );
        return this.deliverFromCtx(params.conversationId, next);
      }
      if (looksLikeDateQuery(raw)) {
        const { ctx: next } = await BookingToolExecutor.execute(
          'find_available_slots',
          { mode: 'EXACT_DATE', date_query: raw, exclude_shown: false, limit: 3 },
          ctx,
          exec,
        );
        return this.deliverFromCtx(params.conversationId, next);
      }
      // Texto libre / tap inválido sobre lista de días → soltar browse
      await BookingContextService.save(params.conversationId, {
        ...ctx,
        agentState: { ...ctx.agentState, browsePhase: null, uiPresentation: null },
      });
      return null;
    }

    if (phase === 'presenting_slots' || phase === 'day_slots') {
      const slots = ctx.agentState.listedSlots || [];
      const byIndex = /^\d+$/.test(input) ? slots[parseInt(input, 10) - 1] : null;
      const byLabel = slots.find((s) => {
        const n = normalizeInput(s.label);
        return n === input || normalizeInput(s.time) === input || n.includes(input);
      });
      const pick = byIndex || byLabel;
      if (pick) {
        const { ctx: next } = await BookingToolExecutor.execute(
          'confirm_slot',
          { date: pick.date, time: pick.time, label: pick.label },
          ctx,
          exec,
        );
        if (next.agentState.uiPresentation?.options?.length) {
          return this.deliverFromCtx(params.conversationId, next);
        }
        if (next.agentState.offeredSlot?.confirmed) {
          await BookingContextService.save(params.conversationId, next);
          const slotLabel = next.agentState.offeredSlot.label;
          if (!next.agentState.customer?.nameConfirmed) {
            return {
              handled: true,
              text: `Quedó anotado: *${slotLabel}*.\n\nPasame tu *nombre y apellido* para dejar el turno preparado.`,
            };
          }
          if (!next.agentState.customer?.notesCollected) {
            return {
              handled: true,
              text: `Quedó anotado: *${slotLabel}*.\n\n¿Hay algo que quieras avisar antes de la sesión? Si no, respondé *no*.`,
            };
          }
          const { ctx: checkoutCtx, result } = await BookingToolExecutor.execute(
            'initiate_checkout',
            {},
            next,
            exec,
          );
          if (result.ok && checkoutCtx.checkout) {
            // NUNCA reenviar el tap del slot a handle() — "3" se confunde con "Cambiar horario"
            return BookingCheckoutService.presentAfterCheckoutStarted({
              tenantId: params.tenantId,
              conversationId: params.conversationId,
            });
          }
          return this.deliverFromCtx(params.conversationId, checkoutCtx, result.error || undefined);
        }
      }
      // Otra fecha/día mientras hay slots → buscar esa fecha (no re-spamear la lista vieja)
      if (looksLikeDateQuery(raw)) {
        const { ctx: next } = await BookingToolExecutor.execute(
          'find_available_slots',
          { mode: 'EXACT_DATE', date_query: raw, exclude_shown: false, limit: 3 },
          ctx,
          exec,
        );
        return this.deliverFromCtx(params.conversationId, next);
      }
    }

    // Info / precios / cualquier texto que no fue tap de slot: soltar browse sticky
    // (mismo patrón que pendingRecommend — evita re-mandar "Estos son los primeros horarios...")
    await BookingContextService.save(params.conversationId, {
      ...ctx,
      agentState: {
        ...ctx.agentState,
        browsePhase: null,
        uiPresentation: null,
      },
    });

    return null;
  }

  private static rebuildUiFromState(ctx: BookingConversationContext): BookingConversationContext {
    const a = ctx.agentState;
    if (a.uiPresentation?.options?.length) return ctx;

    if (
      (a.browsePhase === 'presenting_slots' || a.browsePhase === 'day_slots')
      && a.listedSlots?.length
    ) {
      return {
        ...ctx,
        agentState: {
          ...a,
          uiPresentation: {
            type: a.browsePhase === 'day_slots' ? 'day_slots' : 'quick_slots',
            body: a.browsePhase === 'day_slots'
              ? 'Horarios disponibles:'
              : 'Estos son los primeros horarios disponibles:',
            options: [
              ...a.listedSlots.map((s) => (a.browsePhase === 'day_slots' ? s.time : s.label)),
              'Ver más horarios',
            ],
          },
        },
      };
    }

    if (a.browsePhase === 'picking_day' && a.availableDays?.length) {
      return {
        ...ctx,
        agentState: {
          ...a,
          uiPresentation: {
            type: 'available_days',
            body: 'Tengo disponibilidad estos días:',
            options: [...a.availableDays.slice(0, 8).map((d) => d.label), 'Ver más horarios'],
          },
        },
      };
    }

    if (a.browsePhase === 'more_menu') {
      return {
        ...ctx,
        agentState: {
          ...a,
          uiPresentation: {
            type: 'more_menu',
            body: '¿Cómo preferís buscar?',
            options: ['Esta semana', 'Semana próxima', 'Elegir fecha'],
          },
        },
      };
    }

    return ctx;
  }

  private static async ensureAvailabilityUi(
    params: {
      tenantId: string;
      conversationId: string;
      leadId: string;
      phone: string;
      text?: string;
    },
    ctx: BookingConversationContext,
    settings: any,
  ): Promise<BookingConversationContext> {
    let next = this.rebuildUiFromState(ctx);
    const a = next.agentState;

    if (!a.service?.confirmed) return next;
    if (a.offeredSlot?.confirmed) return next;
    if (a.browsePhase === 'awaiting_date') return next;
    // more_menu + servicio confirmado distinto / sin UI → forzar ASAP (cambio de camino)
    if (a.browsePhase === 'more_menu' && a.uiPresentation?.options?.length) return next;
    if (a.uiPresentation?.options?.length) return next;

    // Pregunta de info/precios: no pisar la respuesta del agente con ASAP
    const raw = String(params.text || '').trim();
    if (raw && looksLikeBrowseReleaseQuery(raw)) return next;

    // Servicio confirmado sin propuesta visible → ASAP obligatorio
    const { ctx: searched } = await BookingToolExecutor.execute(
      'find_available_slots',
      { mode: 'ASAP', limit: 2, exclude_shown: false },
      { ...next, agentState: { ...a, browsePhase: null, uiPresentation: null } },
      this.toolExec(params, settings),
    );
    return searched;
  }

  private static async deliverFromCtx(
    conversationId: string,
    ctx: BookingConversationContext,
    replyFallback?: string,
  ): Promise<FlowHandleResult> {
    return this.deliverAgentResult(conversationId, replyFallback || '', ctx);
  }

  private static async deliverAgentResult(
    conversationId: string,
    reply: string,
    nextCtx: BookingConversationContext,
  ): Promise<FlowHandleResult> {
    const ctx = this.rebuildUiFromState(nextCtx);
    await BookingContextService.save(conversationId, ctx);

    const ui = ctx.agentState.uiPresentation;
    const replyText = (reply || '').trim();
    // Si el agente ya respondió (precios/info) y la UI es solo rebuild sticky, no pisar el texto
    const stickyRebuild =
      !!ui?.options?.length
      && !nextCtx.agentState.uiPresentation?.options?.length
      && !!replyText
      && replyText.length > 20;

    if (ui?.options?.length && !stickyRebuild) {
      await BookingContextService.save(conversationId, {
        ...ctx,
        agentState: { ...ctx.agentState, uiPresentation: null },
      });
      return BookingFlowService.buildOptionsReply(ui.body, ui.options);
    }

    if (stickyRebuild) {
      await BookingContextService.save(conversationId, {
        ...ctx,
        agentState: { ...ctx.agentState, browsePhase: null, uiPresentation: null },
      });
    }

    return { handled: true, text: replyText || 'Contame en qué te ayudo 🌿' };
  }

  private static async runAgent(
    params: {
      tenantId: string;
      conversationId: string;
      leadId: string;
      phone: string;
      text: string;
      profileName?: string | null;
    },
    ctx: Awaited<ReturnType<typeof BookingContextService.load>>,
    settings: any,
  ) {
    const { reply, ctx: nextCtx } = await BookingAgentService.run({
      ...params,
      ctx,
      settings,
    });
    const checkoutStarted = !!nextCtx.checkout && !ctx.checkout;
    return { reply, ctx: nextCtx, checkoutStarted };
  }

  private static async handleCancelIntent(
    params: {
      tenantId: string;
      conversationId: string;
      leadId: string;
      phone: string;
      text: string;
      profileName?: string | null;
    },
    ctx: Awaited<ReturnType<typeof BookingContextService.load>>,
  ): Promise<FlowHandleResult> {
    const settings = await prisma.bookingSettings.findUnique({ where: { tenantId: params.tenantId } });
    if (!settings?.cancelEnabled) {
      return { handled: true, text: 'Por el momento no podemos cancelar turnos automáticamente por acá. Escribí *humano* para ayuda.' };
    }

    const { reply, ctx: nextCtx } = await BookingAgentService.run({
      ...params,
      text: `${params.text}\n\n[El usuario quiere cancelar. Usá list_my_appointments y luego request_cancel_appointment — NUNCA cancel_appointment directo.]`,
      ctx: { ...ctx, agentState: { ...ctx.agentState, mode: 'booking' } },
      settings: settings!,
    });
    return this.deliverAgentResult(params.conversationId, reply, nextCtx);
  }

  private static async startRescheduleFlow(
    params: {
      tenantId: string;
      conversationId: string;
      leadId: string;
      phone: string;
      text: string;
    },
    ctx: BookingConversationContext,
    settings: any,
  ): Promise<FlowHandleResult> {
    const apts = await BookingRescheduleService.listActive({
      tenantId: params.tenantId,
      leadId: params.leadId,
      timezone: settings.timezone,
    });

    if (!apts.length) {
      return {
        handled: true,
        text: 'No tenés turnos confirmados o señados para reprogramar. Si querés reservar uno nuevo, escribí *menu*.',
      };
    }

    if (apts.length === 1) {
      return this.presentRescheduleSlots(params.conversationId, params.tenantId, ctx, apts[0]);
    }

    const options = apts.map((a) => a.label);
    const next: BookingConversationContext = {
      ...ctx,
      agentState: {
        ...ctx.agentState,
        pendingCancel: null,
        pendingReschedule: {
          appointmentId: '',
          label: '',
          serviceId: '',
          phase: 'pick_apt',
          options: apts.map((a) => ({ id: a.id, label: a.label, serviceId: a.serviceId })),
        },
        browsePhase: null,
        uiPresentation: {
          type: 'more_menu',
          body: '¿Cuál turno querés reprogramar? (mismo cobro, solo cambia la fecha)',
          options: [...options, 'Dejar como está'],
        },
      },
    };
    await BookingContextService.save(params.conversationId, next);
    return BookingFlowService.buildOptionsReply(
      next.agentState.uiPresentation!.body,
      next.agentState.uiPresentation!.options,
    );
  }

  private static async presentRescheduleSlots(
    conversationId: string,
    tenantId: string,
    ctx: BookingConversationContext,
    apt: { id: string; label: string; serviceId: string },
    opts?: { more?: boolean },
  ): Promise<FlowHandleResult> {
    const shown = opts?.more ? (ctx.agentState.shownSlotKeys || []) : [];
    const allSlots = await BookingRescheduleService.getAvailableSlotsForReschedule({
      tenantId,
      appointmentId: apt.id,
      limit: opts?.more ? 20 : 8,
    });

    let filtered = allSlots;
    if (shown.length) {
      filtered = allSlots.filter((s) => !shown.includes(slotKey(s.date, s.time)));
    }
    const toShow = filtered.slice(0, 5).map((s) => ({ date: s.date, time: s.time, label: s.label }));
    if (!toShow.length) {
      await BookingContextService.save(conversationId, {
        ...ctx,
        agentState: {
          ...ctx.agentState,
          pendingReschedule: null,
          browsePhase: null,
          uiPresentation: null,
        },
      });
      return {
        handled: true,
        text: opts?.more
          ? 'No encontré más horarios libres por ahora. Escribí *humano* si necesitás ayuda.'
          : 'No hay horarios libres para reprogramar ahora. Probá más tarde o escribí *humano*.',
      };
    }

    const prevShown = opts?.more ? shown : [];
    const nextShown = [...prevShown, ...toShow.map((s) => slotKey(s.date, s.time))];
    const body = `Reprogramamos tu turno (mismo cobro):\n\n${apt.label}\n\nElegí el nuevo horario:`;
    const options = [...toShow.map((s) => s.label), 'Ver más horarios', 'Dejar como está'];
    await BookingContextService.save(conversationId, {
      ...ctx,
      agentState: {
        ...ctx.agentState,
        pendingCancel: null,
        pendingReschedule: {
          appointmentId: apt.id,
          label: apt.label,
          serviceId: apt.serviceId,
          phase: 'pick_slot',
        },
        listedSlots: toShow,
        shownSlotKeys: nextShown,
        browsePhase: 'presenting_slots',
        uiPresentation: null,
      },
    });
    return BookingFlowService.buildOptionsReply(body, options);
  }

  private static async handlePendingReschedule(
    params: {
      tenantId: string;
      conversationId: string;
      leadId: string;
      phone: string;
      text: string;
    },
    ctx: BookingConversationContext,
    settings: any,
  ): Promise<FlowHandleResult | null> {
    const pending = ctx.agentState.pendingReschedule;
    if (!pending) return null;

    const input = normalizeInput(params.text);
    const abort =
      /^(dejar como est[aá]|mejor no|no|cancelar|volver|menu|menú)$/i.test(input.trim())
      || input.includes('dejar como esta')
      || input.includes('dejar como está');

    if (abort) {
      await BookingContextService.save(params.conversationId, {
        ...ctx,
        agentState: {
          ...ctx.agentState,
          pendingReschedule: null,
          listedSlots: [],
          browsePhase: null,
          uiPresentation: null,
        },
      });
      return { handled: true, text: 'Dale, dejamos el turno como está. ¿En qué más te ayudo?' };
    }

    if (pending.phase === 'pick_apt') {
      const opts = pending.options || [];
      const byIndex = /^\d+$/.test(input) ? opts[parseInt(input, 10) - 1] : null;
      const byLabel = opts.find((o) => {
        const n = normalizeInput(o.label);
        return n === input || n.includes(input) || input.includes(n);
      });
      const pick = byIndex || byLabel;
      if (!pick) {
        return BookingFlowService.buildOptionsReply(
          'Elegí uno de los turnos de la lista, o *Dejar como está*.',
          [...opts.map((o) => o.label), 'Dejar como está'],
        );
      }
      return this.presentRescheduleSlots(
        params.conversationId,
        params.tenantId,
        ctx,
        { id: pick.id, label: pick.label, serviceId: pick.serviceId },
      );
    }

    // pick_slot
    if (input === MORE_SLOTS_LABEL || input === 'ver mas horarios' || input.includes('ver más')) {
      return this.presentRescheduleSlots(
        params.conversationId,
        params.tenantId,
        ctx,
        {
          id: pending.appointmentId,
          label: pending.label,
          serviceId: pending.serviceId,
        },
        { more: true },
      );
    }

    const slots = ctx.agentState.listedSlots || [];
    const byIndex = /^\d+$/.test(input) ? slots[parseInt(input, 10) - 1] : null;
    const byLabel = slots.find((s) => {
      const n = normalizeInput(s.label);
      return n === input || normalizeInput(s.time) === input || n.includes(input);
    });
    const pick = byIndex || byLabel;
    if (!pick) {
      // Fecha escrita → buscar ese día
      if (looksLikeDateQuery(params.text)) {
        const daySlots = await BookingRescheduleService.getAvailableSlotsForReschedule({
          tenantId: params.tenantId,
          appointmentId: pending.appointmentId,
          limit: 40,
        });
        const { filterSlotsByQuery } = await import('./booking-datetime.service');
        const tz = settings.timezone || 'America/Argentina/Cordoba';
        const filtered = filterSlotsByQuery(params.text, tz, daySlots).slice(0, 5);
        const toShow = (filtered.length ? filtered : daySlots.slice(0, 5)).map((s) => ({
          date: s.date,
          time: s.time,
          label: s.label,
        }));
        if (!toShow.length) {
          return {
            handled: true,
            text: 'No encontré horarios libres para esa fecha. Probá otro día o elegí de la lista.',
          };
        }
        await BookingContextService.save(params.conversationId, {
          ...ctx,
          agentState: {
            ...ctx.agentState,
            listedSlots: toShow,
            shownSlotKeys: [
              ...(ctx.agentState.shownSlotKeys || []),
              ...toShow.map((s) => slotKey(s.date, s.time)),
            ],
            browsePhase: 'presenting_slots',
            uiPresentation: null,
          },
        });
        return BookingFlowService.buildOptionsReply(
          `Horarios libres cerca de lo que pediste:\n\nTurno a mover: ${pending.label}`,
          [...toShow.map((s) => s.label), 'Ver más horarios', 'Dejar como está'],
        );
      }

      if (slots.length) {
        return BookingFlowService.buildOptionsReply(
          `Elegí un horario de la lista para mover:\n\n${pending.label}`,
          [...slots.map((s) => s.label), 'Ver más horarios', 'Dejar como está'],
        );
      }
      return {
        handled: true,
        text: 'No hay horarios en la lista. Escribí *reprogramar* para intentar de nuevo, o *Dejar como está*.',
      };
    }

    const result = await BookingRescheduleService.applyInPlace({
      tenantId: params.tenantId,
      leadId: params.leadId,
      appointmentId: pending.appointmentId,
      date: pick.date,
      time: pick.time,
      source: 'bot',
    });

    await BookingContextService.save(params.conversationId, {
      ...ctx,
      agentState: {
        ...ctx.agentState,
        pendingReschedule: null,
        listedSlots: [],
        shownSlotKeys: [],
        browsePhase: null,
        uiPresentation: null,
        offeredSlot: null,
      },
    });

    if (!result.ok) {
      return { handled: true, text: result.error };
    }

    return {
      handled: true,
      text: `Listo, reprogramamos tu turno (mismo cobro):\n\nAntes: ${result.oldLabel}\nAhora: *${result.newLabel}*\n\n¿Necesitás algo más?`,
    };
  }

  private static async looksLikeSpecificIntent(
    tenantId: string,
    rawText: string,
    input: string,
  ): Promise<boolean> {
    if (BookingAiService.looksLikeGreeting(rawText) && rawText.trim().length < 25) return false;
    if (BookingAiService.looksLikePriceQuestion(rawText)) return true;
    if (BookingAiService.looksLikeAvailabilityQuestion(rawText)) return true;
    if (BookingAiService.looksLikeInfoRequest(rawText)) return true;
    if (looksLikeCancelIntent(input)) return true;
    if (looksLikeRescheduleIntent(input)) return true;
    if (/reserv|turno|quiero|necesito|masaje|camino|sesión|sesion/.test(input)) return true;

    const services = await prisma.bookingService.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true, shortDescription: true, longDescription: true, serviceType: true },
    });
    if (matchServiceFromText(rawText, services)) return true;

    for (const opt of [...MAIN_MENU_OPTIONS, ...MAIN_MENU_OPTIONS_V2]) {
      if (input.includes(opt.toLowerCase().slice(0, 8))) return true;
    }

    return rawText.trim().length >= 20;
  }
}
