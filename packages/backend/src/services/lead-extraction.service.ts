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

    // Load ZohoFieldConfig for this tenant (all active fields)
    const fieldConfigs = await prisma.zohoFieldConfig.findMany({
      where: { tenantId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    // Load current lead to know what we already have
    const lead = await prisma.lead.findUnique({ where: { id: params.leadId } });

    // Build picklist catalogs for the prompt from ZohoFieldConfig
    const picklistInstructions: string[] = [];
    for (const fc of fieldConfigs) {
      if (fc.fixedValue) continue; // skip fixed fields
      const opts = (fc.optionsJson as any[]) || [];
      if ((fc.fieldType === 'picklist' || fc.fieldType === 'multi_select') && opts.length > 0) {
        const optLines = opts.map((o: any, i: number) => {
          const aliases = (o.aliases || []).join(', ');
          const slug = o.slug ? ` (slug: "${o.slug}")` : '';
          return `  ${i + 1}. "${o.value}"${slug}${aliases ? `  — aliases: ${aliases}` : ''}`;
        }).join('\n');
        // For offerInterest use slug, for others use value
        const useSlug = fc.localKey === 'offerInterest' && opts.some((o: any) => o.slug);
        picklistInstructions.push(
          `- ${fc.localKey}: ${fc.label}. Valores válidos:\n${optLines}\n  → Devolvé ${useSlug ? 'el SLUG' : 'el VALUE exacto'} que mejor coincida. Si no hay match claro, null.`
        );
      }
    }

    // Build "already known" context
    const alreadyKnown: string[] = [];
    const extractableKeys = fieldConfigs.filter(fc => !fc.fixedValue && fc.localKey !== 'phone').map(fc => fc.localKey);
    for (const key of extractableKeys) {
      const val = (lead as any)?.[key];
      if (val) alreadyKnown.push(`${key}: ${val}`);
    }
    if (lead?.firstName) alreadyKnown.push(`firstName: ${lead.firstName}`);
    if (lead?.lastName) alreadyKnown.push(`lastName: ${lead.lastName}`);

    // Build field instructions for non-picklist fields
    const textFieldInstructions: string[] = [];
    for (const fc of fieldConfigs) {
      if (fc.fixedValue) continue;
      const opts = (fc.optionsJson as any[]) || [];
      const isPicklist = (fc.fieldType === 'picklist' || fc.fieldType === 'multi_select') && opts.length > 0;
      if (isPicklist) continue; // handled above
      if (fc.localKey === 'phone') continue; // we get phone from WABA
      textFieldInstructions.push(`- ${fc.localKey}: ${fc.label} (solo si lo mencionó explícitamente)`);
    }

    const extractionPrompt = `Eres un extractor de datos estructurados de conversaciones de WhatsApp.
Extraé SOLO datos que el usuario haya mencionado explícitamente. No inventes ni inferir datos vagos.

Conversación reciente:
${conversationText}

Nombre de perfil WhatsApp: ${profileName || 'no disponible'}

Datos ya conocidos del lead:
${alreadyKnown.length > 0 ? alreadyKnown.join('\n') : 'Ninguno todavía'}

Campos de texto (extraer solo si mencionados):
- firstName: nombre de pila del usuario (solo si lo dijo explícitamente)
- lastName: apellido del usuario (solo si lo dijo explícitamente)
- fullName: nombre completo si lo dijo todo junto
${textFieldInstructions.join('\n')}
- intentLevel: "high" si quiere inscribirse/estudiar, "medium" si pide info específica, "low" si es consulta general

Campos picklist (DEBE coincidir con un valor válido o null):
${picklistInstructions.length > 0 ? picklistInstructions.join('\n') : '(sin picklists configurados)'}

Reglas:
- Si un campo no se puede extraer con certeza, usá null.
- Para picklists, SOLO devolvé un valor/slug que esté en la lista. Si el usuario dijo algo que no matchea con ninguna opción, devolvé null.
- Si el profileName parece ser un nombre real y no hay firstName/lastName confirmados, podés usarlo como pista para fullName.

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
