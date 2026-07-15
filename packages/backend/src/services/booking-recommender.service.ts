/**
 * Recomendador de caminos — scoring por recommendationTags del admin.
 * Misma lógica que el FSM v1, usable desde el orchestrator v2.
 */
import { prisma } from '../config/database';

export const RECOMMENDER_Q1_OPTIONS = [
  'Soltar tensión',
  'Descansar piernas',
  'Calor profundo',
  'Experiencia sensorial',
  'Aflojar rigidez',
];

export const RECOMMENDER_Q2_OPTIONS = [
  'Suave y relajante',
  'Profunda y envolvente',
  'Con calor',
  'Con aromas/herbales',
  'Más corporal',
];

export const RECOMMENDER_CONFIRM_OPTIONS = [
  'Reservar este camino',
  'Ver otros caminos',
  'Hablar con persona',
];

const Q1_TAGS: Record<number, string[]> = {
  1: ['tension_acumulada', 'relajacion', 'equilibrio'],
  2: ['pies', 'piernas', 'cansancio'],
  3: ['calor', 'piedras_calientes', 'contracturas'],
  4: ['aromas', 'sensorial', 'hierbas'],
  5: ['bambu', 'drenaje', 'vitalidad'],
};

const Q2_TAGS: Record<number, string[]> = {
  1: ['relajacion', 'calma'],
  2: ['relajacion_profunda', 'envolvente'],
  3: ['calor', 'piedras_calientes'],
  4: ['aromas', 'hierbas', 'sensorial'],
  5: ['drenaje', 'presion_ritmica', 'cuerpo_trabado'],
};

export class BookingRecommenderService {
  static scoreService(service: { recommendationTags?: unknown }, q1: number, q2: number): number {
    const tags = (Array.isArray(service.recommendationTags) ? service.recommendationTags : []) as string[];
    let score = 0;
    for (const t of [...(Q1_TAGS[q1] || []), ...(Q2_TAGS[q2] || [])]) {
      if (tags.includes(t)) score += 1;
    }
    return score;
  }

  static async recommend(
    tenantId: string,
    q1: number,
    q2: number,
  ): Promise<{
    id: string;
    name: string;
    recommendationText: string;
  } | null> {
    const services = await prisma.bookingService.findMany({
      where: { tenantId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    if (!services.length) return null;

    const ranked = [...services].sort(
      (a, b) => this.scoreService(b, q1, q2) - this.scoreService(a, q1, q2),
    );
    const best = ranked[0];
    return {
      id: best.id,
      name: best.name,
      recommendationText: best.botRecommendationText || `Te recomiendo *${best.name}*.`,
    };
  }
}
