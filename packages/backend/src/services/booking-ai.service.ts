import OpenAI from 'openai';
import { env } from '../config/env';
import { BookingAvailabilityService, AvailableSlot } from './booking-availability.service';
import { BookingPricingService } from './booking-pricing.service';
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

  static looksLikePriceQuestion(text: string): boolean {
    const t = text.toLowerCase();
    return /(precio|precios|cuánto cuesta|cuanto cuesta|cuánto sale|cuanto sale|cuánto está|cuanto esta|valor|tarifa|tarifas|costo|costos|cobran|sale la sesión|sale la sesion)/.test(t);
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
    if (pb.promotions) {
      const pr = pb.promotions;
      const parts = [pr.active, pr.conditions && `Condiciones: ${pr.conditions}`, pr.validUntil && `Válido hasta: ${pr.validUntil}`].filter(Boolean);
      if (parts.length) sections.push(`[PROMOCIONES GENERALES]\n${parts.join('\n')}`);
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

    const activeRules = await BookingPricingService.getActivePriceRules(tenantId);
    if (activeRules.length > 0) {
      const fmt = (n: number) => `$${n.toLocaleString('es-AR')} ARS`;
      const fmtDate = (d: Date) => d.toLocaleDateString('es-AR');
      const promoLines = activeRules.map((rule) => {
        const until = rule.validUntil ? ` (hasta ${fmtDate(rule.validUntil)})` : '';
        if (basePrice) {
          const resolved = BookingPricingService.applyRule(basePrice, rule);
          if (rule.ruleType === 'percentage_discount') {
            return `- ${rule.label}: ${Number(rule.value)}% de descuento → ${fmt(resolved.finalPrice)} (precio lista ${fmt(basePrice)})${until}`;
          }
          return `- ${rule.label}: precio promo ${fmt(resolved.finalPrice)}${until}`;
        }
        if (rule.ruleType === 'percentage_discount') {
          return `- ${rule.label}: ${Number(rule.value)}% de descuento${until}`;
        }
        return `- ${rule.label}: precio fijo ${fmt(Number(rule.value))}${until}`;
      });
      sections.push(`[PROMOCIONES VIGENTES — TURNERA]\n${promoLines.join('\n')}`);
    }

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

    if (this.looksLikeAvailabilityQuestion(question)) {
      return this.answerAvailabilityQuestion(tenantId, question, settings, undefined);
    }

    const context = await this.buildContext(tenantId, settings);
    const flowHint = this.flowContextHint(flow);
    const priceHint = this.looksLikePriceQuestion(question)
      ? ' El usuario pregunta por precio: indicá el precio base del contexto y, si hay promos en [PROMOCIONES VIGENTES — TURNERA] o [PROMOCIONES GENERALES], mencionalas brevemente con el precio promocional. Si no hay promos vigentes, decilo en una frase.'
      : '';

    const messages = [
      {
        role: 'system' as const,
        content: `Sos la asistente de un spa/masajes en Argentina. ${flowHint}
Respondé en español argentino, cálido y breve (máximo 3 oraciones).${priceHint}
Usá el contexto provisto: horarios de atención en [HORARIOS DE ATENCIÓN]; ubicación y contacto en sus secciones; caminos/tratamientos SOLO en la lista de servicios de [TURNERA]; promociones en [PROMOCIONES VIGENTES — TURNERA] y [PROMOCIONES GENERALES].
No inventes precios, horarios ni direcciones.
NUNCA inventes horarios ni confirmes turnos: si preguntan disponibilidad, solo usá la información factual provista.
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

  /** Clasificador liviano (menú, intención corta) — temperatura baja */
  static async completeChatShort(
    messages: Array<{ role: 'system' | 'user'; content: string }>,
    maxTokens: number,
  ): Promise<string | null> {
    return this.completeChat(messages, maxTokens);
  }

  /** @deprecated use answerOffFlow */
  static async answerFaq(tenantId: string, question: string, settings: any): Promise<string | null> {
    return this.answerOffFlow(tenantId, question, settings);
  }

  static looksLikeAvailabilityQuestion(text: string): boolean {
    const t = text.toLowerCase();
    if (this.looksLikeDateQuery(t) && /(turno|horario|disponib|hay|tienen|tenés|tenes|libre|ocupado|lugar)/.test(t)) {
      return true;
    }
    return /(hay|tienen|tenés|tenes).*(turno|horario|lugar)/.test(t)
      || /(turno|horario).*(para|el|mañana|manana|hoy|lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado)/.test(t);
  }

  private static resolveTargetDateStr(query: string, timezone: string): string | null {
    const q = query.toLowerCase();
    const now = new Date();

    if (/\b(para\s+)?mañana\b/.test(q) || /\b(para\s+)?manana\b/.test(q)) {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow.toLocaleDateString('en-CA', { timeZone: timezone });
    }
    if (/\bhoy\b/.test(q)) {
      return now.toLocaleDateString('en-CA', { timeZone: timezone });
    }

    const dm = q.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
    if (dm) {
      const day = parseInt(dm[1], 10);
      const month = parseInt(dm[2], 10);
      const year = dm[3]
        ? (dm[3].length === 2 ? 2000 + parseInt(dm[3], 10) : parseInt(dm[3], 10))
        : now.getFullYear();
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    const dayMap: Record<string, number> = {
      domingo: 0, lunes: 1, martes: 2, miércoles: 3, miercoles: 3,
      jueves: 4, viernes: 5, sábado: 6, sabado: 6,
    };
    for (const [name, dow] of Object.entries(dayMap)) {
      if (q.includes(name)) {
        for (let i = 0; i < 7; i++) {
          const d = new Date(now);
          d.setDate(d.getDate() + i);
          const short = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: timezone });
          const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
          if (dowMap[short] === dow) {
            return d.toLocaleDateString('en-CA', { timeZone: timezone });
          }
        }
        break;
      }
    }
    return null;
  }

  private static parseTargetTime(query: string): string | null {
    const m = query.match(/\b(?:a las\s+)?(\d{1,2})(?::(\d{2}))?\s*(?:hs|h)?\b/i);
    if (!m) return null;
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2] || '0', 10);
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }

  /** Respuesta factual de disponibilidad — consulta la turnera real */
  static async answerAvailabilityQuestion(
    tenantId: string,
    question: string,
    settings: any,
    serviceId?: string,
  ): Promise<string> {
    const timezone = settings.timezone || 'America/Argentina/Cordoba';
    const targetDate = this.resolveTargetDateStr(question, timezone);
    const targetTime = this.parseTargetTime(question);

    if (targetDate && targetTime) {
      const status = await BookingAvailabilityService.getSlotStatus(tenantId, targetDate, targetTime);
      const dateLabel = new Date(`${targetDate}T12:00:00`).toLocaleDateString('es-AR', {
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        timeZone: timezone,
      });
      if (status === 'available') {
        return `Sí, hay turno el ${dateLabel} a las ${targetTime}. Si querés reservarlo, escribí *menu* y seguimos.`;
      }
      if (status === 'occupied') {
        const alts = await this.slotsForDateQuery(tenantId, question, serviceId);
        const altText = alts.length
          ? ` Horarios libres para esa fecha: ${alts.slice(0, 4).map((s) => s.label).join(', ')}.`
          : ' No quedan otros horarios libres ese día.';
        return `No, el ${dateLabel} a las ${targetTime} está ocupado.${altText}`;
      }
      return `Ese horario (${targetTime} el ${dateLabel}) no está disponible en la turnera. Escribí *menu* y te muestro opciones.`;
    }

    const slots = await this.slotsForDateQuery(tenantId, question, serviceId);
    if (slots.length === 0) {
      return 'No encuentro horarios libres para lo que pedís. Escribí *menu* y vemos otras fechas juntas.';
    }
    const lines = slots.slice(0, 5).map((s) => `• ${s.label}`).join('\n');
    return `Estos son los horarios disponibles:\n${lines}\n\n¿Querés reservar? Escribí *menu* para empezar.`;
  }

  /** Parse free-text date/time intent → filter available slots */
  static async slotsForDateQuery(tenantId: string, query: string, serviceId?: string): Promise<AvailableSlot[]> {
    const settings = await prisma.bookingSettings.findUnique({ where: { tenantId } });
    const timezone = settings?.timezone || 'America/Argentina/Cordoba';
    const all = await BookingAvailabilityService.getAvailableSlots(tenantId, { limit: 40, serviceId });
    const q = query.toLowerCase();

    if (q.includes('esta semana') || q.includes('semana')) {
      return BookingAvailabilityService.getSlotsThisWeek(tenantId, { serviceId });
    }

    let targetDateStr: string | null = this.resolveTargetDateStr(query, timezone);

    const dayMap: Record<string, number> = {
      domingo: 0, lunes: 1, martes: 2, miércoles: 3, miercoles: 3,
      jueves: 4, viernes: 5, sábado: 6, sabado: 6,
    };

    let targetDow: number | null = null;
    if (!targetDateStr) {
      for (const [name, dow] of Object.entries(dayMap)) {
        if (q.includes(name)) { targetDow = dow; break; }
      }
    }

    if (!targetDateStr) {
      const dm = q.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
      if (dm) {
        const day = parseInt(dm[1], 10);
        const month = parseInt(dm[2], 10);
        const year = dm[3] ? (dm[3].length === 2 ? 2000 + parseInt(dm[3], 10) : parseInt(dm[3], 10)) : new Date().getFullYear();
        targetDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }

    const wantsAfternoon = /\b(por la tarde|a la tarde|en la tarde|noche)\b/.test(q);
    const wantsMorning = /\b(por la mañana|a la mañana|en la mañana|temprano)\b/.test(q);

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
