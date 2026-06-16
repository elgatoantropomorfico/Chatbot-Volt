import OpenAI from 'openai';
import { env } from '../config/env';
import { BookingAvailabilityService, AvailableSlot } from './booking-availability.service';
import { prisma } from '../config/database';

export interface BookingFlowAiContext {
  state?: string;
  serviceName?: string;
  slotLabel?: string;
}

/**
 * Controlled IA for booking tenants — answers off-flow questions, then returns to flow.
 */
export class BookingAiService {
  private static openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

  static looksLikeGreeting(text: string): boolean {
    const t = text.trim().toLowerCase();
    return /^(hola|buen[oa]s|hey|hi|buen dia|buenos dias|buenas tardes|buenas noches)\b/.test(t);
  }

  static looksLikeInfoRequest(text: string): boolean {
    const t = text.toLowerCase();
    return /(información|informacion|quisiera|gustaría|gustaria|contame|cuéntame|cuentame|explicame|explicáme|explicame|saber más|saber mas|más info|mas info|tratamiento|tratamientos|consiste|detalle|detalles|cuentan|contar)/.test(t);
  }

  static looksLikeQuestion(text: string): boolean {
    const t = text.toLowerCase();
    return t.includes('?')
      || this.looksLikeInfoRequest(t)
      || /(cuánto|cuanto|dónde|donde|qué|que|cómo|como|cuál|cual|duración|duracion|precio|horario|ubicación|ubicacion|tienen|hay|ofrecen|hacen|sirve|incluye|aceptan|puedo|duración|duracion|camino|caminos|bambú|bambu|caña|cañas|modelador|edema)/.test(t);
  }

  private static flowContextHint(flow?: BookingFlowAiContext): string {
    if (!flow?.state) return '';
    const parts = [`Paso actual: ${flow.state}.`];
    if (flow.serviceName) parts.push(`Camino en curso: ${flow.serviceName}.`);
    if (flow.slotLabel) parts.push(`Horario elegido: ${flow.slotLabel}.`);
    return parts.join(' ');
  }

  static looksLikeDateQuery(text: string): boolean {
    const t = text.toLowerCase();
    return /(lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo|mañana|manana|tarde|noche|hoy|semana|esta semana|\d{1,2}\/\d{1,2})/.test(t);
  }

