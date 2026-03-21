import { prisma } from '../config/database';
import OpenAI from 'openai';
import { env } from '../config/env';

export interface ExtractedLeadData {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  email?: string | null;
  dni?: string | null;
  offerInterest?: string | null;
  modalityInterest?: string | null;
  periodInterest?: string | null;
  intentLevel?: 'low' | 'medium' | 'high' | null;
}

export class LeadExtractionService {
  private static openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  /**
   * Extract structured lead data from conversation messages
   */
  static async extract(params: {
    tenantId: string;
    conversationId: string;
    leadId: string;
    latestMessage: string;
    profileName: string | null;
  }): Promise<ExtractedLeadData> {
    const { tenantId, conversationId, latestMessage, profileName } = params;

    // Load last 6 messages for context
    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: 6,
    });

    const conversationText = messages
      .reverse()
      .map((m) => `${m.direction === 'in' ? 'Usuario' : 'Bot'}: ${m.text}`)
      .join('\n');

    // Load active offers for this tenant
    const offers = await prisma.tenantOffer.findMany({
      where: { tenantId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    // Load current lead to know what we already have
    const lead = await prisma.lead.findUnique({ where: { id: params.leadId } });

    const offersCatalog = offers.length > 0
      ? offers.map((o, i) => {
          const synonyms = (o.synonymsJson as string[]) || [];
          return `${i + 1}. "${o.name}" (slug: "${o.slug}")\n   Sinónimos: ${synonyms.join(', ') || 'ninguno'}`;
        }).join('\n')
      : 'No hay catálogo de ofertas configurado para este tenant.';

    const alreadyKnown = [];
    if (lead?.firstName) alreadyKnown.push(`firstName: ${lead.firstName}`);
    if (lead?.lastName) alreadyKnown.push(`lastName: ${lead.lastName}`);
    if (lead?.email) alreadyKnown.push(`email: ${lead.email}`);
    if (lead?.dni) alreadyKnown.push(`dni: ${lead.dni}`);
    if (lead?.offerInterest) alreadyKnown.push(`offerInterest: ${lead.offerInterest}`);
    if (lead?.modalityInterest) alreadyKnown.push(`modalityInterest: ${lead.modalityInterest}`);
    if (lead?.periodInterest) alreadyKnown.push(`periodInterest: ${lead.periodInterest}`);

    const extractionPrompt = `Eres un extractor de datos estructurados de conversaciones de WhatsApp.
Extraé SOLO datos que el usuario haya mencionado explícitamente. No inventes ni inferir datos vagos.

Conversación reciente:
${conversationText}

Nombre de perfil WhatsApp: ${profileName || 'no disponible'}

Datos ya conocidos del lead:
${alreadyKnown.length > 0 ? alreadyKnown.join('\n') : 'Ninguno todavía'}

Catálogo de ofertas académicas del tenant:
${offersCatalog}

Instrucciones:
- firstName: nombre de pila del usuario (solo si lo dijo explícitamente)
- lastName: apellido del usuario (solo si lo dijo explícitamente)
- fullName: nombre completo si lo dijo todo junto
- email: correo electrónico (solo si lo mencionó)
- dni: documento de identidad (solo si lo mencionó)
- offerInterest: el SLUG de la oferta del catálogo que coincida con lo que el usuario pidió. Si no hay match claro, null.
- modalityInterest: presencial, a distancia, híbrida (solo si lo mencionó)
- periodInterest: año o período (solo si lo mencionó)
- intentLevel: "high" si quiere inscribirse/estudiar, "medium" si pide info específica, "low" si es consulta general

Si un campo no se puede extraer con certeza, usá null.
Si el profileName parece ser un nombre real y no hay firstName/lastName confirmados, podés usarlo como pista para fullName.

Respondé SOLO con JSON válido, sin markdown ni texto adicional:
{"firstName":null,"lastName":null,"fullName":null,"email":null,"dni":null,"offerInterest":null,"modalityInterest":null,"periodInterest":null,"intentLevel":null}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.1,
        max_tokens: 300,
        messages: [
          { role: 'system', content: extractionPrompt },
          { role: 'user', content: latestMessage },
        ],
      });

      const content = response.choices[0]?.message?.content?.trim();
      if (!content) return {};

      // Clean potential markdown wrapping
      const jsonStr = content.replace(/^```json?\n?/i, '').replace(/\n?```$/i, '').trim();
      const extracted = JSON.parse(jsonStr) as ExtractedLeadData;

      console.log(`🔍 Extracted lead data:`, JSON.stringify(extracted));
      return extracted;
    } catch (err) {
      console.error('⚠️ Lead extraction parse error:', err);
      return {};
    }
  }
}
