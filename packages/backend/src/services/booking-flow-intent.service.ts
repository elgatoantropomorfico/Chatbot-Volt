import { BookingAiService } from './booking-ai.service';

/** Normaliza texto para comparar opciones de menú */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP_WORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'y', 'o', 'a', 'en', 'con', 'por',
  'me', 'mi', 'quiero', 'qiero', 'dame', 'pone', 'poneme', 'voy', 'esa', 'ese', 'eso',
  'opcion', 'opción', 'numero', 'número', 'elijo', 'elegi', 'elige', 'tomo', 'voy con',
]);

function significantTokens(s: string): string[] {
  return norm(s)
    .split(' ')
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/** Patrones coloquiales frecuentes por etiqueta de opción (spa Argentina) */
const OPTION_HINTS: Array<{ pattern: RegExp; needles: string[] }> = [
  { pattern: /ayudame|ayúdame|recomend|no se cual|no sé cuál|elegi por mi|elegí por mí/i, needles: ['ayudame', 'elegir'] },
  { pattern: /ya se cual|ya sé cuál|se cual quiero|sé cuál quiero|ya lo tengo|se que quiero/i, needles: ['ya se', 'cual quiero'] },
  { pattern: /ver precio|precios|cuanto sale|cuánto sale|valor|tarifa/i, needles: ['precio', 'precios'] },
  { pattern: /seña|senal|50\s*%|mitad|abonar la seña/i, needles: ['seña', 'senal'] },
  { pattern: /pagar todo|100\s*%|pago total|completo/i, needles: ['100', 'total'] },
  { pattern: /cambiar horario|otro horario|otra fecha|otro turno|otro dia|otro día/i, needles: ['cambiar', 'horario'] },
  { pattern: /reservar este|este camino|ese camino|dale reservo|lo reservo/i, needles: ['reservar'] },
  { pattern: /ver otros|otros caminos|otra opcion|otra opción/i, needles: ['otros'] },
  { pattern: /hablar con|persona|humano|asesor/i, needles: ['hablar', 'persona', 'humano'] },
  { pattern: /esta semana|semana/i, needles: ['semana'] },
  { pattern: /elegir un dia|elegir un día|otro dia|otro día/i, needles: ['dia', 'día'] },
  { pattern: /mas opciones|más opciones|ver mas|ver más|proximos/i, needles: ['opciones', 'mas'] },
  { pattern: /si cancel|sí cancel|confirmo cancel|dale cancel/i, needles: ['cancel'] },
  { pattern: /no cancel|no quiero cancel|mejor no/i, needles: ['no'] },
];

export class BookingFlowIntentService {
  /**
   * Intenta mapear texto coloquial a índice de opción (1-based).
   * Reglas determinísticas — rápidas y sin alucinar.
   */
  static matchColloquialOption(rawText: string, options: string[]): number | null {
    const text = norm(rawText);
    if (!text || !options.length) return null;

    let bestIdx: number | null = null;
    let bestScore = 0;

    for (let i = 0; i < options.length; i++) {
      const opt = norm(options[i]);
      if (!opt) continue;

      let score = 0;

      if (text === opt) score += 100;
      if (text.includes(opt) || opt.includes(text)) score += 80;

      const optTokens = significantTokens(options[i]);
      const textTokens = significantTokens(rawText);
      const overlap = optTokens.filter((t) => textTokens.includes(t) || text.includes(t));
      score += overlap.length * 25;

      for (const hint of OPTION_HINTS) {
        if (!hint.pattern.test(rawText)) continue;
        const labelHit = hint.needles.some((n) => opt.includes(norm(n)));
        if (labelHit) score += 40;
      }

      if (score > bestScore) {
        bestScore = score;
        bestIdx = i + 1;
      }
    }

    // Umbral mínimo para evitar falsos positivos en mensajes vagos
    if (bestScore >= 50) return bestIdx;
    return null;
  }

  static matchesHomeColloquial(rawText: string): boolean {
    return /volver al inicio|volver al menu|volver al menú|empezar de nuevo|desde cero|menu principal|menú principal/i.test(rawText);
  }

  /** ¿Conviene intentar IA para clasificar menú? */
  static shouldTryAiMenuMatch(rawText: string): boolean {
    const t = rawText.trim();
    if (t.length < 3 || t.length > 140) return false;
    if (BookingAiService.looksLikeAvailabilityQuestion(t)) return false;
    if (t.includes('?') && t.length > 50) return false;
    if (/^(hola|buenas|hey|gracias)\b/i.test(t) && t.length < 20) return false;
    return true;
  }

  /**
   * Clasificador IA liviano: devuelve índice 1..N o null.
   * Solo se usa si las reglas no matchearon.
   */
  static async classifyMenuOption(userText: string, options: string[]): Promise<number | null> {
    if (!this.shouldTryAiMenuMatch(userText) || options.length === 0) return null;

    const numbered = options.map((o, i) => `${i + 1}. ${o}`).join('\n');
    const result = await BookingAiService.completeChatShort(
      [
        {
          role: 'system',
          content: `Sos un clasificador de menú para WhatsApp (spa Argentina).
Opciones actuales:
${numbered}

El usuario escribió un mensaje coloquial que puede referirse a UNA opción.
Respondé SOLO con un número del 1 al ${options.length} si el mensaje claramente elige esa opción.
Respondé 0 si es una pregunta general, charla, consulta de disponibilidad, o no elige ninguna opción.
No expliques nada.`,
        },
        { role: 'user', content: userText },
      ],
      8,
    );

    if (!result) return null;
    const n = parseInt(result.replace(/\D/g, ''), 10);
    if (n >= 1 && n <= options.length) return n;
    return null;
  }
}
