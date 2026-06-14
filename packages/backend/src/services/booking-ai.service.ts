import OpenAI from 'openai';
import { env } from '../config/env';
import { BookingAvailabilityService, AvailableSlot } from './booking-availability.service';
import { prisma } from '../config/database';

/**
 * Controlled IA for booking tenants — answers off-flow questions, then returns to flow.
 */
export class BookingAiService {
  private static openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

  static looksLikeGreeting(text: string): boolean {
    const t = text.trim().toLowerCase();
    return /^(hola|buen[oa]s|hey|hi|buen dia|buenos dias|buenas tardes|buenas noches)\b/.test(t);
  }

  static looksLikeQuestion(text: string): boolean {
    const t = text.toLowerCase();
    return t.includes('?') || /(cuánto|cuanto|dónde|donde|qué|que|cómo|como|cuál|cual|duración|duracion|precio|horario|ubicación|ubicacion|tienen|hay|ofrecen|hacen|sirve|incluye|aceptan|puedo)/.test(t);
  }

  static looksLikeDateQuery(text: string): boolean {
    const t = text.toLowerCase();
    return /(lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo|mañana|manana|tarde|noche|hoy|semana|esta semana|\d{1,2}\/\d{1,2})/.test(t);
  }

  /** Build context from Bot/IA settings + booking DB */
  private static async buildContext(tenantId: string, settings: any): Promise<string> {
    const botSettings = await prisma.botSettings.findUnique({ where: { tenantId } });
    const pb = (botSettings?.promptBuilderJson || {}) as Record<string, any>;
    const sections: string[] = [];

    if (pb.business) {
      const b = pb.business;
      const parts = [b.name && `Negocio: ${b.name}`, b.industry && `Rubro: ${b.industry}`, b.description && `Descripción: ${b.description}`, b.tone && `Tono: ${b.tone}`].filter(Boolean);
      if (parts.length) sections.push(`[NEGOCIO]\n${parts.join('\n')}`);
    }
    if (pb.location) {
      const l = pb.location;
      const parts = [l.address, l.city, l.province, l.zone, l.notes].filter(Boolean);
      if (parts.length) sections.push(`[UBICACIÓN]\n${parts.join(', ')}`);
    }
    if (pb.hours?.schedule) sections.push(`[HORARIOS SALA]\n${pb.hours.schedule}`);
    if (pb.contact) {
      const c = pb.contact;
      const parts = [c.phone && `Tel: ${c.phone}`, c.instagram && `IG: ${c.instagram}`, c.website && `Web: ${c.website}`].filter(Boolean);
      if (parts.length) sections.push(`[CONTACTO]\n${parts.join('\n')}`);
    }
    if (pb.policies) {
      const pol = [pb.policies.returns, pb.policies.notes].filter(Boolean).join('\n');
      if (pol) sections.push(`[POLÍTICAS]\n${pol}`);
    }
    if (Array.isArray(pb.faq) && pb.faq.length) {
      const faqLines = pb.faq.filter((f: any) => f.question && f.answer).map((f: any) => `P: ${f.question}\nR: ${f.answer}`);
      if (faqLines.length) sections.push(`[FAQ]\n${faqLines.join('\n\n')}`);
    }

    const services = await prisma.bookingService.findMany({
      where: { tenantId, isActive: true },
      select: { name: true, shortDescription: true, serviceType: true, durationMinutes: true, botSummary: true },
      orderBy: { sortOrder: 'asc' },
    });
    const basePrice = settings.basePrice ? Number(settings.basePrice) : null;
    const duration = settings.sessionDurationMinutes || 80;

    sections.push(`[TURNERA]
Sesiones de ${duration} min.
Precio base: ${basePrice ? `$${basePrice.toLocaleString('es-AR')} ARS` : 'consultar en reserva'}.
Seña: ${settings.depositPercentage || 50}%. ${settings.depositRefundable ? 'Reembolsable' : 'No reembolsable'}.
Política cancelación: ${(settings.cancellationPolicyJson as any)?.policy_short_text || 'consultar'}.
Caminos/servicios:
${services.map((s) => `- ${s.name}: ${s.botSummary || s.shortDescription || s.serviceType || ''}`).join('\n')}`);

    return sections.join('\n\n');
  }

  /** Answer any off-flow question using business context — max 2-3 sentences */
  static async answerOffFlow(
    tenantId: string,
    question: string,
    settings: any,
    flowState?: string,
  ): Promise<string | null> {
    if (this.looksLikeGreeting(question)) return null;

    const context = await this.buildContext(tenantId, settings);
    const stepHint = flowState
      ? `El usuario está en el paso "${flowState}" del flujo de reserva de turnos por WhatsApp.`
      : '';

    const messages = [
      {
        role: 'system' as const,
        content: `Sos la asistente de un spa/masajes en Argentina. ${stepHint}
Respondé en español argentino, cálido y breve (máximo 3 oraciones).
Usá SOLO el contexto provisto. No inventes precios, horarios ni direcciones.
Si no tenés el dato, decí que podés ayudar a reservar un turno o derivar a una persona.
No hagas listas largas ni repetís menús.

${context}`,
      },
      { role: 'user' as const, content: question },
    ];

    if (this.openai) {
      try {
        const res = await this.openai.chat.completions.create({
          model: 'gpt-4o-mini',
          temperature: 0.35,
          max_tokens: 180,
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
            max_tokens: 180,
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
