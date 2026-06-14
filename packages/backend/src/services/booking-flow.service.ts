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
import crypto from 'crypto';

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
  | 'customer_first_time'
  | 'customer_notes'
  | 'payment_choice'
  | 'waiting_payment'
  | 'confirmed'
  | 'handoff';

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
}

const GLOBAL_COMMANDS = ['volver', 'cancelar', 'menú', 'menu', 'humano', 'empezar de nuevo', 'inicio'];

function normalizeInput(text: string): string {
  return text.trim().toLowerCase();
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
  if (looksLikePersonName(rawText)) return false;
  if (BookingAiService.looksLikeGreeting(rawText)) return false;
  if (maxOptions != null && pickOption(input, maxOptions) !== null) return false;
  if (isMoreOptionsInput(input, maxOptions || 99)) return false;
  return BookingAiService.looksLikeQuestion(rawText) || rawText.trim().length >= 12;
}

function looksLikePersonName(raw: string): boolean {
  const t = raw.trim();
  if (!t || t.length < 2 || t.includes('?')) return false;
  if (BookingAiService.looksLikeQuestion(t)) return false;
  if (!/^[\p{L}\s'.-]{2,80}$/u.test(t)) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return true;
  return words.length === 1 && words[0].length >= 3;
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
function flowReply(body: string, options: string[]): FlowHandleResult {
  const numbered = options.map((o, i) => `${i + 1}️⃣ ${o}`).join('\n');
  const fullText = `${body}\n\n${numbered}`;

  if (options.length <= 3) {
    return {
      handled: true,
      text: fullText,
      interactive: {
        type: 'button',
        body,
        buttons: options.map((title, i) => ({
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
      listRows: options.map((title, i) => ({
        id: `opt_${i + 1}`,
        title: title.slice(0, 24),
        description: '',
      })),
    },
  };
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

    if (GLOBAL_COMMANDS.some((c) => input === c || input.includes(c))) {
      if (input.includes('humano')) {
        await this.saveFlow(conversationId, { state: 'handoff' });
        return { handled: true, handoff: true, text: msg(settings, 'human_handoff', 'Te comunico con una persona del equipo.') };
      }
      flow = { state: 'booking_start' };
      await this.saveFlow(conversationId, flow);
      return this.mainMenuReply(tenantId, settings);
    }

    if (flow.state === 'idle' || flow.state === 'handoff') {
      flow = { state: 'booking_start' };
      await this.saveFlow(conversationId, flow);
      const menu = this.mainMenuReply(tenantId, settings);
      if (isFreeTextOffFlow(text, input, 3)) {
        const answer = await BookingAiService.answerOffFlow(tenantId, text, settings, flow.state);
        if (answer) {
          return {
            handled: true,
            text: `${answer}\n\n${menu.text}`,
            interactive: {
              ...menu.interactive!,
              body: `${answer}\n\n${menu.interactive!.body}`.slice(0, 1020),
            },
          };
        }
        console.warn('📅 Booking IA sin respuesta en idle — revisar OPENAI_API_KEY');
      }
      return menu;
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
      case 'customer_first_time':
        return this.handleFirstTime(conversationId, settings, flow, input);
      case 'customer_notes':
        return this.handleNotes(tenantId, conversationId, leadId, phone, settings, flow, input);
      case 'payment_choice':
        return this.handlePaymentChoice(tenantId, conversationId, leadId, phone, settings, flow, input, text);
      default:
        flow = { state: 'booking_start' };
        await this.saveFlow(conversationId, flow);
        return this.mainMenuReply(tenantId, settings);
    }
  }

  private static async offFlowThen(
    tenantId: string,
    userText: string,
    settings: any,
    flow: BookingFlowContext,
    resume: () => Promise<FlowHandleResult>,
    maxOptions?: number,
  ): Promise<FlowHandleResult> {
    const next = await resume();
    if (!isFreeTextOffFlow(userText, normalizeInput(userText), maxOptions)) {
      return next;
    }

    const answer = await BookingAiService.answerOffFlow(tenantId, userText, settings, flow.state);
    if (!answer) {
      console.warn(`📅 Booking IA sin respuesta (state=${flow.state}) — revisar OPENAI_API_KEY`);
      return next;
    }

    const text = `${answer}\n\n${next.text}`;
    if (next.interactive) {
      return {
        handled: true,
        text,
        interactive: {
          ...next.interactive,
          body: `${answer}\n\n${next.interactive.body}`.slice(0, 1020),
        },
      };
    }
    return { handled: true, text };
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
    return flowReply('¿Cómo querés ver los horarios?', ['Esta semana', 'Elegir un día', 'Próximos horarios']);
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
      ]);
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
    return this.offFlowThen(tenantId, rawText, settings, flow, async () => this.mainMenuReply(tenantId, settings), 3);
  }

  private static async serviceListReply(tenantId: string): Promise<FlowHandleResult> {
    const services = await prisma.bookingService.findMany({
      where: { tenantId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    return flowReply('Estos son nuestros caminos:', services.map((s) => s.name));
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
    const opt = pickOption(input, services.length);
    if (!opt) {
      return this.offFlowThen(tenantId, rawText, settings, flow, async () => ({
        handled: true,
        text: `${await this.renderServiceList(tenantId)}\n\n(Elegí el número del camino)`,
      }), services.length);
    }
    const service = services[opt - 1];
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
    const opt = pickOption(input, 5);
    if (!opt) {
      return this.offFlowThen(tenantId, rawText, settings, flow, async () => flowReply('¿Qué sentís que necesitás hoy?', [
        'Soltar tensión', 'Descansar piernas', 'Calor profundo', 'Experiencia sensorial', 'Aflojar rigidez',
      ]), 5);
    }
    flow = { ...flow, state: 'recommender_q2', recommenderQ1: String(opt) };
    await this.saveFlow(conversationId, flow);
    return flowReply('¿Cómo te gustaría vivir la sesión?', [
      'Suave y relajante',
      'Profunda y envolvente',
      'Con calor',
      'Con aromas/herbales',
      'Más corporal',
    ]);
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
    const opt = pickOption(input, 5);
    if (!opt) {
      return this.offFlowThen(tenantId, rawText, settings, flow, async () => flowReply('¿Cómo te gustaría vivir la sesión?', [
        'Suave y relajante', 'Profunda y envolvente', 'Con calor', 'Con aromas/herbales', 'Más corporal',
      ]), 5);
    }

    const q1 = parseInt(flow.recommenderQ1 || '1', 10);
    const services = await prisma.bookingService.findMany({
      where: { tenantId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    const ranked = [...services].sort((a, b) => this.scoreService(b, q1, opt) - this.scoreService(a, q1, opt));
    const best = ranked[0];
    if (!best) return { handled: true, text: 'No encontramos caminos disponibles. Escribí *humano*.' };

    const recText = best.botRecommendationText || `Te recomiendo ${best.name}.`;
    flow = {
      state: 'service_selected',
      serviceId: best.id,
      serviceName: best.name,
      recommenderQ2: String(opt),
      slotPage: 0,
    };
    await this.saveFlow(conversationId, flow);
    return flowReply(recText, ['Reservar este camino', 'Ver otros caminos', 'Hablar con persona']);
  }

  private static async slotReply(tenantId: string, serviceName: string): Promise<FlowHandleResult> {
    const all = await BookingAvailabilityService.getAvailableSlots(tenantId, { limit: 20 });
    const slice = all.slice(0, 3);
    const labels = slice.map((s) => s.label);
    if (all.length > 3) labels.push('Ver más opciones');
    if (labels.length === 0) {
      return { handled: true, text: `No hay horarios disponibles por ahora para ${serviceName}. Escribí *humano* si querés ayuda.` };
    }
    return flowReply(`Próximos horarios para ${serviceName}:`, labels);
  }

  private static slotsListReply(title: string, slots: Array<{ label: string }>): FlowHandleResult {
    if (!slots.length) {
      return { handled: true, text: 'No encontré horarios para esa búsqueda. Probá otro día o escribí *humano*.' };
    }
    return flowReply(title, slots.map((s) => s.label));
  }

  private static async handleSlotSelection(
    tenantId: string, conversationId: string, settings: any, flow: BookingFlowContext, input: string, rawText: string,
  ): Promise<FlowHandleResult> {
    if (flow.state === 'service_selected') {
      const opt = pickOption(input, 3);
      if (opt === 1 && flow.serviceId) {
        flow = { ...flow, state: 'slot_selection', slotPage: 0, slotBrowse: undefined, tempSlots: undefined };
        await this.saveFlow(conversationId, flow);
        return this.slotReply(tenantId, flow.serviceName || '');
      }
      if (opt === 2) {
        flow = { state: 'choosing_service_mode' };
        await this.saveFlow(conversationId, flow);
        return this.serviceListReply(tenantId);
      }
      if (opt === 3) return { handled: true, handoff: true, text: msg(settings, 'human_handoff', 'Te comunico con una persona.') };
      return this.offFlowThen(tenantId, rawText, settings, flow, async () => flowReply(
        flow.serviceName ? `¿Reservamos ${flow.serviceName}?` : '¿Seguimos con la reserva?',
        ['Reservar este camino', 'Ver otros caminos', 'Hablar con persona'],
      ), 3);
    }

    if (flow.slotBrowse === 'more_menu') {
      const opt = pickOption(input, 3);
      if (opt === 1) {
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
      if (opt === 2) {
        flow = { ...flow, slotBrowse: 'pick_day' };
        await this.saveFlow(conversationId, flow);
        return {
          handled: true,
          text: '¿Qué día te queda bien? Podés decir *jueves*, *mañana* o una fecha como *20/06*.',
        };
      }
      if (opt === 3) {
        flow = { ...flow, slotBrowse: undefined, tempSlots: undefined, slotPage: 0 };
        await this.saveFlow(conversationId, flow);
        return this.slotReply(tenantId, flow.serviceName || '');
      }
      return this.offFlowThen(tenantId, rawText, settings, flow, async () => this.moreSlotsMenuReply(), 3);
    }

    if (flow.slotBrowse === 'pick_day') {
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
      return this.offFlowThen(tenantId, rawText, settings, flow, async () => ({
        handled: true,
        text: 'No encontré turnos para ese día. ¿Probamos otro? Decime *jueves*, *mañana* o una fecha como *20/06*.',
      }));
    }

    const { slots: pageSlots, hasMoreOption } = await this.getDisplaySlots(tenantId, flow);
    const totalOptions = pageSlots.length + (hasMoreOption ? 1 : 0);

    if (hasMoreOption && isMoreOptionsInput(input, totalOptions)) {
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

    let opt = pickOption(input, totalOptions);
    if (hasMoreOption && opt === totalOptions) {
      flow = { ...flow, slotBrowse: 'more_menu' };
      await this.saveFlow(conversationId, flow);
      return this.moreSlotsMenuReply();
    }

    if (!opt || opt > pageSlots.length) {
      return this.offFlowThen(tenantId, rawText, settings, flow, async () => {
        if (flow.tempSlots?.length) {
          return this.slotsListReply('Elegí un horario:', flow.tempSlots);
        }
        return this.slotReply(tenantId, flow.serviceName || '');
      }, totalOptions);
    }

    const slot = pageSlots[opt - 1];
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
      text: `Perfecto. Te reservo temporalmente *${slot.label}* mientras completamos la confirmación.\n\nPasame tu *nombre y apellido* para dejar el turno preparado.`,
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
    if (looksLikePersonName(rawText)) {
      const name = textCapitalize(rawText.trim());
      try {
        await prisma.lead.update({ where: { id: leadId }, data: { name } });
      } catch (err: any) {
        console.warn('⚠️ No se pudo actualizar nombre del lead:', err.message);
      }
      flow = { ...flow, state: 'customer_first_time', customerName: name };
      await this.saveFlow(conversationId, flow);
      return flowReply(`Gracias, ${name.split(' ')[0]}. ¿Es tu primera vez?`, ['Sí', 'No']);
    }

    if (BookingAiService.looksLikeQuestion(rawText)) {
      const answer = await BookingAiService.answerOffFlow(tenantId, rawText, settings, flow.state);
      if (answer) {
        return {
          handled: true,
          text: `${answer}\n\nPasame tu *nombre y apellido* para dejar el turno preparado.`,
        };
      }
    }

    if (profileName && profileName.length >= 2) {
      const name = textCapitalize(profileName);
      try {
        await prisma.lead.update({ where: { id: leadId }, data: { name } });
      } catch {}
      flow = { ...flow, state: 'customer_first_time', customerName: name };
      await this.saveFlow(conversationId, flow);
      return flowReply(`Gracias, ${name.split(' ')[0]}. ¿Es tu primera vez?`, ['Sí', 'No']);
    }

    return { handled: true, text: 'Necesito tu *nombre y apellido* para continuar con la reserva.' };
  }

  private static async handleFirstTime(
    conversationId: string, settings: any, flow: BookingFlowContext, input: string,
  ): Promise<FlowHandleResult> {
    const opt = pickOption(input, 2);
    if (!opt) return { handled: true, text: 'Respondé 1 (Sí) o 2 (No).' };
    flow = { ...flow, state: 'customer_notes', isFirstTime: opt === 1 };
    await this.saveFlow(conversationId, flow);
    return {
      handled: true,
      text: '¿Hay algo que quieras avisar antes de la sesión? Si no, respondé *no*.',
    };
  }

  private static async handleNotes(
    tenantId: string, conversationId: string, leadId: string, phone: string,
    settings: any, flow: BookingFlowContext, input: string,
  ): Promise<FlowHandleResult> {
    const notes = input === 'no' ? null : input;
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

    return flowReply(text, [`Señar ${settings.depositPercentage}%`, 'Pagar 100%', 'Cambiar horario']);
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
    const opt = pickOption(input, 3);
    if (opt === 3) {
      flow = { ...flow, state: 'slot_selection', slotPage: 0, slotBrowse: undefined, tempSlots: undefined };
      await this.saveFlow(conversationId, flow);
      return this.slotReply(tenantId, flow.serviceName || '');
    }
    if (opt !== 1 && opt !== 2) {
      return this.offFlowThen(tenantId, rawText, settings, flow, async () => flowReply(
        'Elegí cómo querés pagar:',
        [`Señar ${settings.depositPercentage}%`, 'Pagar 100%', 'Cambiar horario'],
      ), 3);
    }

    const paymentType = opt === 1 ? 'sena' : 'total';
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
