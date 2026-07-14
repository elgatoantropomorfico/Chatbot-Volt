import { prisma } from '../config/database';
import { BookingContextService } from './booking-context.service';
import { BookingAgentService } from './booking-agent.service';
import { BookingCheckoutService } from './booking-checkout.service';
import { BookingFlowService, type FlowHandleResult } from './booking-flow.service';
import { BookingAiService } from './booking-ai.service';
import { matchServiceFromText } from './booking-flow-nav.service';
import { BookingExpiryService } from './booking-notification.service';
import { BookingToolExecutor } from './booking-tool-executor.service';
import type { BookingConversationContext } from './booking-agent.types';
import { looksLikeDateQuery } from './booking-datetime.service';

const AUDIO_BLOCK_MSG = '🎤 Por ahora la turnera funciona solo con mensajes de *texto*. Escribime lo que necesitás y te ayudo con la reserva 🌿';

const MAIN_MENU_OPTIONS = ['Ayudame a elegir', 'Ya sé cuál quiero', 'Ver precios'];
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

    // Menú de horarios: routing duro (no LLM) — Ver más / rangos / elegir fecha / día
    const browseHandled = await this.handleBrowseRouting(params, ctx, settings);
    if (browseHandled) return browseHandled;

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
      return BookingCheckoutService.handle(params);
    }

    return this.deliverAgentResult(params.conversationId, reply, nextCtx);
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

    const input = normalizeInput(params.text);
    const raw = params.text.trim();
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
            return BookingCheckoutService.handle({ ...params, text: params.text });
          }
          return this.deliverFromCtx(params.conversationId, checkoutCtx, result.error || undefined);
        }
      }
    }

    return null;
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
    await BookingContextService.save(conversationId, nextCtx);

    const ui = nextCtx.agentState.uiPresentation;
    if (ui?.options?.length) {
      await BookingContextService.save(conversationId, {
        ...nextCtx,
        agentState: { ...nextCtx.agentState, uiPresentation: null },
      });
      // Siempre el body de la tool: evita menú duplicado por el LLM
      return BookingFlowService.buildOptionsReply(ui.body, ui.options);
    }

    return { handled: true, text: reply || 'Contame en qué te ayudo 🌿' };
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
    if (/reserv|turno|quiero|necesito|masaje|camino|sesión|sesion/.test(input)) return true;

    const services = await prisma.bookingService.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true, shortDescription: true, longDescription: true, serviceType: true },
    });
    if (matchServiceFromText(rawText, services)) return true;

    for (const opt of MAIN_MENU_OPTIONS) {
      if (input.includes(opt.toLowerCase().slice(0, 8))) return true;
    }

    return rawText.trim().length >= 20;
  }
}