  /** Contexto: operativo (Bot/IA) + turnera (servicios y slots). Tratamientos solo desde servicios. */
  private static async buildContext(tenantId: string, settings: any): Promise<string> {
    const sections: string[] = [];

    const botSettings = await prisma.botSettings.findUnique({ where: { tenantId } });
    const pb = (botSettings?.promptBuilderJson || {}) as Record<string, any>;

    if (pb.business) {
      const b = pb.business;
      const parts = [b.name && `Nombre: ${b.name}`, b.tone && `Tono: ${b.tone}`].filter(Boolean);
      if (parts.length) sections.push(`[NEGOCIO]\n${parts.join('\n')}`);
    }
    if (pb.location) {
      const l = pb.location;
      const parts = [l.address, l.city, l.province, l.zone, l.notes].filter(Boolean);
      if (parts.length) sections.push(`[UBICACIÓN]\n${parts.join(', ')}`);
    }
    if (pb.hours) {
      const h = pb.hours;
      const parts = [h.schedule, h.holidays && `Feriados: ${h.holidays}`, h.notes && `Notas: ${h.notes}`].filter(Boolean);
      if (parts.length) sections.push(`[HORARIOS DE ATENCIÓN]\n${parts.join('\n')}`);
    }
    if (pb.contact) {
      const c = pb.contact;
      const parts = [c.phone && `Tel: ${c.phone}`, c.instagram && `IG: ${c.instagram}`, c.website && `Web: ${c.website}`].filter(Boolean);
      if (parts.length) sections.push(`[CONTACTO]\n${parts.join('\n')}`);
    }

    const workingDays = (settings.workingDaysJson as number[]) || [1, 2, 3, 4, 5];
    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const slots = await prisma.bookingSlot.findMany({
      where: { tenantId, isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { time: true },
    });

    const services = await prisma.bookingService.findMany({
      where: { tenantId, isActive: true },
      select: {
        name: true,
        shortDescription: true,
        longDescription: true,
        serviceType: true,
      },
      orderBy: { sortOrder: 'asc' },
    });
    const basePrice = settings.basePrice ? Number(settings.basePrice) : null;
    const duration = settings.sessionDurationMinutes || 80;

    const serviceLines = services.map((s) => {
      const info = s.longDescription || s.shortDescription || s.serviceType || '';
      const type = s.serviceType && s.serviceType !== info ? ` (${s.serviceType})` : '';
      return `- ${s.name}${type}: ${info}`;
    });

    sections.push(`[TURNERA — RESERVAS]
Sesiones de ${duration} min.
Precio base: ${basePrice ? `$${basePrice.toLocaleString('es-AR')} ARS` : 'consultar en reserva'}.
Seña: ${settings.depositPercentage || 50}%. ${settings.depositRefundable ? 'Reembolsable' : 'No reembolsable'}.
Política cancelación: ${(settings.cancellationPolicyJson as any)?.policy_short_text || 'consultar'}.
Días con turnos online: ${workingDays.map((d) => dayNames[d] ?? d).join(', ')}.
Horarios de sesión ofrecidos en la turnera: ${slots.map((s) => s.time).join(', ') || 'consultar'}.

Caminos/servicios (usá SOLO esta info para tratamientos, técnicas, bambú, cañas, etc.):
${serviceLines.join('\n')}`);

    return sections.join('\n\n');
  }

  /** Breve puente dinámico al retomar un paso o volver al menú */
  static async generateFlowBridge(
    tenantId: string,
    settings: any,
    flow: BookingFlowAiContext,
    intent: 'resume_step' | 'go_home' | 'post_booking',
  ): Promise<string | null> {
    const context = await this.buildContext(tenantId, settings);
    const flowHint = this.flowContextHint(flow);
    const instruction = intent === 'go_home'
      ? 'El usuario quiere volver al menú principal. Saludalo brevemente y ofrecé ayuda para elegir o reservar, sin repetir el menú completo ni listar opciones.'
      : intent === 'post_booking'
        ? 'El usuario ya confirmó su turno. Una frase cálida de cierre; ofrecé ayuda para otra consulta o nueva reserva. No repitas la bienvenida inicial ni listes opciones.'
        : 'El usuario quiere retomar la reserva donde la dejó. Una frase cálida que conecte con el paso actual, sin repetir botones ni menús.';

    const userMsg = intent === 'go_home'
      ? 'Volvamos al inicio.'
      : intent === 'post_booking'
        ? 'Mi turno ya está confirmado.'
        : 'Sigamos con la reserva.';

    const messages = [
      {
        role: 'system' as const,
        content: `Sos la asistente de un spa/masajes en Argentina. ${flowHint}
${instruction}
Español argentino, máximo 2 oraciones. Usá SOLO el contexto provisto.

${context}`,
      },
      { role: 'user' as const, content: userMsg },
    ];

    return this.completeChat(messages, 100);
  }

  /** Answer any off-flow question using business context — max 2-3 sentences */
  static async answerOffFlow(
    tenantId: string,
    question: string,
    settings: any,
    flow?: BookingFlowAiContext,
  ): Promise<string | null> {
    if (this.looksLikeGreeting(question)) return null;

    const context = await this.buildContext(tenantId, settings);
    const flowHint = this.flowContextHint(flow);

    const messages = [
      {
        role: 'system' as const,
        content: `Sos la asistente de un spa/masajes en Argentina. ${flowHint}
Respondé en español argentino, cálido y breve (máximo 3 oraciones).
Usá el contexto provisto: horarios de atención en [HORARIOS DE ATENCIÓN]; ubicación y contacto en sus secciones; caminos/tratamientos SOLO en la lista de servicios de [TURNERA].
No inventes precios, horarios ni direcciones.
Si el usuario pregunta por un camino o técnica (bambú, cañas, piedras, etc.), basate en la lista de caminos del contexto.
Si no tenés el dato, decí que podés ayudar a reservar un turno o derivar a una persona.
No hagas listas largas ni repetís menús.

${context}`,
      },
      { role: 'user' as const, content: question },
    ];

    return this.completeChat(messages, 180);
  }

  private static async completeChat(
    messages: Array<{ role: 'system' | 'user'; content: string }>,
    maxTokens: number,
  ): Promise<string | null> {
    if (this.openai) {
      try {
        const res = await this.openai.chat.completions.create({
          model: 'gpt-4o-mini',
          temperature: 0.35,
          max_tokens: maxTokens,
          messages,
        });
        const text = res.choices[0]?.message?.content?.trim();
        if (text) return text;
      } catch (err: any) {
        console.warn('📅 Booking OpenAI error:', err.message);
      }
    }

    if (env.GROQ_API_KEY && env.GROQ_API_BASE) {
      try {
        const res = await fetch(`${env.GROQ_API_BASE}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.GROQ_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            temperature: 0.35,
            max_tokens: maxTokens,
            messages,
          }),
        });
        if (res.ok) {
          const data = await res.json() as any;
          const text = data.choices?.[0]?.message?.content?.trim();
          if (text) return text;
        }
      } catch (err: any) {
        console.warn('📅 Booking Groq error:', err.message);
      }
    }

    return null;
  }

  /** @deprecated use answerOffFlow */
  static async answerFaq(tenantId: string, question: string, settings: any): Promise<string | null> {
    return this.answerOffFlow(tenantId, question, settings);
  }

  /** Parse free-text date/time intent → filter available slots */
  static async slotsForDateQuery(tenantId: string, query: string, serviceId?: string): Promise<AvailableSlot[]> {
    const all = await BookingAvailabilityService.getAvailableSlots(tenantId, { limit: 40, serviceId });
    const q = query.toLowerCase();

    if (q.includes('esta semana') || q.includes('semana')) {
      return BookingAvailabilityService.getSlotsThisWeek(tenantId, { serviceId });
    }

    const dayMap: Record<string, number> = {
      domingo: 0, lunes: 1, martes: 2, miércoles: 3, miercoles: 3,
      jueves: 4, viernes: 5, sábado: 6, sabado: 6,
    };

    let targetDow: number | null = null;
    for (const [name, dow] of Object.entries(dayMap)) {
      if (q.includes(name)) { targetDow = dow; break; }
    }

    let targetDateStr: string | null = null;
    const dm = q.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
    if (dm) {
      const day = parseInt(dm[1], 10);
      const month = parseInt(dm[2], 10);
      const year = dm[3] ? (dm[3].length === 2 ? 2000 + parseInt(dm[3], 10) : parseInt(dm[3], 10)) : new Date().getFullYear();
      targetDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    const wantsAfternoon = q.includes('tarde') || q.includes('noche');
    const wantsMorning = q.includes('mañana') || q.includes('manana');

    return all.filter((s) => {
      if (targetDateStr && s.date !== targetDateStr) return false;
      if (targetDow != null && s.dateObj.getDay() !== targetDow) return false;
      const [h] = s.time.split(':').map(Number);
      if (wantsAfternoon && h < 12) return false;
      if (wantsMorning && h >= 14) return false;
      return true;
    }).slice(0, 8);
  }
}
