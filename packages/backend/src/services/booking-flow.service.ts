/**
 * Conversational booking flow — state machine (no free-form IA).
 * IA hooks added in Fase 7.
 */
import { prisma } from '../config/database';
import { BookingAvailabilityService } from './booking-availability.service';
import { BookingPricingService } from './booking-pricing.service';
import { MercadoPagoService } from './mercadopago.service';
import { BookingAiService } from './booking-ai.service';
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
}

const MAIN_MENU_COMMANDS = ['menú', 'menu', 'empezar de nuevo', 'inicio'];
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

    if (flow.state === 'cancel_pick') {
      return this.handleCancelPick(tenantId, conversationId, leadId, phone, settings, flow, input, text);
    }
    if (flow.state === 'cancel_confirm') {
      return this.handleCancelConfirm(tenantId, conversationId, settings, flow, input);
    }

    if (isExactCommand(input, 'humano') || input === 'hablar con persona') {
      await this.saveFlow(conversationId, { state: 'handoff' });
      return { handled: true, handoff: true, text: msg(settings, 'human_handoff', 'Te comunico con una persona del equipo.') };
    }

    if (MAIN_MENU_COMMANDS.some((c) => isExactCommand(input, c))) {
      return this.goToMainMenu(tenantId, conversationId, settings, flow, text);
    }

    if (looksLikeCancelIntent(input)) {
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
    return flowReply(body, ['Ayudame a elegir', 'Ya sé cuál quiero', 'Ver precios']);
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

    const input = userText ? normalizeInput(userText) : '';
    let body: string | null = null;

    if (userText && isFreeTextOffFlow(userText, input)) {
      body = await BookingAiService.answerOffFlow(tenantId, userText, settings, this.flowAiContext(prevFlow));
    }
    if (!body) {
      body = await BookingAiService.generateFlowBridge(tenantId, settings, this.flowAiContext(prevFlow), 'go_home');
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
      case 'customer_name':
        return this.resumeWithBridge(tenantId, settings, flow, {
          handled: true,
          text: `Pasame tu *nombre y apellido* para dejar el turno preparado.${HOME_HINT}`,
        });
      case 'customer_notes':
        return this.resumeWithBridge(tenantId, settings, flow, {
          handled: true,
          text: `¿Hay algo que quieras avisar antes de la sesión? Si no, respondé *no*.${HOME_HINT}`,
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
    const pick = pickFlowOption(input, options.length, true);
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
  ): Promise<FlowHandleResult> {
    const opt = pickOption(input, 2);

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
    if (looksLikeCancelIntent(input)) {
      if (!settings.cancelEnabled) {
        return this.replyCancelDisabled(tenantId);
      }
      return this.startCancelFlow(tenantId, conversationId, leadId, phone, settings, flow);
    }
    return this.offFlowThen(tenantId, conversationId, rawText, settings, flow, async () => ({
      handled: true,
      text: msg(settings, 'payment_pending',
        'Tu turno está pendiente de pago. Si ya pagaste, en unos minutos te llega la confirmación.'),
    }));
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
    return flowReply('¿Cómo querés ver los horarios?', ['Esta semana', 'Elegir un día', 'Próximos horarios'], true);
  }

  private static mainMenuResumeReply(body = '¿Querés avanzar con la reserva?'): FlowHandleResult {
    return this.mainMenuOptionsReply(body);
  }

  private static mainMenuReply(tenantId: string, settings: any): FlowHandleResult {
    const welcome = msg(settings, 'welcome',
      'Hola 🌿 Qué lindo que quieras regalarte un momento para vos.\nPuedo ayudarte a elegir el camino ideal o, si ya sabés cuál querés, avanzamos directo con la reserva.');
    return flowReply(welcome, ['Ayudame a elegir', 'Ya sé cuál quiero', 'Ver precios']);
  }

  private static async renderMainMenu(tenantId: string, settings: any): Promise<string> {
    const welcome = msg(settings, 'welcome',
      'Hola 🌿 Qué lindo que quieras regalarte un momento para vos.\nPuedo ayudarte a elegir el camino ideal o, si ya sabés cuál querés, avanzamos directo con la reserva.');
    return `${welcome}\n\n1️⃣ Ayudame a elegir\n2️⃣ Ya sé cuál quiero\n3️⃣ Ver precios y disponibilidad`;
  }

  private static async handleMainMenu(
    tenantId: string, conversationId: string, settings: any, flow: BookingFlowContext, input: string, rawText: string,
  ): Promise<FlowHandleResult> {
    const opt = pickOption(input, 3);
    if (opt === 1) {
      flow = { state: 'recommender_q1' };
      await this.saveFlow(conversationId, flow);
      return flowReply('¿Qué sentís que necesitás hoy?', [
        'Soltar tensión',
        'Descansar piernas',
        'Calor profundo',
        'Experiencia sensorial',
        'Aflojar rigidez',
      ], true);
    }
    if (opt === 2) {
      flow = { state: 'choosing_service_mode' };
      await this.saveFlow(conversationId, flow);
      return this.serviceListReply(tenantId);
    }
    if (opt === 3) {
      const price = settings.basePrice ? `$${Number(settings.basePrice).toLocaleString('es-AR')}` : 'consultá en sala';
      const slots = await BookingAvailabilityService.getAvailableSlots(tenantId, { limit: 3 });
      const slotLines = slots.length
        ? slots.map((s, i) => `${i + 1}️⃣ ${s.label}`).join('\n')
        : 'Consultanos por WhatsApp para ver próximos horarios.';
      return {
        handled: true,
        text: `Valor de sesión (${settings.sessionDurationMinutes || 80} min): ${price}\n\nPróximos horarios:\n${slotLines}\n\nPara reservar, elegí *1* (ayudame a elegir) o *2* (ya sé cuál quiero).`,
      };
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
    const pick = pickFlowOption(input, services.length, true);
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
    flow = {
      state: 'slot_selection',
      serviceId: service.id,
      serviceName: service.name,
      slotPage: 0,
    };
    await this.saveFlow(conversationId, flow);
    return this.slotReply(tenantId, service.name);
  }

  private static async handleRecommenderQ1(
    tenantId: string, conversationId: string, settings: any, flow: BookingFlowContext, input: string, rawText: string,
  ): Promise<FlowHandleResult> {
    const pick = pickFlowOption(input, 5, true);
    if (pick.kind === 'home' || isGoHomeIntent(input)) {
      return this.goToMainMenu(tenantId, conversationId, settings, flow, rawText);
    }
    if (pick.kind === 'invalid') {
      return this.offFlowThen(tenantId, conversationId, rawText, settings, flow, async () => flowReply('¿Qué sentís que necesitás hoy?', [
        'Soltar tensión', 'Descansar piernas', 'Calor profundo', 'Experiencia sensorial', 'Aflojar rigidez',
      ], true), 5, true);
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
    const pick = pickFlowOption(input, 5, true);
    if (pick.kind === 'home' || isGoHomeIntent(input)) {
      return this.goToMainMenu(tenantId, conversationId, settings, flow, rawText);
    }
    if (pick.kind === 'invalid') {
      return this.offFlowThen(tenantId, conversationId, rawText, settings, flow, async () => flowReply('¿Cómo te gustaría vivir la sesión?', [
        'Suave y relajante', 'Profunda y envolvente', 'Con calor', 'Con aromas/herbales', 'Más corporal',
      ], true), 5, true);
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
    return flowReply(recText, ['Reservar este camino', 'Ver otros caminos', 'Hablar con persona'], true);
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

  private static async handleSlotSelection(
    tenantId: string, conversationId: string, settings: any, flow: BookingFlowContext, input: string, rawText: string,
  ): Promise<FlowHandleResult> {
    if (flow.state === 'service_selected') {
      const pick = pickFlowOption(input, 3, true);
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
        ['Reservar este camino', 'Ver otros caminos', 'Hablar con persona'],
        true,
      ), 3, true);
    }

    if (flow.slotBrowse === 'more_menu') {
      const pick = pickFlowOption(input, 3, true);
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
      const filtered = await BookingAiService.slotsForDateQuery(tenantId, rawText, flow.serviceId);
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
      const pick = pickFlowOption(input, flow.tempSlots.length, true);
      if (pick.kind === 'home' || isGoHomeIntent(input)) {
        return this.goToMainMenu(tenantId, conversationId, settings, flow, rawText);
      }
      if (pick.kind === 'option') {
        const slot = flow.tempSlots[pick.index - 1];
        flow = {
          ...flow,
          state: 'customer_name',
          slotDate: slot.date,
          slotTime: slot.time,
          slotLabel: slot.label,
          tempSlots: undefined,
          slotBrowse: undefined,
        };
        await this.saveFlow(conversationId, flow);
        return {
          handled: true,
          text: `Perfecto. Te reservo temporalmente *${slot.label}* mientras completamos la confirmación.\n\nPasame tu *nombre y apellido* para dejar el turno preparado.${HOME_HINT}`,
        };
      }
      return this.offFlowThen(tenantId, conversationId, rawText, settings, flow, async () => (
        this.slotsListReply('Elegí un horario:', flow.tempSlots!)
      ), flow.tempSlots.length, true);
    }

    const { slots: pageSlots, hasMoreOption } = await this.getDisplaySlots(tenantId, flow);
    const baseCount = pageSlots.length + (hasMoreOption ? 1 : 0);

    if (hasMoreOption && isMoreOptionsInput(input, baseCount)) {
      flow = { ...flow, slotBrowse: 'more_menu' };
      await this.saveFlow(conversationId, flow);
      return this.moreSlotsMenuReply();
    }

    if (BookingAiService.looksLikeDateQuery(input) && !flow.tempSlots?.length) {
      const filtered = await BookingAiService.slotsForDateQuery(tenantId, rawText, flow.serviceId);
      if (filtered.length > 0) {
        flow = { ...flow, tempSlots: filtered.map((s) => ({ date: s.date, time: s.time, label: s.label })) };
        await this.saveFlow(conversationId, flow);
        return this.slotsListReply('Estos horarios tengo para esa fecha:', filtered);
      }
    }

    let pick = pickFlowOption(input, baseCount, true);
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
    flow = {
      ...flow,
      state: 'customer_name',
      slotDate: slot.date,
      slotTime: slot.time,
      slotLabel: slot.label,
      tempSlots: undefined,
      slotBrowse: undefined,
    };
    await this.saveFlow(conversationId, flow);

    return {
      handled: true,
      text: `Perfecto. Te reservo temporalmente *${slot.label}* mientras completamos la confirmación.\n\nPasame tu *nombre y apellido* para dejar el turno preparado.${HOME_HINT}`,
    };
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
      text: `Gracias, ${name.split(' ')[0]}. ¿Hay algo que quieras avisar antes de la sesión? Si no, respondé *no*.${HOME_HINT}`,
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
          text: `${answer}\n\n¿Hay algo que quieras avisar antes de la sesión? Si no, respondé *no*.${HOME_HINT}`,
        };
      }
    }

    const notes = isNotesSkip(input) ? null : rawText.trim();
    flow = { ...flow, state: 'payment_choice', customerNotes: notes || undefined };
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
    const pick = pickFlowOption(input, 3, true);
    if (pick.kind === 'home' || isGoHomeIntent(input)) {
      return this.goToMainMenu(tenantId, conversationId, settings, flow, rawText);
    }
    if (pick.kind === 'option' && pick.index === 3) {
      flow = { ...flow, state: 'slot_selection', slotPage: 0, slotBrowse: undefined, tempSlots: undefined };
      await this.saveFlow(conversationId, flow);
      return this.slotReply(tenantId, flow.serviceName || '');
    }
    if (pick.kind !== 'option' || (pick.index !== 1 && pick.index !== 2)) {
      return this.offFlowThen(tenantId, conversationId, rawText, settings, flow, async () => flowReply(
        'Elegí cómo querés pagar:',
        [`Señar ${settings.depositPercentage}%`, 'Pagar 100%', 'Cambiar horario'],
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
