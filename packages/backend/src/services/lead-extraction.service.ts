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
  [key: string]: any; // custom fields from LeadFieldConfig
}

interface FieldDef {
  key: string;
  label: string;
  fieldType: string;
  options: any[];
  promptHint?: string | null;
  scope?: 'lead' | 'request';
}

export class LeadExtractionService {
  private static openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  /**
   * Extract structured lead data from conversation messages.
   * Supports both ZohoFieldConfig (Zoho tenants) and LeadFieldConfig (generic tenants).
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

    // Load current lead + active request to know what we already have.
    const lead = await prisma.lead.findUnique({ where: { id: params.leadId } });
    const customData = (lead as any)?.customData as Record<string, any> || {};
    const activeRequest = await (prisma as any).leadRequest.findFirst({
      where: { leadId: params.leadId, status: 'in_progress' },
      orderBy: { createdAt: 'desc' },
    });
    const requestData = (activeRequest?.data as Record<string, any>) || {};

    // Determine which field config system to use
    const leadFieldConfigs = await prisma.leadFieldConfig.findMany({
      where: { tenantId, isActive: true },
      orderBy: [{ step: 'asc' }, { sortOrder: 'asc' }],
    });

    let fields: FieldDef[] = [];
    let isGenericTenant = false;

    const pilotIntegration = await prisma.integration.findFirst({
      where: { tenantId, type: 'pilot_crm', status: 'active' },
    });

    if (leadFieldConfigs.length > 0) {
      // Generic tenant with LeadFieldConfig
      isGenericTenant = true;
      fields = leadFieldConfigs
        .filter((fc: any) => fc.fieldType !== 'photo' && fc.fieldType !== 'multi_photo')
        .map((fc: any) => ({
          key: fc.fieldKey,
          label: fc.label,
          fieldType: fc.fieldType,
          options: (fc.optionsJson as any[]) || [],
          promptHint: fc.promptHint,
          scope: (fc.scope || 'request') as 'lead' | 'request',
        }));
    } else if (pilotIntegration) {
      const pilotConfigs = await prisma.pilotFieldConfig.findMany({
        where: { tenantId, isActive: true },
        orderBy: { sortOrder: 'asc' },
      });
      fields = pilotConfigs
        .filter((fc: any) => fc.localKey !== 'phone')
        .map((fc: any) => ({
          key: fc.localKey,
          label: fc.label,
          fieldType: fc.fieldType,
          options: (fc.optionsJson as any[]) || [],
          promptHint: fc.description,
        }));
    } else {
      // Try ZohoFieldConfig for Zoho-integrated tenants
      const zohoConfigs = await prisma.zohoFieldConfig.findMany({
        where: { tenantId, isActive: true },
        orderBy: { sortOrder: 'asc' },
      });
      fields = zohoConfigs
        .filter((fc: any) => !fc.fixedValue && fc.localKey !== 'phone')
        .map((fc: any) => ({
          key: fc.localKey,
          label: fc.label,
          fieldType: fc.fieldType,
          options: (fc.optionsJson as any[]) || [],
          promptHint: null,
        }));
    }

    if (fields.length === 0 && !isGenericTenant) {
      // No field configs at all, skip extraction
      return {};
    }

    // Build "already known" context
    const alreadyKnown: string[] = [];
    if (lead?.firstName) alreadyKnown.push(`firstName/fname: ${lead.firstName}`);
    if (lead?.lastName) alreadyKnown.push(`lastName/lname: ${lead.lastName}`);
    if (lead?.email) alreadyKnown.push(`email: ${lead.email}`);
    if (lead?.dni) alreadyKnown.push(`dni: ${lead.dni}`);
    if (lead?.offerInterest) alreadyKnown.push(`product/offerInterest: ${lead.offerInterest}`);
    for (const [k, v] of Object.entries(customData)) {
      if (v) alreadyKnown.push(`${k}: ${v}`);
    }

    // Standard lead columns
    const stdKeys = ['offerInterest', 'modalityInterest', 'periodInterest'];
    for (const k of stdKeys) {
      const val = (lead as any)?.[k];
      if (val) alreadyKnown.push(`${k}: ${val}`);
    }

    // Custom data already known: read from lead.customData for scope='lead'
    // fields, and from the ACTIVE request's data for scope='request' fields.
    for (const f of fields) {
      const scope = f.scope || 'request';
      const source = scope === 'lead' ? customData : requestData;
      const val = source[f.key];
      if (val) alreadyKnown.push(`${f.key}: ${val}`);
    }

    // Build field instructions
    const picklistInstructions: string[] = [];
    const textFieldInstructions: string[] = [];

    for (const f of fields) {
      if (f.fieldType === 'picklist' && f.options.length > 0) {
        const optLines = f.options.map((o: any, i: number) => {
          const aliases = (o.aliases || []).join(', ');
          return `  ${i + 1}. "${o.value}"${aliases ? `  — aliases: ${aliases}` : ''}`;
        }).join('\n');
        picklistInstructions.push(
          `- ${f.key}: ${f.label}. Valores válidos:\n${optLines}\n  → Devolvé el VALUE exacto que mejor coincida. Si no hay match claro, null.`
        );
      } else {
        const hint = f.promptHint ? ` (${f.promptHint})` : ' (solo si lo mencionó explícitamente)';
        textFieldInstructions.push(`- ${f.key}: ${f.label}${hint}`);
      }
    }

    // Build JSON template for response
    const jsonTemplate: Record<string, null> = {};
    if (isGenericTenant) {
      jsonTemplate.firstName = null;
      jsonTemplate.lastName = null;
      jsonTemplate.fullName = null;
    } else if (pilotIntegration) {
      jsonTemplate.fname = null;
      jsonTemplate.lname = null;
      jsonTemplate.fullName = null;
    } else {
      jsonTemplate.firstName = null;
      jsonTemplate.lastName = null;
      jsonTemplate.fullName = null;
      jsonTemplate.email = null;
      jsonTemplate.dni = null;
      jsonTemplate.offerInterest = null;
      jsonTemplate.modalityInterest = null;
      jsonTemplate.periodInterest = null;
    }
    // Add custom field keys
    for (const f of fields) {
      if (f.fieldType !== 'photo' && f.fieldType !== 'multi_photo') {
        jsonTemplate[f.key] = null;
      }
    }
    jsonTemplate.intentLevel = null;

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
- intentLevel: "high" si quiere contratar/usar el servicio, "medium" si pide info específica, "low" si es consulta general

Campos picklist (DEBE coincidir con un valor válido o null):
${picklistInstructions.length > 0 ? picklistInstructions.join('\n') : '(sin picklists configurados)'}

Reglas:
- Si un campo no se puede extraer con certeza, usá null.
- Para picklists, SOLO devolvé un valor/slug que esté en la lista. Si el usuario dijo algo que no matchea con ninguna opción, devolvé null.
- Si el profileName parece ser un nombre real y no hay firstName/lastName confirmados, podés usarlo como pista para fullName.

Respondé SOLO con JSON válido, sin markdown ni texto adicional:
${JSON.stringify(jsonTemplate)}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.1,
        max_tokens: 500,
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

      // Pilot: no registrar modelo/plan hasta tener nombre y apellido confirmados
      if (pilotIntegration && lead) {
        const hasName = !!(lead.firstName && lead.lastName);
        const willHaveName = !!(
          (extracted.firstName || (extracted as any).fname) &&
          (extracted.lastName || (extracted as any).lname)
        );
        if (!hasName && !willHaveName) {
          delete extracted.offerInterest;
          delete (extracted as any).product;
          delete (extracted as any).biz;
          delete (extracted as any).has_trade_in;
        }
      }

      console.log(`🔍 Extracted lead data:`, JSON.stringify(extracted));
      return extracted;
    } catch (err) {
      console.error('⚠️ Lead extraction parse error:', err);
      return {};
    }
  }
}
