import OpenAI from 'openai';
import { env } from '../config/env';
import { prisma } from '../config/database';

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

interface ChatContext {
  systemPrompt: string;
  model: string;
  temperature: number;
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[];
}

export class OpenAIService {
  static async generateResponse(context: ChatContext): Promise<string> {
    const completion = await openai.chat.completions.create({
      model: context.model,
      temperature: context.temperature,
      messages: [
        { role: 'system', content: context.systemPrompt },
        ...context.messages,
      ],
      max_tokens: 1024,
    });

    return completion.choices[0]?.message?.content?.trim() || 'Lo siento, no pude generar una respuesta.';
  }

  static async buildContext(conversationId: string, tenantId: string): Promise<ChatContext> {
    const [botSettings, conversation] = await Promise.all([
      prisma.botSettings.findUnique({ where: { tenantId } }),
      prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 15,
          },
        },
      }),
    ]);

    if (!botSettings || !conversation) {
      throw new Error('Bot settings or conversation not found');
    }

    let systemPrompt = botSettings.systemPrompt;

    // Inject active guardrails into the system prompt
    const guardrails = (botSettings as any).guardrailsJson as Array<{ id: string; label: string; prompt: string; enabled: boolean }> | null;
    if (guardrails && Array.isArray(guardrails)) {
      const activeRules = guardrails.filter((g) => g.enabled).map((g) => g.prompt);
      if (activeRules.length > 0) {
        systemPrompt += `\n\n[RESTRICCIONES OBLIGATORIAS - Debes cumplir SIEMPRE estas reglas]:\n${activeRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`;
      }
    }

    if (conversation.summary) {
      systemPrompt += `\n\nResumen de la conversación previa: ${conversation.summary}`;
    }

    const messages = conversation.messages
      .reverse()
      .map((msg) => ({
        role: (msg.direction === 'in' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: msg.text,
      }));

    return {
      systemPrompt,
      model: botSettings.model,
      temperature: botSettings.temperature,
      messages,
    };
  }

  static async generateSummary(conversationId: string): Promise<string> {
    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: 30,
    });

    if (messages.length < 5) return '';

    const transcript = messages
      .map((m) => `${m.direction === 'in' ? 'Cliente' : 'Bot'}: ${m.text}`)
      .join('\n');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content: 'Resume la siguiente conversación en 2-3 oraciones. Incluye los temas principales, intenciones del cliente y cualquier acción pendiente.',
        },
        { role: 'user', content: transcript },
      ],
      max_tokens: 256,
    });

    return completion.choices[0]?.message?.content?.trim() || '';
  }

  static detectWooIntent(text: string): { intent: string; query: string } | null {
    const lowerText = text.toLowerCase();

    const orderPatterns = [
      /(?:estado|rastrear|seguir|tracking|dónde está|donde esta).*(?:pedido|orden|compra|envío|envio)/,
      /(?:pedido|orden|compra).*(?:número|numero|nro|#)\s*(\w+)/,
      /mi (?:pedido|orden|compra)/,
    ];

    const productPatterns = [
      /(?:buscar|busco|tenés|tenes|tienen|hay|precio|cuesta|vale)\s+.{2,}/,
      /(?:producto|artículo|articulo).*(?:buscar|busco|precio|cuesta)/,
      /cu[aá]nto (?:cuesta|sale|vale)/,
      /(?:quiero|necesito|me interesa)\s+(?:comprar|ver|saber|un|una|el|la|los|las)\s+.{2,}/,
      /(?:stock|disponib|entrega inmediata)/,
      /(?:venden|ofrecen|manejan|trabajan con)\s+.{2,}/,
      /(?:libros?|ejemplar) (?:de|del|sobre)\s+.{2,}/,
      /(?:tienen|tenes|tenés)\s+.{2,}/,
    ];

    for (const pattern of orderPatterns) {
      if (pattern.test(lowerText)) {
        return { intent: 'order_lookup', query: text };
      }
    }

    for (const pattern of productPatterns) {
      if (pattern.test(lowerText)) {
        const cleanedQuery = this.extractProductQuery(text);
        return { intent: 'product_search', query: cleanedQuery };
      }
    }

    return null;
  }

  private static extractProductQuery(text: string): string {
    let q = text.trim();
    // Remove common prefixes to get just the product name
    const prefixes = [
      /^(?:hola[,!.]?\s*)/i,
      /^(?:tienen|tenes|tenés|hay|busco|buscar|quiero|necesito|me interesa)\s+/i,
      /^(?:cuánto|cuanto)\s+(?:cuesta|sale|vale)\s+/i,
      /^(?:venden|ofrecen|manejan)\s+/i,
      /^(?:libros?\s+(?:de|del|sobre))\s+/i,
      /^(?:quiero|necesito|me interesa)\s+(?:comprar|ver|saber|un|una|el|la|los|las)\s+/i,
      /^(?:el|la|los|las|un|una)\s+/i,
    ];
    for (const prefix of prefixes) {
      q = q.replace(prefix, '');
    }
    // Remove trailing question marks and punctuation
    q = q.replace(/[?!¿¡.,]+$/g, '').trim();
    return q || text;
  }
}
