import OpenAI from 'openai';
import { env } from '../config/env';
import { BookingAvailabilityService, AvailableSlot } from './booking-availability.service';
import { prisma } from '../config/database';

/**
 * Controlled IA for booking tenants — FAQ, date hints, always returns to flow.
 */
export class BookingAiService {
  private static openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

  static looksLikeQuestion(text: string): boolean {
    const t = text.toLowerCase();
    return t.includes('?') || /^(cuánto|cuanto|dónde|donde|qué|que|cómo|como|duración|duracion|precio|horario|ubicación|ubicacion)/.test(t);
  }

  static looksLikeDateQuery(text: string): boolean {
    const t = text.toLowerCase();
    return /(lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo|mañana|manana|tarde|noche|hoy|\d{1,2}\/\d{1,2})/.test(t);
  }

  /** Short FAQ — max 2 sentences, no state change */
  static async answerFaq(tenantId: string, question: string, settings: any): Promise<string | null> {
    if (!this.openai) return null;

    const services = await prisma.bookingService.findMany({
      where: { tenantId, isActive: true },
      select: { name: true, shortDescription: true, durationMinutes: true },
    });
    const basePrice = settings.basePrice ? Number(settings.basePrice) : null;
    const duration = settings.sessionDurationMinutes || 80;

    const context = `Negocio de spa/masajes. Sesiones de ${duration} min.
Precio base: ${basePrice ? `$${basePrice} ARS` : 'consultar'}.
Servicios: ${services.map((s) => s.name).join(', ')}.
Política seña: ${(settings.cancellationPolicyJson as any)?.policy_short_text || 'Seña del 50%, no reembolsable.'}`;

    try {
      const res = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        max_tokens: 120,
        messages: [
          {
            role: 'system',
            content: `Respondé en español argentino, máximo 2 oraciones, solo con datos del contexto. Si no sabés, decí que un asesor puede ayudar. No inventes precios ni horarios.\n${context}`,
          },
          { role: 'user', content: question },
        ],
      });
      return res.choices[0]?.message?.content?.trim() || null;
    } catch {
      return null;
    }
  }

  /** Parse free-text date/time intent → filter available slots */
  static async slotsForDateQuery(tenantId: string, query: string, serviceId?: string): Promise<AvailableSlot[]> {
    const all = await BookingAvailabilityService.getAvailableSlots(tenantId, { limit: 30, serviceId });
    const q = query.toLowerCase();

    const dayMap: Record<string, number> = {
      domingo: 0, lunes: 1, martes: 2, miércoles: 3, miercoles: 3,
      jueves: 4, viernes: 5, sábado: 6, sabado: 6,
    };

    let targetDow: number | null = null;
    for (const [name, dow] of Object.entries(dayMap)) {
      if (q.includes(name)) { targetDow = dow; break; }
    }

    const wantsAfternoon = q.includes('tarde') || q.includes('noche');
    const wantsMorning = q.includes('mañana') || q.includes('manana');

    return all.filter((s) => {
      const d = s.dateObj;
      if (targetDow != null && d.getDay() !== targetDow) return false;
      const [h] = s.time.split(':').map(Number);
      if (wantsAfternoon && h < 12) return false;
      if (wantsMorning && h >= 14) return false;
      return true;
    }).slice(0, 5);
  }
}
