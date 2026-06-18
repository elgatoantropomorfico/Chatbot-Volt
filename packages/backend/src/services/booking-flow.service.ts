/**
 * Conversational booking flow — state machine (no free-form IA).
 * IA hooks added in Fase 7.
 */
import { prisma } from '../config/database';
import { BookingAvailabilityService } from './booking-availability.service';
import { BookingPricingService } from './booking-pricing.service';
import { MercadoPagoService } from './mercadopago.service';
import { BookingAiService } from './booking-ai.service';
import { BookingFlowIntentService } from './booking-flow-intent.service';
import {
  CONFIRM_PAYMENT_SENA_OPTIONS,
  CONFIRM_PAYMENT_TOTAL_OPTIONS,
  CONFIRM_SERVICE_OPTIONS,
  CONFIRM_SLOT_OPTIONS,
  formatServicePreviewBody,
  isConfirmModify,
  isConfirmYes,
  matchServiceFromText,
  nextStepAfterConfirm,
  parsePaymentPreview,
  type SlotPick,
} from './booking-flow-nav.service';
import { BookingExpiryService } from './booking-notification.service';
import { HandoffService } from './handoff.service';
import crypto from 'crypto';

/** Mensajes internos del flujo de cancelación (no editables en turnera) */
const CANCEL_MSG = {
  select: 'Estos son tus turnos activos. Elegí cuál querés cancelar:',
  none: 'No encontré turnos activos para cancelar. Si querés reservar uno nuevo, escribí *menu*.',
  unavailable: 'Ese turno ya no está disponible para cancelar.',
  disabled: 'Por el momento no podemos cancelar turnos automáticamente por acá.',
  done: (service: string, slot: string) =>
    `Listo, cancelamos tu turno:\n\n${service} — ${slot}\n\nSi querés reservar otro horario, escribí *menu*.`,
  warning: (service: string, slot: string, policy: string) =>
    `¿Confirmás la cancelación de este turno?\n\n${service} — ${slot}\n\n⚠️ Esta acción no tiene vuelta atrás.\n${policy}`,
};

function notesPromptText(greeting?: string): string {
  const body = `¿Hay algo que quieras avisar antes de la sesión?

Algunos ejemplos: _tengo la piel sensible_, _me cuesta respirar boca abajo_ o _prefiero evitar cierta zona_.

Si no hay nada que comentar, respondé *no*.`;
  return greeting ? `${greeting}\n\n🌿 ${body}` : `🌿 ${body}`;
}

export interface FlowInteractive {
  type: 'button' | 'list';
  body: string;
  buttons?: Array<{ id: string; title: string }>;
  listButtonText?: string;
  listRows?: Array<{ id: string; title: string; description?: string }>;
  listSectionTitle?: string;
}

export interface FlowHandleResult {
  handled: boolean;
  text?: string;
  handoff?: boolean;
  interactive?: FlowInteractive;
}

export type BookingFlowState =
  | 'idle'
  | 'booking_start'
  | 'choosing_service_mode'
  | 'recommender_q1'
  | 'recommender_q2'
  | 'service_selected'
  | 'slot_selection'
  | 'confirm_slot_preview'
  | 'confirm_service_preview'
  | 'confirm_payment_preview'
  | 'customer_name'
  | 'customer_notes'
  | 'payment_choice'
  | 'waiting_payment'
  | 'confirmed'
  | 'handoff'
  | 'cancel_pick'
  | 'cancel_confirm';

export interface BookingFlowContext {
  state: BookingFlowState;
  serviceId?: string;
  serviceName?: string;
  slotDate?: string;
  slotTime?: string;
  slotLabel?: string;
  appointmentId?: string;
  recommenderQ1?: string;
  recommenderQ2?: string;
  customerName?: string;
  isFirstTime?: boolean;
  customerNotes?: string;
  paymentType?: 'sena' | 'total';
  slotPage?: number;
  slotBrowse?: 'more_menu' | 'pick_day';
  tempSlots?: Array<{ date: string; time: string; label: string }>;
  cancelAppointmentId?: string;
  cancelOptions?: Array<{ id: string; label: string; listTitle: string }>;
  previewSlots?: SlotPick[];
  previewSlot?: SlotPick;
  previewServiceId?: string;
  previewServiceName?: string;
  previewPaymentType?: 'sena' | 'total';
  pricePreviewActive?: boolean;
  notesStepDone?: boolean;
}

const MAIN_MENU_COMMANDS = ['menú', 'menu', 'empezar de nuevo', 'inicio'];
const MAIN_MENU_OPTIONS = ['Ayudame a elegir', 'Ya sé cuál quiero', 'Ver precios'];
const RECOMMENDER_Q1_OPTIONS = ['Soltar tensión', 'Descansar piernas', 'Calor profundo', 'Experiencia sensorial', 'Aflojar rigidez'];
const RECOMMENDER_Q2_OPTIONS = ['Suave y relajante', 'Profunda y envolvente', 'Con calor', 'Con aromas/herbales', 'Más corporal'];
const SERVICE_SELECTED_OPTIONS = ['Reservar este camino', 'Ver otros caminos', 'Hablar con persona'];
const MORE_SLOTS_OPTIONS = ['Esta semana', 'Elegir un día', 'Próximos horarios'];
const CANCEL_CONFIRM_OPTIONS = ['Sí, cancelar', 'No, volver'];
const GO_HOME_LABEL = 'Volver al inicio';
const GO_HOME_COMMANDS = ['volver al inicio', 'volver al menu', 'volver al menú', ...MAIN_MENU_COMMANDS];
const HOME_HINT = '\n\n_(También podés escribir *menu* para volver al inicio)_';

const NON_NAME_WORDS = /^(quisiera|me|gustaría|gustaria|más|mas|información|informacion|sobre|los|las|el|la|qué|que|cómo|como|tratamiento|tratamientos|camino|caminos|turno|reserva|precio|horario|cuánto|cuanto|hay|tienen|puedo|contame|explicame|para|muy|mucho|tengo|necesito|quiero|saber|decime|hola|buenas|leí|lei|algún|algun|alguna|y|o|un|una|de|en|con|por|si|no)$/i;

function normalizeInput(text: string): string {
  return text.trim().toLowerCase();
}

function looksLikeCancelIntent(input: string): boolean {
  if (/no\s+(quiero|voy\s+a)\s+cancelar/.test(input)) return false;
  if (/^(cancelar|anular)(\s+(mi|el|un))?\s*(turno|reserva|cita)?\s*$/.test(input)) return true;
  if (/quiero\s+cancelar/.test(input)) return true;
  if (/cancel(ar|ación|acion).*(turno|reserva|cita)/.test(input)) return true;
  if (/(turno|reserva|cita).*(cancel|anular)/.test(input)) return true;
  return false;
}

function isExactCommand(input: string, command: string): boolean {
  return input === command || input === command.replace('ó', 'o');
}

function pickOption(text: string, max: number): number | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;

  // Botones interactivos de WhatsApp envían "1", "2", etc.
  if (/^\d+$/.test(t)) {
    const n = parseInt(t, 10);
    return n >= 1 && n <= max ? n : null;
  }

  const wordOnly: Record<string, number> = {
    uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  };
  if (wordOnly[t] != null && wordOnly[t] <= max) return wordOnly[t];

  // "opción 2" al inicio
  const lead = t.match(/^(?:opci[oó]n\s+)?(\d+)\b/);
  if (lead) {
    const n = parseInt(lead[1], 10);
    return n >= 1 && n <= max ? n : null;
  }

  return null;
}

/** Texto libre que claramente no es elección de menú */
function isFreeTextOffFlow(rawText: string, input: string, maxOptions?: number): boolean {
  if (BookingAiService.looksLikeGreeting(rawText)) return false;
  if (maxOptions != null && pickOption(input, maxOptions) !== null) return false;
  if (isMoreOptionsInput(input, maxOptions || 99)) return false;
  if (isGoHomeIntent(input)) return false;
  return BookingAiService.looksLikeQuestion(rawText) || rawText.trim().length >= 12;
}

function isGoHomeIntent(input: string): boolean {
  return GO_HOME_COMMANDS.some((c) => isExactCommand(input, c) || input === c.replace('ó', 'o'));
}

function looksLikePersonName(raw: string): boolean {
  const t = raw.trim();
  if (!t || t.length < 2 || t.includes('?')) return false;
  if (BookingAiService.looksLikeQuestion(t)) return false;
  if (BookingAiService.looksLikeInfoRequest(t)) return false;
  if (!/^[\p{L}\s'.-]{2,80}$/u.test(t)) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 5) return false;
  if (words.some((w) => NON_NAME_WORDS.test(w))) return false;
  if (words.some((w) => w.length > 20)) return false;
  return true;
}

function isNotesSkip(input: string): boolean {
  return /^(no|nada|ninguno|ninguna|nop|na|sin notas|no hay nada|nope)$/i.test(input.trim());
}

/** Pregunta real en el paso de notas — no confundir con un aviso del cliente */
function looksLikeNotesQuestion(rawText: string): boolean {
  const t = rawText.trim();
  if (!t || isNotesSkip(t)) return false;
  if (t.includes('?')) return true;
  return /^(qué|que|cómo|como|cuánto|cuanto|cuál|cual|dónde|donde|hay |tienen |puedo |me pod[eé]s|quisiera saber|para qué|para que|cuánto|cuanto)/i.test(t);
}

type FlowPickResult =
  | { kind: 'home' }
  | { kind: 'option'; index: number }
  | { kind: 'invalid' };

function pickFlowOption(input: string, baseCount: number, withHome: boolean): FlowPickResult {
  const total = withHome ? baseCount + 1 : baseCount;
  const opt = pickOption(input, total);
  if (!opt) return { kind: 'invalid' };
  if (withHome && opt === total) return { kind: 'home' };
  if (opt > baseCount) return { kind: 'invalid' };
  return { kind: 'option', index: opt };
}

/**
 * Validación defensiva: número → coloquial → IA clasificador.
 * Prioriza encajar el mensaje en el menú actual antes de off-flow.
 */
async function resolveFlowMenuPick(
  tenantId: string,
  input: string,
  rawText: string,
  baseCount: number,
  withHome: boolean,
  options: string[],
  numericOnly = false,
): Promise<FlowPickResult> {
  const numeric = pickFlowOption(input, baseCount, withHome);
  if (numeric.kind !== 'invalid') return numeric;

  if (withHome && (isGoHomeIntent(input) || BookingFlowIntentService.matchesHomeColloquial(rawText))) {
    return { kind: 'home' };
  }

  if (numericOnly) return { kind: 'invalid' };

  const colloquial = BookingFlowIntentService.matchColloquialOption(rawText, options);
  if (colloquial != null && colloquial >= 1 && colloquial <= baseCount) {
    return { kind: 'option', index: colloquial };
  }

  if (BookingFlowIntentService.shouldTryAiMenuMatch(rawText, options)) {
    const aiPick = await BookingFlowIntentService.classifyMenuOption(rawText, options);
    if (aiPick != null && aiPick >= 1 && aiPick <= baseCount) {
      return { kind: 'option', index: aiPick };
    }
  }

  return { kind: 'invalid' };
}

function isMoreOptionsInput(input: string, totalOptions: number): boolean {
  if (pickOption(input, totalOptions) === totalOptions) return true;
  return /más opciones|mas opciones|ver más|ver mas|más horarios|mas horarios/.test(input);
}

function msg(settings: any, key: string, fallback: string): string {
  const messages = (settings?.messagesJson || {}) as Record<string, string>;
  return messages[key] || fallback;
}

/** Build WhatsApp interactive reply with numbered fallback in text */
function flowReply(body: string, options: string[], includeHome = false): FlowHandleResult {
  const opts = includeHome ? [...options, GO_HOME_LABEL] : options;
  const numbered = opts.map((o, i) => `${i + 1}️⃣ ${o}`).join('\n');
  const fullText = `${body}\n\n${numbered}`;

  if (opts.length <= 3) {
    return {
      handled: true,
      text: fullText,
      interactive: {
        type: 'button',
        body,
        buttons: opts.map((title, i) => ({
          id: `opt_${i + 1}`,
          title: title.length > 20 ? `${i + 1}. ${title}`.slice(0, 20) : title,
        })),
      },
    };
  }

  return {
    handled: true,
    text: fullText,
    interactive: {
      type: 'list',
      body,
      listButtonText: 'Ver opciones',
      listSectionTitle: 'Elegí una opción',
      listRows: opts.map((title, i) => ({
        id: `opt_${i + 1}`,
        title: title.slice(0, 24),
        description: '',
      })),
    },
  };
}

function prependToReply(result: FlowHandleResult, prefix: string): FlowHandleResult {
  if (result.interactive) {
    return {
      ...result,
      text: `${prefix}\n\n${result.text}`,
      interactive: {
        ...result.interactive,
        body: `${prefix}\n\n${result.interactive.body}`.slice(0, 1020),
      },
    };
  }
  return { ...result, text: `${prefix}\n\n${result.text}` };
}

export class BookingFlowService {
  static async getFlow(conversationId: string): Promise<BookingFlowContext> {
    const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
    const raw = (conv?.bookingFlowJson as unknown as BookingFlowContext) || null;
    return raw?.state ? raw : { state: 'idle' };
  }

  static async saveFlow(conversationId: string, flow: BookingFlowContext) {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { bookingFlowJson: flow as any },
    });
  }

  static async handle(params: {
    tenantId: string;
    conversationId: string;
    leadId: string;
    phone: string;
    text: string;
    profileName?: string | null;
  }): Promise<FlowHandleResult> {
    const { tenantId, conversationId, leadId, phone, text } = params;
    const input = normalizeInput(text);

    const settings = await prisma.bookingSettings.findUnique({ where: { tenantId } });
    if (!settings?.bookingEnabled) return { handled: false };

    await BookingExpiryService.expireStaleHolds(tenantId);

    let flow = await this.getFlow(conversationId);
    const reconciled = await this.reconcileStaleFlow(conversationId, flow, settings);
    flow = reconciled.flow;

    if (reconciled.expiredNotice) {
      const inputNorm = normalizeInput(text);
      if (isFreeTextOffFlow(text, inputNorm, 3) || BookingAiService.looksLikeAvailabilityQuestion(text)) {
        let answer: string | null = null;
        if (BookingAiService.looksLikeAvailabilityQuestion(text)) {
          answer = await BookingAiService.answerAvailabilityQuestion(tenantId, text, settings);
        } else {
          answer = await BookingAiService.answerOffFlow(tenantId, text, settings);
        }
        const body = [reconciled.expiredNotice, answer].filter(Boolean).join('\n\n');
        return this.mainMenuOptionsReply(body);
      }
      return this.mainMenuOptionsReply(reconciled.expiredNotice);
    }

    if (flow.state === 'cancel_pick') {
      return this.handleCancelPick(tenantId, conversationId, leadId, phone, settings, flow, input, text);
    }
    if (flow.state === 'cancel_confirm') {
      return this.handleCancelConfirm(tenantId, conversationId, settings, flow, input, text);
    }

    if (isExactCommand(input, 'humano') || input === 'hablar con persona') {
      await this.saveFlow(conversationId, { state: 'handoff' });
      return { handled: true, handoff: true, text: msg(settings, 'human_handoff', 'Te comunico con una persona del equipo.') };
    }

    if (MAIN_MENU_COMMANDS.some((c) => isExactCommand(input, c))) {
      return this.goToMainMenu(tenantId, conversationId, settings, flow, text);
    }

    if (looksLikeCancelIntent(input)) {
      if (flow.state === 'waiting_payment' && flow.appointmentId) {
        return this.goToMainMenu(tenantId, conversationId, settings, flow, text);
      }
      if (!settings.cancelEnabled) {
        return this.replyCancelDisabled(tenantId);
      }
      return this.startCancelFlow(tenantId, conversationId, leadId, phone, settings, flow);
    }

    if (isExactCommand(input, 'volver')) {
      return this.resumeCurrentStep(tenantId, conversationId, settings, flow);
    }

    if (flow.state === 'idle' || flow.state === 'handoff') {
      flow = { state: 'booking_start' };
      await this.saveFlow(conversationId, flow);
      if (isFreeTextOffFlow(text, input, 3)) {
        return this.goToMainMenu(tenantId, conversationId, settings, flow, text);
      }
      return this.mainMenuReply(tenantId, settings);
    }

    switch (flow.state) {
      case 'booking_start':
        return this.handleMainMenu(tenantId, conversationId, settings, flow, input, text);
      case 'choosing_service_mode':
        return this.handleServiceMode(tenantId, conversationId, settings, flow, input, text);
      case 'recommender_q1':
        return this.handleRecommenderQ1(tenantId, conversationId, settings, flow, input, text);
      case 'recommender_q2':
        return this.handleRecommenderQ2(tenantId, conversationId, settings, flow, input, text);
      case 'service_selected':
      case 'slot_selection':
        return this.handleSlotSelection(tenantId, conversationId, settings, flow, input, text);
      case 'confirm_slot_preview':
        return this.handleConfirmSlotPreview(tenantId, conversationId, settings, flow, input, text);
      case 'confirm_service_preview':
        return this.handleConfirmServicePreview(tenantId, conversationId, settings, flow, input, text);
      case 'confirm_payment_preview':
        return this.handleConfirmPaymentPreview(tenantId, conversationId, leadId, phone, settings, flow, input, text);
      case 'customer_name':
        return this.handleCustomerName(tenantId, conversationId, leadId, settings, flow, input, text, params.profileName);
      case 'customer_notes':
        return this.handleNotes(tenantId, conversationId, leadId, phone, settings, flow, input, text);
      case 'payment_choice':
        return this.handlePaymentChoice(tenantId, conversationId, leadId, phone, settings, flow, input, text);
      case 'waiting_payment':
        return this.handleWaitingPayment(tenantId, conversationId, leadId, phone, settings, flow, input, text);
      case 'confirmed':
        return this.handlePostBooking(tenantId, conversationId, settings, flow, input, text);
      default:
        flow = { state: 'booking_start' };
        await this.saveFlow(conversationId, flow);
        return this.goToMainMenu(tenantId, conversationId, settings, flow, text);
    }
  }

  private static async enrichConfirmedFlow(flow: BookingFlowContext): Promise<BookingFlowContext> {
    if (flow.serviceName && flow.slotLabel) return flow;
    if (!flow.appointmentId) return flow;
    const apt = await prisma.appointment.findUnique({
      where: { id: flow.appointmentId },
      include: { service: true },
    });
    if (!apt) return flow;
    const dateStr = apt.appointmentDate.toISOString().slice(0, 10);
    return {
      ...flow,
      serviceId: apt.serviceId,
      serviceName: apt.service.name,
      slotDate: dateStr,
      slotTime: apt.appointmentTime,
      slotLabel: `${dateStr} — ${apt.appointmentTime}`,
      customerName: apt.customerName || flow.customerName,
    };
  }

  /** Post-confirmación: IA responde consultas sin repetir la bienvenida inicial */
  private static async handlePostBooking(
    tenantId: string,
    conversationId: string,
    settings: any,
    flow: BookingFlowContext,
    input: string,
    rawText: string,
  ): Promise<FlowHandleResult> {
    const enriched = await this.enrichConfirmedFlow(flow);
    const prevFlow = { ...enriched, state: 'confirmed' as const };
    let body: string | null = null;

    if (isFreeTextOffFlow(rawText, input)) {
      body = await BookingAiService.answerOffFlow(tenantId, rawText, settings, this.flowAiContext(prevFlow));
    }

    if (!body) {
      body = await BookingAiService.generateFlowBridge(
        tenantId, settings, this.flowAiContext(prevFlow), 'post_booking',
      );
    }

    const merged = body || 'Si querés reservar otro turno o consultar algo más, decime y te ayudo 🌿';

    const nextFlow: BookingFlowContext = { ...prevFlow, state: 'booking_start' };
    await this.saveFlow(conversationId, nextFlow);

    return this.mainMenuOptionsReply(merged);
  }

  private static flowAiContext(flow: BookingFlowContext) {
    return {
      state: flow.state,
      serviceName: flow.serviceName,
      slotLabel: flow.slotLabel,
    };
  }

  /** Limpia flujos colgados en pago cuando el turno venció o se canceló */
  private static async reconcileStaleFlow(
    conversationId: string,
    flow: BookingFlowContext,
    settings: any,
  ): Promise<{ flow: BookingFlowContext; expiredNotice?: string }> {
    const paymentStates: BookingFlowState[] = ['waiting_payment', 'payment_choice'];
    if (!paymentStates.includes(flow.state)) return { flow };

    const now = new Date();
    let apt = flow.appointmentId
      ? await prisma.appointment.findUnique({ where: { id: flow.appointmentId } })
      : null;

    const stale = flow.state === 'waiting_payment' && (
      !apt
      || apt.status === 'vencido'
      || apt.status === 'cancelado'
      || (apt.status === 'pendiente_pago' && apt.holdExpiresAt && apt.holdExpiresAt < now)
    );

    if (!stale) return { flow };

    const reset: BookingFlowContext = { state: 'booking_start' };
    await this.saveFlow(conversationId, reset);
    const notice = msg(
      settings,
      'hold_expired',
      'La reserva anterior venció (pasaron los 15 minutos sin pago) y el horario quedó liberado. ¿Querés reservar un turno nuevo?',
    );
    return { flow: reset, expiredNotice: notice };
  }

  private static async answerOffFlowQuestion(
    tenantId: string,
    rawText: string,
    settings: any,
    flow: BookingFlowContext,
    tail = HOME_HINT,
  ): Promise<string> {
    let answer: string | null = null;
    if (BookingAiService.looksLikeAvailabilityQuestion(rawText)) {
      answer = await BookingAiService.answerAvailabilityQuestion(
        tenantId, rawText, settings, flow.serviceId,
      );
    } else {
      answer = await BookingAiService.answerOffFlow(
        tenantId, rawText, settings, this.flowAiContext(flow),
      );
    }
    return (answer || 'Contame en qué te ayudo.') + tail;
  }

  private static async offFlowThen(
    tenantId: string,
    conversationId: string,
    userText: string,
    settings: any,
    flow: BookingFlowContext,
    resume: () => Promise<FlowHandleResult>,
    maxOptions?: number,
    includeHome = false,
  ): Promise<FlowHandleResult> {
    const baseCount = maxOptions ?? 0;
    const homePick = includeHome ? pickFlowOption(normalizeInput(userText), baseCount, true) : { kind: 'invalid' as const };
    if (homePick.kind === 'home' || isGoHomeIntent(normalizeInput(userText))) {
      return this.goToMainMenu(tenantId, conversationId, settings, flow, userText);
    }

    const next = await resume();
    if (!isFreeTextOffFlow(userText, normalizeInput(userText), maxOptions)) {
      return next;
    }

    const answer = await BookingAiService.answerOffFlow(tenantId, userText, settings, this.flowAiContext(flow));
    if (!answer) {
      console.warn(`📅 Booking IA sin respuesta (state=${flow.state}) — revisar OPENAI_API_KEY`);
      return next;
    }

    return prependToReply(next, answer);
  }

  private static mainMenuOptionsReply(body: string): FlowHandleResult {
    return flowReply(body, MAIN_MENU_OPTIONS);
  }

  /** Libera un hold de pago pendiente cuando el usuario abandona el checkout */
  private static async abortPendingPaymentHold(tenantId: string, appointmentId: string): Promise<boolean> {
    const result = await prisma.appointment.updateMany({
      where: { id: appointmentId, tenantId, status: 'pendiente_pago' },
      data: { status: 'cancelado', cancelledAt: new Date() },
    });
    return result.count > 0;
  }

  private static async goToMainMenu(
    tenantId: string,
    conversationId: string,
    settings: any,
    flow: BookingFlowContext,
    userText?: string,
  ): Promise<FlowHandleResult> {
    const prevFlow = { ...flow };
    const nextFlow: BookingFlowContext = { state: 'booking_start' };
    if (conversationId) {
      await this.saveFlow(conversationId, nextFlow);
    }

    let releaseNote: string | null = null;
    if (prevFlow.state === 'waiting_payment' && prevFlow.appointmentId) {
      const released = await this.abortPendingPaymentHold(tenantId, prevFlow.appointmentId);
      if (released) {
        releaseNote = 'Liberamos el horario que tenías reservado.';
      }
    }

    const input = userText ? normalizeInput(userText) : '';
    let body: string | null = releaseNote;

    if (userText && isFreeTextOffFlow(userText, input)) {
      const answer = await BookingAiService.answerOffFlow(tenantId, userText, settings, this.flowAiContext(prevFlow));
      body = [body, answer].filter(Boolean).join('\n\n');
    }
    if (!body || body === releaseNote) {
      const bridge = await BookingAiService.generateFlowBridge(tenantId, settings, this.flowAiContext(prevFlow), 'go_home');
      body = [body, bridge].filter(Boolean).join('\n\n');
    }

    return this.mainMenuOptionsReply(body || 'Contame en qué te puedo ayudar 🌿');
  }

  private static async resumeWithBridge(
    tenantId: string,
    settings: any,
    flow: BookingFlowContext,
    stepReply: FlowHandleResult,
  ): Promise<FlowHandleResult> {
    const bridge = await BookingAiService.generateFlowBridge(tenantId, settings, this.flowAiContext(flow), 'resume_step');
    if (!bridge) return stepReply;
    return prependToReply(stepReply, bridge);
  }

  /** Retoma el paso actual con puente dinámico por IA */
  private static async resumeCurrentStep(
    tenantId: string,
    conversationId: string,
    settings: any,
    flow: BookingFlowContext,
  ): Promise<FlowHandleResult> {
    switch (flow.state) {
      case 'booking_start':
        return this.goToMainMenu(tenantId, conversationId, settings, flow);
      case 'choosing_service_mode':
        return this.resumeWithBridge(tenantId, settings, flow, await this.serviceListReply(tenantId));
      case 'recommender_q1':
        return this.resumeWithBridge(tenantId, settings, flow, flowReply('¿Qué sentís que necesitás hoy?', [
          'Soltar tensión', 'Descansar piernas', 'Calor profundo', 'Experiencia sensorial', 'Aflojar rigidez',
        ], true));
      case 'recommender_q2':
        return this.resumeWithBridge(tenantId, settings, flow, flowReply('¿Cómo te gustaría vivir la sesión?', [
          'Suave y relajante', 'Profunda y envolvente', 'Con calor', 'Con aromas/herbales', 'Más corporal',
        ], true));
      case 'service_selected':
        return this.resumeWithBridge(tenantId, settings, flow, flowReply(
          flow.serviceName ? `¿Reservamos ${flow.serviceName}?` : '¿Seguimos con la reserva?',
          ['Reservar este camino', 'Ver otros caminos', 'Hablar con persona'],
          true,
        ));
      case 'slot_selection':
        if (flow.slotBrowse === 'more_menu') {
          return this.resumeWithBridge(tenantId, settings, flow, this.moreSlotsMenuReply());
        }
        if (flow.slotBrowse === 'pick_day') {
          return this.resumeWithBridge(tenantId, settings, flow, {
            handled: true,
            text: `¿Qué día te queda bien? Podés decir *jueves*, *mañana* o una fecha como *20/06*.${HOME_HINT}`,
          });
        }
        if (flow.tempSlots?.length) {
          return this.resumeWithBridge(tenantId, settings, flow, this.slotsListReply('Elegí un horario:', flow.tempSlots));
        }
        return this.resumeWithBridge(tenantId, settings, flow, await this.slotReply(tenantId, flow.serviceName || ''));
      case 'confirm_slot_preview':
        return this.resumeWithBridge(tenantId, settings, flow, flowReply(
          `¿Confirmás este horario?\n\n📅 *${flow.previewSlot?.label}*`,
          CONFIRM_SLOT_OPTIONS,
          true,
        ));
      case 'confirm_service_preview':
        return this.resumeWithBridge(tenantId, settings, flow, await this.servicePreviewReply(flow));
      case 'confirm_payment_preview': {
        const label = flow.previewPaymentType === 'total' ? 'Pago 100%' : `Seña ${settings.depositPercentage}%`;
        const opts = flow.previewPaymentType === 'total' ? CONFIRM_PAYMENT_TOTAL_OPTIONS : CONFIRM_PAYMENT_SENA_OPTIONS;
        return this.resumeWithBridge(tenantId, settings, flow, flowReply(
          `¿Confirmás esta forma de pago?\n\n💳 *${label}*`,
          opts,
          true,
        ));
      }
      case 'customer_name':
        return this.resumeWithBridge(tenantId, settings, flow, {
          handled: true,
          text: `Pasame tu *nombre y apellido* para dejar el turno preparado.${HOME_HINT}`,
        });
      case 'customer_notes':
        return this.resumeWithBridge(tenantId, settings, flow, {
          handled: true,
          text: `${notesPromptText()}${HOME_HINT}`,
        });
      case 'payment_choice':
        return this.resumeWithBridge(tenantId, settings, flow, flowReply(
          'Elegí cómo querés pagar:',
          [`Señar ${settings.depositPercentage}%`, 'Pagar 100%', 'Cambiar horario'],
          true,
        ));
      case 'waiting_payment':
        return this.resumeWithBridge(tenantId, settings, flow, {
          handled: true,
          text: msg(settings, 'payment_pending',
            'Tu turno está pendiente de pago. Si ya pagaste, en unos minutos te llega la confirmación. Si necesitás el link de nuevo, escribí *humano*.'),
        });
      case 'confirmed':
        return this.handlePostBooking(tenantId, conversationId, settings, flow, '', '');
      default:
        flow = { state: 'booking_start' };
        await this.saveFlow(conversationId, flow);
        return this.goToMainMenu(tenantId, conversationId, settings, flow);
    }
  }

  private static async getCancellableAppointments(tenantId: string, leadId: string, phone: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return prisma.appointment.findMany({
      where: {
        tenantId,
        OR: [{ leadId }, { customerPhone: phone }],
        status: { in: ['confirmado', 'pendiente_pago'] },
        appointmentDate: { gte: today },
      },
      include: { service: true },
      orderBy: [{ appointmentDate: 'asc' }, { appointmentTime: 'asc' }],
    });
  }

  private static formatAppointmentSlot(apt: { appointmentDate: Date; appointmentTime: string }, timezone: string): string {
    const dateStr = apt.appointmentDate.toLocaleDateString('es-AR', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      timeZone: timezone,
    });
    return `${dateStr} ${apt.appointmentTime}`;
  }

  private static formatAppointmentLabel(apt: { appointmentDate: Date; appointmentTime: string; service: { name: string } }, timezone: string): string {
    return `${this.formatAppointmentSlot(apt, timezone)} — ${apt.service.name}`;
  }

  private static async startCancelFlow(
    tenantId: string,
    conversationId: string,
    leadId: string,
    phone: string,
    settings: any,
    flow: BookingFlowContext,
  ): Promise<FlowHandleResult> {
    const appointments = await this.getCancellableAppointments(tenantId, leadId, phone);

    if (appointments.length === 0) {
      return {
        handled: true,
        text: CANCEL_MSG.none,
      };
    }

    if (appointments.length === 1) {
      const apt = appointments[0];
      const nextFlow: BookingFlowContext = {
        ...flow,
        state: 'cancel_confirm',
        cancelAppointmentId: apt.id,
      };
      await this.saveFlow(conversationId, nextFlow);
      return this.cancelWarningReply(settings, apt);
    }

    const timezone = settings.timezone || 'America/Argentina/Cordoba';
    const options = appointments.map((apt, i) => {
      const short = apt.appointmentDate.toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        timeZone: timezone,
      });
      return {
        id: apt.id,
        label: `${short} ${apt.appointmentTime} — ${apt.service.name}`.slice(0, 72),
        listTitle: `T${i + 1} ${short} ${apt.appointmentTime}`.slice(0, 24),
      };
    });
    const nextFlow: BookingFlowContext = {
      ...flow,
      state: 'cancel_pick',
      cancelOptions: options.map((o) => ({ id: o.id, label: o.label, listTitle: o.listTitle })),
    };
    await this.saveFlow(conversationId, nextFlow);

    return flowReply(CANCEL_MSG.select, options.map((o) => o.listTitle));
  }

  private static cancelWarningReply(settings: any, apt: { appointmentDate: Date; appointmentTime: string; service: { name: string } }): FlowHandleResult {
    const policy = (settings.cancellationPolicyJson as any)?.policy_short_text
      || 'La seña abonada no es reembolsable.';
    const timezone = settings.timezone || 'America/Argentina/Cordoba';
    const slot = this.formatAppointmentSlot(apt, timezone);
    const body = CANCEL_MSG.warning(apt.service.name, slot, policy);

    return flowReply(body, ['Sí, cancelar', 'No, volver']);
  }

  private static async handleCancelPick(
    tenantId: string,
    conversationId: string,
    leadId: string,
    phone: string,
    settings: any,
    flow: BookingFlowContext,
    input: string,
    rawText: string,
  ): Promise<FlowHandleResult> {
    const options = flow.cancelOptions || [];
    const optionLabels = options.map((o) => o.listTitle);
    const pick = await resolveFlowMenuPick(tenantId, input, rawText, options.length, true, optionLabels);
    if (pick.kind === 'home' || isGoHomeIntent(input)) {
      return this.goToMainMenu(tenantId, conversationId, settings, flow, rawText);
    }

    if (pick.kind === 'invalid') {
      if (looksLikeCancelIntent(input)) {
        return this.startCancelFlow(tenantId, conversationId, leadId, phone, settings, flow);
      }
      return this.offFlowThen(tenantId, conversationId, rawText, settings, flow, async () => {
        return flowReply(CANCEL_MSG.select, options.map((o) => o.listTitle), true);
      }, options.length, true);
    }

    const selected = options[pick.index - 1];
    const apt = await prisma.appointment.findFirst({
      where: { id: selected.id, tenantId, status: { in: ['confirmado', 'pendiente_pago'] } },
      include: { service: true },
    });

    if (!apt) {
      return this.startCancelFlow(tenantId, conversationId, leadId, phone, settings, { state: 'booking_start' });
    }

    const nextFlow: BookingFlowContext = {
      ...flow,
      state: 'cancel_confirm',
      cancelAppointmentId: apt.id,
    };
    await this.saveFlow(conversationId, nextFlow);
    return this.cancelWarningReply(settings, apt);
  }

  private static async handleCancelConfirm(
    tenantId: string,
    conversationId: string,
    settings: any,
    flow: BookingFlowContext,
    input: string,
    rawText: string,
  ): Promise<FlowHandleResult> {
    const pick = await resolveFlowMenuPick(tenantId, input, rawText, 2, false, CANCEL_CONFIRM_OPTIONS);
    const opt = pick.kind === 'option' ? pick.index : pickOption(input, 2);

    if (opt === 2 || isExactCommand(input, 'volver') || isExactCommand(input, 'menu') || isExactCommand(input, 'menú')) {
      return this.goToMainMenu(tenantId, conversationId, settings, flow);
    }

    if (opt !== 1 && !/^(sí|si|confirmo|confirmar)/.test(input)) {
      const apt = flow.cancelAppointmentId
        ? await prisma.appointment.findUnique({
            where: { id: flow.cancelAppointmentId },
            include: { service: true },
          })
        : null;
      if (apt) {
        return this.cancelWarningReply(settings, apt);
      }
      return { handled: true, text: 'Respondé *1* para confirmar la cancelación o *2* para volver.' };
    }

    if (!flow.cancelAppointmentId) {
      return { handled: true, text: 'No encontré el turno. Escribí *menu* para empezar de nuevo.' };
    }

    const apt = await prisma.appointment.findFirst({
      where: {
        id: flow.cancelAppointmentId,
        tenantId,
        status: { in: ['confirmado', 'pendiente_pago'] },
      },
      include: { service: true },
    });

    if (!apt) {
      await this.saveFlow(conversationId, { state: 'booking_start' });
      return {
        handled: true,
        text: CANCEL_MSG.unavailable,
      };
    }

    await prisma.appointment.update({
      where: { id: apt.id },
      data: { status: 'cancelado', cancelledAt: new Date() },
    });

    await this.saveFlow(conversationId, { state: 'booking_start' });

    const timezone = settings.timezone || 'America/Argentina/Cordoba';
    const slot = this.formatAppointmentSlot(apt, timezone);
    const text = CANCEL_MSG.done(apt.service.name, slot);

    return { handled: true, text };
  }

  private static async handleWaitingPayment(
    tenantId: string,
    conversationId: string,
    leadId: string,
    phone: string,
    settings: any,
    flow: BookingFlowContext,
    input: string,
    rawText: string,
  ): Promise<FlowHandleResult> {
    if (looksLikeCancelIntent(input) || isGoHomeIntent(input) || MAIN_MENU_COMMANDS.some((c) => isExactCommand(input, c))) {
      return this.goToMainMenu(tenantId, conversationId, settings, flow, rawText);
    }

    if (isFreeTextOffFlow(rawText, input)) {
      return {
        handled: true,
        text: await this.answerOffFlowQuestion(
          tenantId,
          rawText,
          settings,
          flow,
          '\n\n_Si querés retomar el pago del turno reservado, escribí *volver*. Para empezar de cero, *menu_.',
        ),
      };
    }

    return {
      handled: true,
      text: msg(
        settings,
        'payment_reminder',
        'Tu turno sigue reservado unos minutos más. Completá el pago con el link que te envié, o escribí *menu* para liberar el horario y elegir otro.',
      ),
    };
  }

  private static async replyCancelDisabled(tenantId: string): Promise<FlowHandleResult> {
    const bot = await prisma.botSettings.findUnique({ where: { tenantId } });
    const digits = bot?.handoffPhoneE164?.replace(/\D/g, '');
    if (!digits) {
      return {
        handled: true,
        text: `${CANCEL_MSG.disabled}\n\nEscribí *humano* para que alguien del equipo te ayude.`,
      };
    }
    const waLink = HandoffService.buildWaMeLink(digits, 'Hola, necesito cancelar un turno');
    return {
      handled: true,
      text: `${CANCEL_MSG.disabled}\n\nPara gestionar tu cancelación, escribile al equipo por WhatsApp:\n${waLink}`,
    };
  }

  private static async getDisplaySlots(tenantId: string, flow: BookingFlowContext) {
    if (flow.tempSlots?.length) {
      return { slots: flow.tempSlots, hasMoreOption: false };
    }
    const all = await BookingAvailabilityService.getAvailableSlots(tenantId, { limit: 20 });
    return {
      slots: all.slice(0, 3).map((s) => ({ date: s.date, time: s.time, label: s.label })),
      hasMoreOption: all.length > 3,
    };
  }

  private static moreSlotsMenuReply(): FlowHandleResult {
    return flowReply('¿Cómo querés ver los horarios?', MORE_SLOTS_OPTIONS, true);
  }

  private static mainMenuResumeReply(body = '¿Querés avanzar con la reserva?'): FlowHandleResult {
    return this.mainMenuOptionsReply(body);
  }

  private static mainMenuReply(tenantId: string, settings: any): FlowHandleResult {
    const welcome = msg(settings, 'welcome',
      'Hola 🌿 Qué lindo que quieras regalarte un momento para vos.\nPuedo ayudarte a elegir el camino ideal o, si ya sabés cuál querés, avanzamos directo con la reserva.');
    return flowReply(welcome, MAIN_MENU_OPTIONS);
  }

  private static async renderMainMenu(tenantId: string, settings: any): Promise<string> {
    const welcome = msg(settings, 'welcome',
      'Hola 🌿 Qué lindo que quieras regalarte un momento para vos.\nPuedo ayudarte a elegir el camino ideal o, si ya sabés cuál querés, avanzamos directo con la reserva.');
    return `${welcome}\n\n1️⃣ Ayudame a elegir\n2️⃣ Ya sé cuál quiero\n3️⃣ Ver precios y disponibilidad`;
  }

  private static async advanceFlowToStep(
    tenantId: string,
    conversationId: string,
    settings: any,
    flow: BookingFlowContext,
    nextState: BookingFlowState,
  ): Promise<FlowHandleResult> {
    const nextFlow: BookingFlowContext = { ...flow, state: nextState };
    await this.saveFlow(conversationId, nextFlow);
    return this.renderStepPrompt(tenantId, conversationId, settings, nextFlow);
  }

  private static async renderStepPrompt(
    tenantId: string,
    conversationId: string,
    settings: any,
    flow: BookingFlowContext,
  ): Promise<FlowHandleResult> {
    switch (flow.state) {
      case 'booking_start':
        return this.mainMenuOptionsReply('¿Querés reservar un turno?');
      case 'choosing_service_mode':
        return this.serviceListReply(tenantId);
      case 'confirm_slot_preview':
        return flowReply(
          `¿Confirmás este horario?\n\n📅 *${flow.previewSlot?.label || flow.slotLabel}*`,
          CONFIRM_SLOT_OPTIONS,
          true,
        );
      case 'confirm_service_preview':
        return this.servicePreviewReply(flow);
      case 'confirm_payment_preview': {
        const label = flow.previewPaymentType === 'total' ? 'Pago 100%' : `Seña ${settings.depositPercentage}%`;
        const opts = flow.previewPaymentType === 'total' ? CONFIRM_PAYMENT_TOTAL_OPTIONS : CONFIRM_PAYMENT_SENA_OPTIONS;
        return flowReply(`¿Confirmás esta forma de pago?\n\n💳 *${label}*`, opts, true);
      }
      case 'slot_selection':
        return this.slotReply(tenantId, flow.serviceName || '');
      case 'customer_name':
        return {
          handled: true,
          text: `Pasame tu *nombre y apellido* para dejar el turno preparado.${HOME_HINT}`,
        };
      case 'customer_notes':
        return {
          handled: true,
          text: `${notesPromptText()}${HOME_HINT}`,
        };
      case 'payment_choice':
        return this.paymentChoiceReply(tenantId, settings, flow);
      default:
        return this.mainMenuOptionsReply('¿Seguimos con la reserva?');
    }
  }

  private static paymentChoiceReply(tenantId: string, settings: any, flow: BookingFlowContext): FlowHandleResult {
    const payOptions = [`Señar ${settings.depositPercentage}%`, 'Pagar 100%', 'Cambiar horario'];
    return flowReply('Elegí cómo querés pagar:', payOptions, true);
  }

  private static async servicePreviewReply(flow: BookingFlowContext): Promise<FlowHandleResult> {
    const svc = flow.previewServiceId
      ? await prisma.bookingService.findUnique({ where: { id: flow.previewServiceId } })
      : null;
    const body = formatServicePreviewBody(
      svc || { name: flow.previewServiceName || 'este camino' },
      flow.previewServiceName || svc?.name,
    );
    return flowReply(body, CONFIRM_SERVICE_OPTIONS, true);
  }

  private static async assignPreviewSlot(
    tenantId: string,
    conversationId: string,
    settings: any,
    flow: BookingFlowContext,
    slot: SlotPick,
  ): Promise<FlowHandleResult> {
    const nextFlow: BookingFlowContext = {
      ...flow,
      previewSlot: slot,
      pricePreviewActive: false,
      state: 'confirm_slot_preview',
    };
    await this.saveFlow(conversationId, nextFlow);
    return this.renderStepPrompt(tenantId, conversationId, settings, nextFlow);
  }

  private static async assignPreviewService(
    tenantId: string,
    conversationId: string,
    settings: any,
    flow: BookingFlowContext,
    service: { id: string; name: string },
  ): Promise<FlowHandleResult> {
    const nextFlow: BookingFlowContext = {
      ...flow,
      previewServiceId: service.id,
      previewServiceName: service.name,
      state: 'confirm_service_preview',
    };
    await this.saveFlow(conversationId, nextFlow);
    return this.renderStepPrompt(tenantId, conversationId, settings, nextFlow);
  }

  private static async showPricePreview(
    tenantId: string,
    conversationId: string,
    settings: any,
    flow: BookingFlowContext,
  ): Promise<FlowHandleResult> {
    const basePrice = settings.basePrice ? Number(settings.basePrice) : null;
    const price = basePrice ? `$${basePrice.toLocaleString('es-AR')}` : 'consultá en sala';
    const depositPct = settings.depositPercentage || 50;
    const promoBlock = await BookingPricingService.formatActivePromosSummary(tenantId, basePrice);
    const slots = await BookingAvailabilityService.getAvailableSlots(tenantId, { limit: 5 });
    const promoSection = promoBlock ? `\n\n${promoBlock}` : '';
    const duration = settings.sessionDurationMinutes || 80;

    if (!slots.length) {
      return {
        handled: true,
        text: `💆‍♀️ *Valor de sesión* (${duration} min): ${price}${promoSection}\n\nPara reservar pedimos una seña del *${depositPct}%* por Mercado Pago 🌿\n\nPor ahora no hay horarios libres 😔 Escribí *1* o *2* y te ayudamos a encontrar un momento cuando haya turnos.${HOME_HINT}`,
      };
    }

    const previewSlots = slots.map((s) => ({ date: s.date, time: s.time, label: s.label }));
    const nextFlow: BookingFlowContext = {
      ...flow,
      state: 'booking_start',
      previewSlots,
      pricePreviewActive: true,
      previewSlot: undefined,
    };
    await this.saveFlow(conversationId, nextFlow);

    const body = `💆‍♀️ *Valor de sesión* (${duration} min): ${price}${promoSection}\n\nPara confirmar tu turno pedimos una seña del *${depositPct}%* por Mercado Pago 🌿\n\n📅 A continuación te dejo algunos horarios disponibles. Podés elegir uno de la lista o escribir el día y la hora que prefieras (ej: *mañana a las 18*).`;
    return flowReply(body, previewSlots.map((s) => s.label), true);
  }

  private static async tryCapturePreviewAtMainMenu(
    tenantId: string,
    conversationId: string,
    settings: any,
    flow: BookingFlowContext,
    input: string,
    rawText: string,
  ): Promise<FlowHandleResult | null> {
    const timezone = settings.timezone || 'America/Argentina/Cordoba';

    if (flow.previewSlots?.length) {
      if (flow.pricePreviewActive) {
        const numPick = pickOption(input, flow.previewSlots.length);
        if (numPick) {
          return this.assignPreviewSlot(tenantId, conversationId, settings, flow, flow.previewSlots[numPick - 1]);
        }
      }
      const matched = BookingAiService.findMatchingSlot(rawText, timezone, flow.previewSlots);
      if (matched) {
        return this.assignPreviewSlot(tenantId, conversationId, settings, flow, matched);
      }
    }

    if (!flow.serviceId && !flow.previewServiceId) {
      const services = await prisma.bookingService.findMany({
        where: { tenantId, isActive: true },
        orderBy: { sortOrder: 'asc' },
      });
      const service = matchServiceFromText(rawText, services);
      if (service) {
        return this.assignPreviewService(tenantId, conversationId, settings, flow, service);
      }
    }

    const paymentPreview = parsePaymentPreview(rawText);
    if (paymentPreview && flow.serviceId && flow.slotDate && flow.customerName && flow.notesStepDone) {
      const nextFlow: BookingFlowContext = {
        ...flow,
        previewPaymentType: paymentPreview,
        state: 'confirm_payment_preview',
      };
      await this.saveFlow(conversationId, nextFlow);
      return this.renderStepPrompt(tenantId, conversationId, settings, nextFlow);
    }

    return null;
  }

  private static async handleConfirmSlotPreview(
    tenantId: string,
    conversationId: string,
    settings: any,
    flow: BookingFlowContext,
    input: string,
    rawText: string,
  ): Promise<FlowHandleResult> {
    if (isGoHomeIntent(input)) {
      return this.goToMainMenu(tenantId, conversationId, settings, flow, rawText);
    }

    const pick = await resolveFlowMenuPick(tenantId, input, rawText, 2, true, CONFIRM_SLOT_OPTIONS, true);
    const yes = pick.kind === 'option' && pick.index === 1 || isConfirmYes(input);
    const modify = pick.kind === 'option' && pick.index === 2 || isConfirmModify(input);

    if (modify) {
      const nextFlow: BookingFlowContext = {
        ...flow,
        previewSlot: undefined,
        state: 'slot_selection',
        tempSlots: flow.previewSlots,
      };
      await this.saveFlow(conversationId, nextFlow);
      if (nextFlow.tempSlots?.length) {
        return this.slotsListReply('Elegí un horario:', nextFlow.tempSlots);
      }
      return this.slotReply(tenantId, flow.serviceName || '');
    }

    if (!yes || !flow.previewSlot) {
      return this.renderStepPrompt(tenantId, conversationId, settings, flow);
    }

    const slot = flow.previewSlot;
    const status = await BookingAvailabilityService.getSlotStatus(tenantId, slot.date, slot.time);
    if (status !== 'available') {
      const nextFlow: BookingFlowContext = { ...flow, previewSlot: undefined };
      await this.saveFlow(conversationId, nextFlow);
      return this.slotsListReply(
        'Ese horario ya no está disponible. Elegí otro:',
        flow.previewSlots || [],
      );
    }

    const confirmed: BookingFlowContext = {
      ...flow,
      slotDate: slot.date,
      slotTime: slot.time,
      slotLabel: slot.label,
      previewSlot: undefined,
      pricePreviewActive: false,
    };
    const nextState = nextStepAfterConfirm(confirmed);
    return this.advanceFlowToStep(tenantId, conversationId, settings, confirmed, nextState);
  }

  private static async handleConfirmServicePreview(
    tenantId: string,
    conversationId: string,
    settings: any,
    flow: BookingFlowContext,
    input: string,
    rawText: string,
  ): Promise<FlowHandleResult> {
    if (isGoHomeIntent(input)) {
      return this.goToMainMenu(tenantId, conversationId, settings, flow, rawText);
    }

    const pick = await resolveFlowMenuPick(tenantId, input, rawText, 2, true, CONFIRM_SERVICE_OPTIONS, true);
    const yes = pick.kind === 'option' && pick.index === 1 || isConfirmYes(input);
    const modify = pick.kind === 'option' && pick.index === 2 || isConfirmModify(input);

    if (modify) {
      const nextFlow: BookingFlowContext = {
        ...flow,
        previewServiceId: undefined,
        previewServiceName: undefined,
        state: 'choosing_service_mode',
      };
      await this.saveFlow(conversationId, nextFlow);
      return this.serviceListReply(tenantId);
    }

    if (!yes || !flow.previewServiceId) {
      return this.renderStepPrompt(tenantId, conversationId, settings, flow);
    }

    const confirmed: BookingFlowContext = {
      ...flow,
      serviceId: flow.previewServiceId,
      serviceName: flow.previewServiceName,
      previewServiceId: undefined,
      previewServiceName: undefined,
      slotPage: 0,
    };
    const nextState = nextStepAfterConfirm(confirmed);
    return this.advanceFlowToStep(tenantId, conversationId, settings, confirmed, nextState);
  }

  private static async handleConfirmPaymentPreview(
    tenantId: string,
    conversationId: string,
    leadId: string,
    phone: string,
    settings: any,
    flow: BookingFlowContext,
    input: string,
    rawText: string,
  ): Promise<FlowHandleResult> {
    if (isGoHomeIntent(input)) {
      return this.goToMainMenu(tenantId, conversationId, settings, flow, rawText);
    }

    const opts = flow.previewPaymentType === 'total' ? CONFIRM_PAYMENT_TOTAL_OPTIONS : CONFIRM_PAYMENT_SENA_OPTIONS;
    const pick = await resolveFlowMenuPick(tenantId, input, rawText, 2, true, opts, true);
    const yes = pick.kind === 'option' && pick.index === 1 || isConfirmYes(input);
    const modify = pick.kind === 'option' && pick.index === 2 || isConfirmModify(input);

    if (modify || !flow.previewPaymentType) {
      const nextFlow: BookingFlowContext = {
        ...flow,
        previewPaymentType: undefined,
        state: 'payment_choice',
      };
      await this.saveFlow(conversationId, nextFlow);
      return this.paymentChoiceReply(tenantId, settings, nextFlow);
    }

    if (!yes) {
      return this.renderStepPrompt(tenantId, conversationId, settings, flow);
    }

    const paymentType = flow.previewPaymentType;
    return this.handlePaymentChoice(
      tenantId,
      conversationId,
      leadId,
      phone,
      settings,
      { ...flow, previewPaymentType: undefined, state: 'payment_choice' },
      paymentType === 'sena' ? '1' : '2',
      paymentType === 'sena' ? 'señar' : 'pagar 100%',
    );
  }

  private static async handleMainMenu(
    tenantId: string, conversationId: string, settings: any, flow: BookingFlowContext, input: string, rawText: string,
  ): Promise<FlowHandleResult> {
    const captured = await this.tryCapturePreviewAtMainMenu(tenantId, conversationId, settings, flow, input, rawText);
    if (captured) return captured;

    if (flow.pricePreviewActive && flow.previewSlots?.length) {
      if (isGoHomeIntent(input)) {
        return this.goToMainMenu(tenantId, conversationId, settings, flow, rawText);
      }
      return this.slotsListReply(
        'No entendí ese horario. Elegí uno de la lista o escribí día y hora (ej: *mañana a las 18*):',
        flow.previewSlots,
      );
    }

    const pick = await resolveFlowMenuPick(tenantId, input, rawText, 3, false, MAIN_MENU_OPTIONS);
    const opt = pick.kind === 'option' ? pick.index : null;
    if (opt === 1) {
      flow = { state: 'recommender_q1', pricePreviewActive: false, previewSlots: undefined };
      await this.saveFlow(conversationId, flow);
      return flowReply('¿Qué sentís que necesitás hoy?', RECOMMENDER_Q1_OPTIONS, true);
    }
    if (opt === 2) {
      flow = { state: 'choosing_service_mode', pricePreviewActive: false, previewSlots: undefined };
      await this.saveFlow(conversationId, flow);
      return this.serviceListReply(tenantId);
    }
    if (opt === 3) {
      return this.showPricePreview(tenantId, conversationId, settings, flow);
    }
    return this.offFlowThen(tenantId, conversationId, rawText, settings, flow, async () => (
      this.mainMenuResumeReply('¿Querés reservar un turno?')
    ), 3);
  }

  private static async serviceListReply(tenantId: string): Promise<FlowHandleResult> {
    const services = await prisma.bookingService.findMany({
      where: { tenantId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    return flowReply('Estos son nuestros caminos:', services.map((s) => s.name), true);
  }

  private static async renderServiceList(tenantId: string): Promise<string> {
    const services = await prisma.bookingService.findMany({
      where: { tenantId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    const lines = services.map((s, i) => `${i + 1}️⃣ ${s.name} — ${s.shortDescription || s.serviceType || ''}`).join('\n');
    return `Estos son nuestros caminos:\n\n${lines}\n\nElegí el número del camino que te interesa.`;
  }

  private static async handleServiceMode(
    tenantId: string, conversationId: string, settings: any, flow: BookingFlowContext, input: string, rawText: string,
  ): Promise<FlowHandleResult> {
    const services = await prisma.bookingService.findMany({
      where: { tenantId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    const serviceMatch = matchServiceFromText(rawText, services);
    if (serviceMatch && !flow.serviceId) {
      return this.assignPreviewService(tenantId, conversationId, settings, flow, serviceMatch);
    }

    const pick = await resolveFlowMenuPick(tenantId, input, rawText, services.length, true, services.map((s) => s.name));
    if (pick.kind === 'home' || isGoHomeIntent(input)) {
      return this.goToMainMenu(tenantId, conversationId, settings, flow, rawText);
    }
    if (pick.kind === 'invalid') {
      return this.offFlowThen(tenantId, conversationId, rawText, settings, flow, async () => ({
        handled: true,
        text: `${await this.renderServiceList(tenantId)}\n\n(Elegí el número del camino)`,
      }), services.length, true);
    }
    const service = services[pick.index - 1];
    const nextFlow: BookingFlowContext = {
      ...flow,
      serviceId: service.id,
      serviceName: service.name,
      slotPage: 0,
    };
    const nextState = nextStepAfterConfirm(nextFlow);
    return this.advanceFlowToStep(tenantId, conversationId, settings, nextFlow, nextState);
  }

  private static async handleRecommenderQ1(
    tenantId: string, conversationId: string, settings: any, flow: BookingFlowContext, input: string, rawText: string,
  ): Promise<FlowHandleResult> {
    const pick = await resolveFlowMenuPick(tenantId, input, rawText, 5, true, RECOMMENDER_Q1_OPTIONS);
    if (pick.kind === 'home' || isGoHomeIntent(input)) {
      return this.goToMainMenu(tenantId, conversationId, settings, flow, rawText);
    }
    if (pick.kind === 'invalid') {
      return this.offFlowThen(tenantId, conversationId, rawText, settings, flow, async () => flowReply('¿Qué sentís que necesitás hoy?', RECOMMENDER_Q1_OPTIONS, true), 5, true);
    }
    flow = { ...flow, state: 'recommender_q2', recommenderQ1: String(pick.index) };
    await this.saveFlow(conversationId, flow);
    return flowReply('¿Cómo te gustaría vivir la sesión?', [
      'Suave y relajante',
      'Profunda y envolvente',
      'Con calor',
      'Con aromas/herbales',
      'Más corporal',
    ], true);
  }

  private static scoreService(service: any, q1: number, q2: number): number {
    const tags = (service.recommendationTags as string[]) || [];
    const matrix: Record<number, string[]> = {
      1: ['tension_acumulada', 'relajacion', 'equilibrio'],
      2: ['pies', 'piernas', 'cansancio'],
      3: ['calor', 'piedras_calientes', 'contracturas'],
      4: ['aromas', 'sensorial', 'hierbas'],
      5: ['bambu', 'drenaje', 'vitalidad'],
    };
    const q2tags: Record<number, string[]> = {
      1: ['relajacion', 'calma'],
      2: ['relajacion_profunda', 'envolvente'],
      3: ['calor', 'piedras_calientes'],
      4: ['aromas', 'hierbas', 'sensorial'],
      5: ['drenaje', 'presion_ritmica', 'cuerpo_trabado'],
    };
    let score = 0;
    for (const t of [...(matrix[q1] || []), ...(q2tags[q2] || [])]) {
      if (tags.includes(t)) score += 1;
    }
    return score;
  }

  private static async handleRecommenderQ2(
    tenantId: string, conversationId: string, settings: any, flow: BookingFlowContext, input: string, rawText: string,
  ): Promise<FlowHandleResult> {
    const pick = await resolveFlowMenuPick(tenantId, input, rawText, 5, true, RECOMMENDER_Q2_OPTIONS);
    if (pick.kind === 'home' || isGoHomeIntent(input)) {
      return this.goToMainMenu(tenantId, conversationId, settings, flow, rawText);
    }
    if (pick.kind === 'invalid') {
      return this.offFlowThen(tenantId, conversationId, rawText, settings, flow, async () => flowReply('¿Cómo te gustaría vivir la sesión?', RECOMMENDER_Q2_OPTIONS, true), 5, true);
    }

    const q1 = parseInt(flow.recommenderQ1 || '1', 10);
    const services = await prisma.bookingService.findMany({
      where: { tenantId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    const ranked = [...services].sort((a, b) => this.scoreService(b, q1, pick.index) - this.scoreService(a, q1, pick.index));
    const best = ranked[0];
    if (!best) return { handled: true, text: 'No encontramos caminos disponibles. Escribí *humano*.' };

    const recText = best.botRecommendationText || `Te recomiendo ${best.name}.`;
    flow = {
      state: 'service_selected',
      serviceId: best.id,
      serviceName: best.name,
      recommenderQ2: String(pick.index),
      slotPage: 0,
    };
    await this.saveFlow(conversationId, flow);
    return flowReply(recText, SERVICE_SELECTED_OPTIONS, true);
  }

  private static async slotReply(tenantId: string, serviceName: string): Promise<FlowHandleResult> {
    const all = await BookingAvailabilityService.getAvailableSlots(tenantId, { limit: 20 });
    const slice = all.slice(0, 3);
    const labels = slice.map((s) => s.label);
    if (all.length > 3) labels.push('Ver más opciones');
    if (labels.length === 0) {
      return { handled: true, text: `No hay horarios disponibles por ahora para ${serviceName}. Escribí *humano* si querés ayuda.` };
    }
    return flowReply(`Próximos horarios para ${serviceName}:`, labels, true);
  }

  private static slotsListReply(title: string, slots: Array<{ label: string }>): FlowHandleResult {
    if (!slots.length) {
      return { handled: true, text: `No encontré horarios para esa búsqueda. Probá otro día o escribí *humano*.${HOME_HINT}` };
    }
    return flowReply(title, slots.map((s) => s.label), true);
  }

  private static async confirmSlotSelection(
    tenantId: string,
    conversationId: string,
    settings: any,
    flow: BookingFlowContext,
    slot: { date: string; time: string; label: string },
  ): Promise<FlowHandleResult> {
    const nextFlow: BookingFlowContext = {
      ...flow,
      slotDate: slot.date,
      slotTime: slot.time,
      slotLabel: slot.label,
      tempSlots: undefined,
      slotBrowse: undefined,
      previewSlot: undefined,
      pricePreviewActive: false,
    };
    const nextState = nextStepAfterConfirm(nextFlow);
    const result = await this.advanceFlowToStep(tenantId, conversationId, settings, nextFlow, nextState);
    return prependToReply(result, `Perfecto. Te reservo temporalmente *${slot.label}* mientras completamos la confirmación.`);
  }

  private static tryMatchSlotInList(
    rawText: string,
    timezone: string,
    slots: Array<{ date: string; time: string; label: string }>,
  ): { date: string; time: string; label: string } | null {
    return BookingAiService.findMatchingSlot(rawText, timezone, slots);
  }

  /** Lista de horarios abierta: parseo estructurado primero, número después, sin IA/coloquial en slots */
  private static async handleSlotListPick(
    tenantId: string,
    conversationId: string,
    settings: any,
    flow: BookingFlowContext,
    input: string,
    rawText: string,
    slots: Array<{ date: string; time: string; label: string }>,
    noMatchTitle: string,
  ): Promise<FlowHandleResult> {
    const timezone = settings.timezone || 'America/Argentina/Cordoba';
    const structured = this.tryMatchSlotInList(rawText, timezone, slots);
    if (structured) {
      return this.confirmSlotSelection(tenantId, conversationId, settings, flow, structured);
    }

    if (BookingAiService.looksLikeSlotPickQuery(input)) {
      return this.slotsListReply(noMatchTitle, slots);
    }

    const slotLabels = slots.map((s) => s.label);
    const pick = await resolveFlowMenuPick(
      tenantId, input, rawText, slots.length, true, slotLabels,
      BookingAiService.optionsLookLikeSlots(slotLabels),
    );
    if (pick.kind === 'home' || isGoHomeIntent(input)) {
      return this.goToMainMenu(tenantId, conversationId, settings, flow, rawText);
    }
    if (pick.kind === 'option') {
      return this.confirmSlotSelection(tenantId, conversationId, settings, flow, slots[pick.index - 1]);
    }
    return this.offFlowThen(tenantId, conversationId, rawText, settings, flow, async () => (
      this.slotsListReply('Elegí un horario:', slots)
    ), slots.length, true);
  }

  private static async handleSlotSelection(
    tenantId: string, conversationId: string, settings: any, flow: BookingFlowContext, input: string, rawText: string,
  ): Promise<FlowHandleResult> {
    if (flow.state === 'service_selected') {
      const pick = await resolveFlowMenuPick(tenantId, input, rawText, 3, true, SERVICE_SELECTED_OPTIONS);
      if (pick.kind === 'home' || isGoHomeIntent(input)) {
        return this.goToMainMenu(tenantId, conversationId, settings, flow, rawText);
      }
      if (pick.kind === 'option' && pick.index === 1 && flow.serviceId) {
        flow = { ...flow, state: 'slot_selection', slotPage: 0, slotBrowse: undefined, tempSlots: undefined };
        await this.saveFlow(conversationId, flow);
        return this.slotReply(tenantId, flow.serviceName || '');
      }
      if (pick.kind === 'option' && pick.index === 2) {
        flow = { state: 'choosing_service_mode' };
        await this.saveFlow(conversationId, flow);
        return this.serviceListReply(tenantId);
      }
      if (pick.kind === 'option' && pick.index === 3) {
        return { handled: true, handoff: true, text: msg(settings, 'human_handoff', 'Te comunico con una persona.') };
      }
      return this.offFlowThen(tenantId, conversationId, rawText, settings, flow, async () => flowReply(
        flow.serviceName ? `¿Reservamos ${flow.serviceName}?` : '¿Seguimos con la reserva?',
        SERVICE_SELECTED_OPTIONS,
        true,
      ), 3, true);
    }

    if (flow.slotBrowse === 'more_menu') {
      const pick = await resolveFlowMenuPick(tenantId, input, rawText, 3, true, MORE_SLOTS_OPTIONS);
      if (pick.kind === 'home' || isGoHomeIntent(input)) {
        return this.goToMainMenu(tenantId, conversationId, settings, flow, rawText);
      }
      if (pick.kind === 'option' && pick.index === 1) {
        const week = await BookingAvailabilityService.getSlotsThisWeek(tenantId, { serviceId: flow.serviceId });
        flow = {
          ...flow,
          slotBrowse: undefined,
          tempSlots: week.map((s) => ({ date: s.date, time: s.time, label: s.label })),
          slotPage: 0,
        };
        await this.saveFlow(conversationId, flow);
        return this.slotsListReply('Horarios disponibles esta semana:', week);
      }
      if (pick.kind === 'option' && pick.index === 2) {
        flow = { ...flow, slotBrowse: 'pick_day' };
        await this.saveFlow(conversationId, flow);
        return {
          handled: true,
          text: `¿Qué día te queda bien? Podés decir *jueves*, *mañana* o una fecha como *20/06*.${HOME_HINT}`,
        };
      }
      if (pick.kind === 'option' && pick.index === 3) {
        flow = { ...flow, slotBrowse: undefined, tempSlots: undefined, slotPage: 0 };
        await this.saveFlow(conversationId, flow);
        return this.slotReply(tenantId, flow.serviceName || '');
      }
      return this.offFlowThen(tenantId, conversationId, rawText, settings, flow, async () => this.moreSlotsMenuReply(), 3, true);
    }

    if (flow.slotBrowse === 'pick_day') {
      if (isGoHomeIntent(input)) {
        return this.goToMainMenu(tenantId, conversationId, settings, flow, rawText);
      }
      const timezone = settings.timezone || 'America/Argentina/Cordoba';
      const filtered = await BookingAiService.slotsForDateQuery(tenantId, rawText, flow.serviceId);
      const exact = this.tryMatchSlotInList(rawText, timezone, filtered);
      if (exact) {
        return this.confirmSlotSelection(tenantId, conversationId, settings, flow, exact);
      }
      if (filtered.length === 1) {
        return this.confirmSlotSelection(tenantId, conversationId, settings, flow, filtered[0]);
      }
      if (filtered.length > 0) {
        flow = {
          ...flow,
          slotBrowse: undefined,
          tempSlots: filtered.map((s) => ({ date: s.date, time: s.time, label: s.label })),
        };
        await this.saveFlow(conversationId, flow);
        return this.slotsListReply('Estos horarios tengo para ese día:', filtered);
      }
      return this.offFlowThen(tenantId, conversationId, rawText, settings, flow, async () => ({
        handled: true,
        text: `No encontré turnos para ese día. ¿Probamos otro? Decime *jueves*, *mañana* o una fecha como *20/06*.${HOME_HINT}`,
      }));
    }

    if (flow.tempSlots?.length) {
      return this.handleSlotListPick(
        tenantId, conversationId, settings, flow, input, rawText, flow.tempSlots,
        'No encontré ese horario exacto en la lista. Elegí el número o tocá una opción:',
      );
    }

    const { slots: pageSlots, hasMoreOption } = await this.getDisplaySlots(tenantId, flow);
    const baseCount = pageSlots.length + (hasMoreOption ? 1 : 0);
    const dateTimeIntent = BookingAiService.looksLikeDateQuery(input);

    if (hasMoreOption && isMoreOptionsInput(input, baseCount)) {
      flow = { ...flow, slotBrowse: 'more_menu' };
      await this.saveFlow(conversationId, flow);
      return this.moreSlotsMenuReply();
    }

    if (dateTimeIntent) {
      const timezone = settings.timezone || 'America/Argentina/Cordoba';
      const structured = this.tryMatchSlotInList(rawText, timezone, pageSlots);
      if (structured) {
        return this.confirmSlotSelection(tenantId, conversationId, settings, flow, structured);
      }

      const filtered = await BookingAiService.slotsForDateQuery(tenantId, rawText, flow.serviceId);
      const exactInFiltered = this.tryMatchSlotInList(rawText, timezone, filtered);
      if (exactInFiltered) {
        return this.confirmSlotSelection(tenantId, conversationId, settings, flow, exactInFiltered);
      }
      if (filtered.length === 1) {
        return this.confirmSlotSelection(tenantId, conversationId, settings, flow, filtered[0]);
      }
      if (filtered.length > 1) {
        flow = { ...flow, tempSlots: filtered.map((s) => ({ date: s.date, time: s.time, label: s.label })) };
        await this.saveFlow(conversationId, flow);
        return this.slotsListReply('Estos horarios tengo para esa fecha:', filtered);
      }

      if (BookingAiService.looksLikeSlotPickQuery(input)) {
        return this.slotsListReply(
          'No encontré ese horario. Elegí uno de la lista o probá con otra fecha:',
          pageSlots,
        );
      }
    }

    const slotLabels = pageSlots.map((s) => s.label);
    if (hasMoreOption) slotLabels.push('Ver más opciones');
    let pick = await resolveFlowMenuPick(tenantId, input, rawText, baseCount, true, slotLabels);
    if (pick.kind === 'home' || isGoHomeIntent(input)) {
      return this.goToMainMenu(tenantId, conversationId, settings, flow, rawText);
    }
    if (pick.kind === 'option' && hasMoreOption && pick.index === baseCount) {
      flow = { ...flow, slotBrowse: 'more_menu' };
      await this.saveFlow(conversationId, flow);
      return this.moreSlotsMenuReply();
    }

    if (pick.kind === 'invalid') {
      return this.offFlowThen(tenantId, conversationId, rawText, settings, flow, async () => (
        this.slotReply(tenantId, flow.serviceName || '')
      ), baseCount, true);
    }

    const slot = pageSlots[pick.index - 1];
    return this.confirmSlotSelection(tenantId, conversationId, settings, flow, slot);
  }

  private static async resolveIsFirstTime(leadId: string): Promise<boolean> {
    const prior = await prisma.appointment.count({
      where: {
        leadId,
        status: { in: ['confirmado', 'completado'] },
      },
    });
    return prior === 0;
  }

  private static async advanceToNotes(
    conversationId: string,
    leadId: string,
    flow: BookingFlowContext,
    name: string,
  ): Promise<FlowHandleResult> {
    const isFirstTime = await this.resolveIsFirstTime(leadId);
    flow = { ...flow, state: 'customer_notes', customerName: name, isFirstTime };
    await this.saveFlow(conversationId, flow);
    return {
      handled: true,
      text: `${notesPromptText(`Gracias, ${name.split(' ')[0]}.`)}${HOME_HINT}`,
    };
  }

  private static async handleCustomerName(
    tenantId: string,
    conversationId: string,
    leadId: string,
    settings: any,
    flow: BookingFlowContext,
    input: string,
    rawText: string,
    profileName?: string | null,
  ): Promise<FlowHandleResult> {
    if (isGoHomeIntent(input)) {
      return this.goToMainMenu(tenantId, conversationId, settings, flow, rawText);
    }

    if (looksLikePersonName(rawText)) {
      const name = textCapitalize(rawText.trim());
      try {
        await prisma.lead.update({ where: { id: leadId }, data: { name } });
      } catch (err: any) {
        console.warn('⚠️ No se pudo actualizar nombre del lead:', err.message);
      }
      return this.advanceToNotes(conversationId, leadId, flow, name);
    }

    if (BookingAiService.looksLikeQuestion(rawText) || isFreeTextOffFlow(rawText, input)) {
      const answer = await BookingAiService.answerOffFlow(tenantId, rawText, settings, this.flowAiContext(flow));
      if (answer) {
        return {
          handled: true,
          text: `${answer}\n\nPasame tu *nombre y apellido* para dejar el turno preparado.${HOME_HINT}`,
        };
      }
    }

    if (profileName && profileName.length >= 2) {
      const name = textCapitalize(profileName);
      try {
        await prisma.lead.update({ where: { id: leadId }, data: { name } });
      } catch {}
      return this.advanceToNotes(conversationId, leadId, flow, name);
    }

    return { handled: true, text: `Necesito tu *nombre y apellido* para continuar con la reserva.${HOME_HINT}` };
  }

  private static async handleNotes(
    tenantId: string, conversationId: string, leadId: string, phone: string,
    settings: any, flow: BookingFlowContext, input: string, rawText: string,
  ): Promise<FlowHandleResult> {
    if (isGoHomeIntent(input)) {
      return this.goToMainMenu(tenantId, conversationId, settings, flow, rawText);
    }

    if (!isNotesSkip(input) && looksLikeNotesQuestion(rawText)) {
      const answer = await BookingAiService.answerOffFlow(tenantId, rawText, settings, this.flowAiContext(flow));
      if (answer) {
        return {
          handled: true,
          text: `${answer}\n\n${notesPromptText()}${HOME_HINT}`,
        };
      }
    }

    const notes = isNotesSkip(input) ? null : rawText.trim();
    const paymentPreview = parsePaymentPreview(rawText);
    flow = {
      ...flow,
      customerNotes: notes || undefined,
      notesStepDone: true,
      ...(paymentPreview ? { previewPaymentType: paymentPreview } : {}),
    };

    if (flow.previewPaymentType) {
      flow.state = 'confirm_payment_preview';
      await this.saveFlow(conversationId, flow);
      return this.renderStepPrompt(tenantId, conversationId, settings, flow);
    }

    flow = { ...flow, state: 'payment_choice' };
    await this.saveFlow(conversationId, flow);

    if (!flow.serviceId || !flow.slotDate || !flow.slotTime) {
      return { handled: true, text: 'Hubo un error. Escribí *menu* para empezar de nuevo.' };
    }

    const pricing = await BookingPricingService.resolvePrice(tenantId, flow.serviceId);
    const policyShort = (settings.cancellationPolicyJson as any)?.policy_short_text
      || 'En caso de cancelación, la seña no es reembolsable.';

    const summary = msg(settings, 'payment_summary', `Te dejo el resumen de tu turno:

Camino: {{service}}
Día y horario: {{slot}}
Duración: {{duration}} minutos
Valor de la sesión: \${{price}}

Para confirmar el turno se abona una seña del {{deposit}}%.
También podés abonar el 100% ahora.

Importante: ${policyShort}

1️⃣ Señar {{deposit}}%
2️⃣ Pagar 100%
3️⃣ Cambiar horario`);

    const text = summary
      .replace(/\{\{service\}\}/g, flow.serviceName || '')
      .replace(/\{\{slot\}\}/g, flow.slotLabel || `${flow.slotDate} ${flow.slotTime}`)
      .replace(/\{\{duration\}\}/g, String(settings.sessionDurationMinutes))
      .replace(/\{\{price\}\}/g, pricing.finalPrice.toLocaleString('es-AR'))
      .replace(/\{\{deposit\}\}/g, String(settings.depositPercentage));

    return flowReply(text, [`Señar ${settings.depositPercentage}%`, 'Pagar 100%', 'Cambiar horario'], true);
  }

  private static async handlePaymentChoice(
    tenantId: string,
    conversationId: string,
    leadId: string,
    phone: string,
    settings: any,
    flow: BookingFlowContext,
    input: string,
    rawText: string,
  ): Promise<FlowHandleResult> {
    const payOptions = [`Señar ${settings.depositPercentage}%`, 'Pagar 100%', 'Cambiar horario'];
    const pick = await resolveFlowMenuPick(tenantId, input, rawText, 3, true, payOptions);
    if (pick.kind === 'home' || isGoHomeIntent(input)) {
      return this.goToMainMenu(tenantId, conversationId, settings, flow, rawText);
    }
    if (pick.kind === 'option' && pick.index === 3) {
      flow = { ...flow, state: 'slot_selection', slotPage: 0, slotBrowse: undefined, tempSlots: undefined };
      await this.saveFlow(conversationId, flow);
      return this.slotReply(tenantId, flow.serviceName || '');
    }
    if (pick.kind !== 'option' || (pick.index !== 1 && pick.index !== 2)) {
      if (isFreeTextOffFlow(rawText, input, 3)) {
        return {
          handled: true,
          text: await this.answerOffFlowQuestion(tenantId, rawText, settings, flow),
        };
      }
      return this.offFlowThen(tenantId, conversationId, rawText, settings, flow, async () => flowReply(
        'Elegí cómo querés pagar:',
        payOptions,
        true,
      ), 3, true);
    }

    const paymentType = pick.index === 1 ? 'sena' : 'total';
    if (!flow.serviceId || !flow.slotDate || !flow.slotTime) {
      return { handled: true, text: 'Hubo un error. Escribí *menu* para empezar de nuevo.' };
    }

    const pricing = await BookingPricingService.resolvePrice(tenantId, flow.serviceId);
    const payAmount = BookingPricingService.computePaymentAmount(
      pricing.finalPrice,
      paymentType,
      settings.depositPercentage,
    );
    const holdMinutes = settings.paymentLinkExpirationMinutes || 15;
    const holdExpiresAt = new Date(Date.now() + holdMinutes * 60 * 1000);
    const receiptToken = crypto.randomBytes(16).toString('hex');

    const appointment = await prisma.appointment.create({
      data: {
        tenantId,
        leadId,
        conversationId,
        serviceId: flow.serviceId,
        customerName: flow.customerName,
        customerPhone: phone,
        appointmentDate: new Date(flow.slotDate),
        appointmentTime: flow.slotTime,
        status: 'pendiente_pago',
        listPrice: pricing.listPrice,
        finalPrice: pricing.finalPrice,
        priceRuleId: pricing.priceRuleId,
        discountLabel: pricing.discountLabel,
        amountTotal: pricing.finalPrice,
        amountPaid: 0,
        balanceDue: pricing.finalPrice,
        paymentType,
        customerNotes: flow.customerNotes,
        isFirstTime: flow.isFirstTime,
        holdExpiresAt,
        receiptToken,
      },
    });

    let paymentLink = '';
    try {
      const mp = await MercadoPagoService.createPreference({
        tenantId,
        appointmentId: appointment.id,
        title: `${flow.serviceName} — ${flow.slotLabel || flow.slotTime}`,
        amount: payAmount,
        currency: settings.currency || 'ARS',
        expirationMinutes: holdMinutes,
        receiptToken,
      });
      paymentLink = mp.initPoint;
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { mpPreferenceId: mp.preferenceId, mpPaymentLink: paymentLink },
      });
    } catch (mpErr: any) {
      console.warn('⚠️ MP preference not created:', mpErr.message);
    }

    flow = { ...flow, state: 'waiting_payment', paymentType, appointmentId: appointment.id };
    await this.saveFlow(conversationId, flow);

    if (paymentLink) {
      return {
        handled: true,
        text: `${msg(settings, 'payment_pending', 'Perfecto. Te genero el link de pago seguro por Mercado Pago.')}\n\n${paymentLink}`,
      };
    }

    return {
      handled: true,
      text: msg(settings, 'payment_pending',
        'Perfecto. Tu turno quedó pre-reservado. Configurá Mercado Pago en Integraciones para recibir el link automático.'),
    };
  }
}

function textCapitalize(s: string): string {
  return s.trim().split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
