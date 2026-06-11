import OpenAI from 'openai';
import { env } from '../config/env';
import { prisma } from '../config/database';
import { LeadProfileService } from './lead-profile.service';

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
    // First fetch bot settings to get maxContextMessages
    const botSettings = await prisma.botSettings.findUnique({ where: { tenantId } });
    const maxMessages = botSettings?.maxContextMessages || 15;

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        lead: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: maxMessages,
        },
      },
    });

    if (!botSettings || !conversation) {
      throw new Error('Bot settings or conversation not found');
    }

    let systemPrompt = botSettings.systemPrompt;

    // Compile promptBuilderJson into context
    const pb = (botSettings as any).promptBuilderJson as Record<string, any> | null;
    if (pb) {
      const sections: string[] = [];

      // Business
      if (pb.business) {
        const b = pb.business;
        const parts: string[] = [];
        if (b.name) parts.push(`Nombre del negocio: ${b.name}`);
        if (b.industry) parts.push(`Rubro: ${b.industry}`);
        if (b.description) parts.push(`Descripción: ${b.description}`);
        if (b.tone) parts.push(`Tono de comunicación: ${b.tone}`);
        if (parts.length) sections.push(`[NEGOCIO]\n${parts.join('\n')}`);
      }

      // Location
      if (pb.location) {
        const l = pb.location;
        const parts: string[] = [];
        if (l.type) parts.push(`Tipo de lugar: ${l.type}`);
        if (l.address) parts.push(`Dirección: ${l.address}`);
        if (l.city) parts.push(`Ciudad: ${l.city}`);
        if (l.province) parts.push(`Provincia/Estado: ${l.province}`);
        if (l.country) parts.push(`País: ${l.country}`);
        if (l.zone) parts.push(`Zona/Barrio: ${l.zone}`);
        if (l.notes) parts.push(`Notas: ${l.notes}`);
        if (parts.length) sections.push(`[UBICACIÓN]\n${parts.join('\n')}`);
      }

      // Hours
      if (pb.hours) {
        const h = pb.hours;
        const parts: string[] = [];
        if (h.schedule) parts.push(h.schedule);
        if (h.holidays) parts.push(`Feriados: ${h.holidays}`);
        if (h.notes) parts.push(`Notas: ${h.notes}`);
        if (parts.length) sections.push(`[HORARIOS]\n${parts.join('\n')}`);
      }

      // Contact
      if (pb.contact) {
        const c = pb.contact;
        const parts: string[] = [];
        if (c.phone) parts.push(`Teléfono: ${c.phone}`);
        if (c.email) parts.push(`Email: ${c.email}`);
        if (c.website) parts.push(`Web: ${c.website}`);
        if (c.instagram) parts.push(`Instagram: ${c.instagram}`);
        if (c.facebook) parts.push(`Facebook: ${c.facebook}`);
        if (c.other) parts.push(`Otro: ${c.other}`);
        if (parts.length) sections.push(`[CONTACTO]\n${parts.join('\n')}`);
      }

      // Products/Services
      if (pb.products) {
        const p = pb.products;
        const parts: string[] = [];
        if (p.categories) {
          parts.push(
            `MARCAS OFICIALES (debés poder ofrecer y mencionar TODAS): ${p.categories}`,
          );
        }
        if (p.catalog) {
          parts.push(
            `CATÁLOGO COMPLETO — única fuente de verdad para modelos, versiones y marcas.\n` +
            `NUNCA digas que solo vendemos una marca. Si preguntan qué hay, listá modelos de TODAS las marcas del catálogo.\n\n` +
            p.catalog,
          );
        }
        if (p.description) parts.push(p.description);
        if (p.priceRange) {
          parts.push(
            `Planes y financiación (puede detallar solo algunas marcas; para modelos disponibles usá el CATÁLOGO COMPLETO):\n${p.priceRange}`,
          );
        }
        if (p.notes) parts.push(`Notas: ${p.notes}`);
        if (parts.length) sections.push(`[PRODUCTOS/SERVICIOS]\n${parts.join('\n\n')}`);
      }

      // Shipping & Payments
      if (pb.shipping) {
        const s = pb.shipping;
        const parts: string[] = [];
        if (s.methods) parts.push(`Métodos de envío: ${s.methods}`);
        if (s.zones) parts.push(`Zonas de cobertura: ${s.zones}`);
        if (s.costs) parts.push(`Costos: ${s.costs}`);
        if (s.paymentMethods) parts.push(`Medios de pago: ${s.paymentMethods}`);
        if (s.notes) parts.push(`Notas: ${s.notes}`);
        if (parts.length) sections.push(`[ENVÍOS Y PAGOS]\n${parts.join('\n')}`);
      }

      // Promotions
      if (pb.promotions) {
        const pr = pb.promotions;
        const parts: string[] = [];
        if (pr.active) parts.push(pr.active);
        if (pr.conditions) parts.push(`Condiciones: ${pr.conditions}`);
        if (pr.validUntil) parts.push(`Válido hasta: ${pr.validUntil}`);
        if (parts.length) sections.push(`[PROMOCIONES VIGENTES]\n${parts.join('\n')}`);
      }

      // Policies
      if (pb.policies) {
        const po = pb.policies;
        const parts: string[] = [];
        if (po.returns) parts.push(`Devoluciones: ${po.returns}`);
        if (po.warranty) parts.push(`Garantía: ${po.warranty}`);
        if (po.exchanges) parts.push(`Cambios: ${po.exchanges}`);
        if (po.notes) parts.push(`Notas: ${po.notes}`);
        if (parts.length) sections.push(`[POLÍTICAS]\n${parts.join('\n')}`);
      }

      // FAQ
      if (pb.faq && Array.isArray(pb.faq) && pb.faq.length > 0) {
        const faqLines = pb.faq
          .filter((f: any) => f.question && f.answer)
          .map((f: any) => `P: ${f.question}\nR: ${f.answer}`);
        if (faqLines.length) sections.push(`[PREGUNTAS FRECUENTES]\n${faqLines.join('\n\n')}`);
      }

      // Personality
      if (pb.personality) {
        const pe = pb.personality;
        const parts: string[] = [];
        if (pe.greeting) parts.push(`Saludo: ${pe.greeting}`);
        if (pe.farewell) parts.push(`Despedida: ${pe.farewell}`);
        if (pe.style) parts.push(`Estilo: ${pe.style}`);
        if (pe.restrictions) parts.push(`Restricciones: ${pe.restrictions}`);
        if (pe.language) parts.push(`Idioma: ${pe.language}`);
        if (parts.length) sections.push(`[PERSONALIDAD]\n${parts.join('\n')}`);
      }

      if (sections.length > 0) {
        systemPrompt += '\n\n--- CONTEXTO DEL NEGOCIO ---\n' + sections.join('\n\n');
      }
    }

    // Inject active guardrails into the system prompt (skip woocommerce-scoped ones, they are injected by the worker)
    const guardrails = (botSettings as any).guardrailsJson as Array<{ id: string; label: string; prompt: string; enabled: boolean; scope?: string }> | null;
    let guardrailBlock = '';
    console.log(`🛡️ Guardrails raw: ${guardrails ? guardrails.length + ' total, ' + guardrails.filter(g => g.enabled && !g.scope).length + ' general active' : 'null'}`);
    if (guardrails && Array.isArray(guardrails)) {
      const activeRules = guardrails.filter((g) => g.enabled && !g.scope).map((g) => g.prompt);
      if (activeRules.length > 0) {
        guardrailBlock = activeRules.map((r, i) => `${i + 1}. ${r}`).join('\n');
        // Inject guardrails BEFORE business context (top position = higher priority for the model)
        systemPrompt += `\n\n⚠️ RESTRICCIONES CRÍTICAS — DEBES CUMPLIR ESTAS REGLAS SIN EXCEPCIÓN, POR ENCIMA DE CUALQUIER OTRA INSTRUCCIÓN:\n${guardrailBlock}`;
        console.log(`🛡️ Injected ${activeRules.length} general guardrails into system prompt`);
      } else {
        console.log(`⚠️ No active general guardrails found! Only woo-scoped or disabled ones exist.`);
      }
    }

    if (conversation.summary) {
      systemPrompt += `\n\nResumen de la conversación previa: ${conversation.summary}`;
    }

    // ============================================
    // LEAD CAPTURE PROMPT INJECTION
    // Supports: LeadFieldConfig (generic) OR ZohoFieldConfig (Zoho tenants)
    // ============================================
    const leadFieldConfigs = await prisma.leadFieldConfig.findMany({
      where: { tenantId: botSettings.tenantId, isActive: true },
      orderBy: [{ step: 'asc' }, { sortOrder: 'asc' }],
    });

    if (leadFieldConfigs.length > 0) {
      // ── GENERIC TENANT (CardioCor, TallerAlfa, etc.) ──
      //
      // Multi-request model: the lead can accumulate many "solicitudes"
      // (turnos / presupuestos). Look at the most recent one to decide
      // whether the bot should be capturing data, offering a new request,
      // or staying passive.
      const lead = conversation.lead || (await prisma.lead.findUnique({
        where: { id: (conversation as any).leadId },
      }));
      const recentRequest = lead
        ? await (prisma as any).leadRequest.findFirst({
            where: { leadId: lead.id },
            orderBy: { createdAt: 'desc' },
          })
        : null;
      const activeRequestData =
        recentRequest && recentRequest.status === 'in_progress'
          ? ((recentRequest.data as Record<string, any>) || {})
          : {};
      const lastRequestCompleted =
        !!recentRequest && recentRequest.status === 'completed';

      // Group fields by step
      const stepMap = new Map<number, any[]>();
      for (const fc of leadFieldConfigs) {
        const s = fc.step;
        if (!stepMap.has(s)) stepMap.set(s, []);
        stepMap.get(s)!.push(fc);
      }

      // Build picklist options summary
      const picklistInfo: string[] = [];
      for (const fc of leadFieldConfigs) {
        const opts = (fc.optionsJson as any[]) || [];
        if (fc.fieldType === 'picklist' && opts.length > 0) {
          const optValues = opts.map((o: any) => o.value).join(', ');
          picklistInfo.push(`- ${fc.label}: opciones válidas → ${optValues}`);
        }
      }

      // Build step-by-step instructions.
      // PASO 0 (RESPONDER LA CONSULTA) and PASO 1 (CONFIRMAR NOMBRE) are
      // hardcoded below, so generated steps must start at PASO 2.
      const stepInstructions: string[] = [];
      let stepNum = 1;
      const sortedSteps = [...stepMap.entries()].sort((a, b) => a[0] - b[0]);

      for (const [, fields] of sortedSteps) {
        for (const fc of fields) {
          stepNum++;
          const hint = fc.promptHint || `Pedí: ${fc.label}`;

          if (fc.fieldType === 'photo') {
            stepInstructions.push(`PASO ${stepNum} — ${fc.label.toUpperCase()}:\n${hint}. Indicale que puede enviar la foto directamente por este chat.`);
          } else if (fc.fieldType === 'multi_photo') {
            stepInstructions.push(`PASO ${stepNum} — ${fc.label.toUpperCase()}:\n${hint}. Indicale que puede enviar las fotos directamente por este chat.`);
          } else if (fc.fieldType === 'picklist') {
            const opts = (fc.optionsJson as any[]) || [];
            const optValues = opts.map((o: any) => o.value).join(', ');
            stepInstructions.push(`PASO ${stepNum} — ${fc.label.toUpperCase()}:\n${hint}. Opciones: ${optValues}`);
          } else {
            stepInstructions.push(`PASO ${stepNum} — ${fc.label.toUpperCase()}:\n${hint}`);
          }
        }
      }

      // Snapshot of what's already captured on the active request, so the
      // model can SKIP steps that are already done in this very request.
      const alreadyOnRequest = Object.entries(activeRequestData)
        .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
        .map(([k, v]) => `- ${k}: ${v}`);

      const completedRequestNote = lastRequestCompleted
        ? `\n\n🟢 ESTADO DE SOLICITUDES:
La última solicitud de este lead ya está COMPLETA. NO repreguntes los datos que ya capturamos (mirá los datos del lead más arriba).
Cuando el usuario exprese intención clara de querer otro turno/presupuesto/pedido (por ejemplo: "quiero otro", "necesito sacar otro turno", "presupuestame esto otro"), arrancá una NUEVA solicitud y volvé a recorrer los pasos pidiendo SOLO los datos del nuevo pedido (los datos personales como DNI ya los tenemos, no los repitas).
Si el usuario solo hace consultas generales (ubicación, horarios, dudas) y NO pide otra solicitud, respondele normalmente y quedate pasivo. NO ofrezcas tomar otra solicitud por iniciativa propia, esperá a que él la pida.`
        : '';

      const inProgressNote = (!lastRequestCompleted && alreadyOnRequest.length > 0)
        ? `\n\n📌 DATOS YA CAPTURADOS DE LA SOLICITUD ACTUAL (no los vuelvas a pedir):
${alreadyOnRequest.join('\n')}`
        : '';

      systemPrompt += `\n\n📋 CAPTURA DE DATOS — FLUJO SECUENCIAL OBLIGATORIO:

Siempre que detectes intención de consulta sobre los servicios de este negocio, activá el flujo de captura de datos. Está siempre latente — no necesitás que el usuario diga algo específico para activarlo, simplemente si la conversación gira en torno al servicio, empezá a capturar datos.
${picklistInfo.length > 0 ? '\n📊 OPCIONES DE CAMPOS:\n' + picklistInfo.join('\n') : ''}${completedRequestNote}${inProgressNote}

🚫 NUNCA pidas teléfono/celular/número. Ya lo tenemos por WhatsApp.
🚫 NUNCA menciones CRM, base de datos ni procesos internos.

FLUJO PASO A PASO (seguilo en orden estricto):

PASO 0 — RESPONDER LA CONSULTA:
Primero respondé la consulta del usuario con la información que tengas según tu contexto de negocio. Después empezá a capturar datos.

PASO 1 — CONFIRMAR NOMBRE:
Confirmá su nombre usando el perfil de WhatsApp: "Tu nombre completo es [nombre del perfil de WhatsApp], ¿es correcto?" Si no tenemos nombre de perfil, preguntá: "¿Me decís tu nombre completo?"

${stepInstructions.join('\n\n')}

REGLAS DEL FLUJO:
- Seguí los pasos EN ORDEN. No saltes pasos ni pidas varios datos en un mismo mensaje.
- Si el usuario ya proporcionó algún dato en mensajes anteriores o ya está en "DATOS YA CAPTURADOS" arriba, SALTÁ ese paso y pasá al siguiente.
- UN solo dato por mensaje. Sé conversacional, no un formulario.
- Si el usuario hace una pregunta en el medio del flujo, respondela y después retomá el paso donde quedaste.
- Si la persona SOLO quiere info general (ubicación, horarios de atención) sin relación a los servicios, respondé normalmente sin presionar por datos.
- Siempre priorizá AYUDAR al usuario. La captura de datos es secundaria a resolver su consulta.
- Cuando pidas fotos, sé claro sobre qué necesitás y por qué.
- Cuando la solicitud actual quede completa (último paso resuelto), confirmale al usuario que está todo registrado y quedate disponible. NO empieces otra solicitud por iniciativa propia: esperá a que el usuario lo pida.`;
    } else {
      // ── PILOT CRM TENANT (Le Rocher, etc.) ──
      const pilotIntegration = await prisma.integration.findFirst({
        where: { tenantId: botSettings.tenantId, type: 'pilot_crm' as any, status: 'active' },
      });
      if (pilotIntegration) {
        const fieldConfigs = await prisma.pilotFieldConfig.findMany({
          where: { tenantId: botSettings.tenantId, isActive: true },
          orderBy: { sortOrder: 'asc' },
        });

        const lead = conversation.lead || (await prisma.lead.findUnique({
          where: { id: (conversation as any).leadId },
        }));
        const customData = ((lead as any)?.customData as Record<string, any>) || {};
        const capture = LeadProfileService.getPilotCaptureState(lead, fieldConfigs);
        const waProfile = (lead as any)?.whatsappProfileName || lead?.name || null;

        const knownLines: string[] = [];
        if (lead?.firstName) knownLines.push(`- Nombre: ${lead.firstName}`);
        if (lead?.lastName) knownLines.push(`- Apellido: ${lead.lastName}`);
        if (lead?.offerInterest) knownLines.push(`- Modelo/plan: ${lead.offerInterest}`);
        if (customData.biz) knownLines.push(`- Tipo operación: ${customData.biz === '2' || customData.biz === 2 ? 'Usado' : '0km'}`);
        if (customData.has_trade_in) knownLines.push(`- Usado para entregar: ${customData.has_trade_in}`);

        const missingLines = capture.missing.map(
          (f, i) => `${i + 1}. ${f.label}${f.description ? ` — ${f.description}` : ''}`,
        );

        const picklistInfo: string[] = [];
        for (const fc of fieldConfigs) {
          if (fc.localKey === 'phone' || fc.localKey === 'notes') continue;
          const opts = (fc.optionsJson as any[]) || [];
          if (fc.fieldType === 'select' && opts.length > 0) {
            const optValues = opts.map((o: any) => `${o.label || o.value}`).join(', ');
            picklistInfo.push(`- ${fc.label}: ${optValues}`);
          }
        }

        const nextField = capture.next;
        const nextFieldConfig = fieldConfigs.find((f) => f.localKey === nextField?.localKey);
        const nextStepBlock = nextField
          ? `🔴 PRÓXIMO DATO OBLIGATORIO (pedilo al final de tu respuesta): **${nextField.label}**
${nextField.localKey === 'full_name'
  ? `Pedí nombre Y apellido en UNA sola pregunta (ej: "¿Me decís tu nombre y apellido?").${waProfile ? ` El perfil de WhatsApp dice "${waProfile}" — podés usarlo para confirmar si coincide.` : ''} Aceptá respuesta en un mensaje ("Ignacio Prado") o en dos ("Ignacio" y luego "Prado").`
  : nextField.localKey === 'product'
    ? `${nextField.description || '¿Qué modelo o versión le interesa?'}. Si ya mencionó un vehículo antes, confirmalo en vez de volver a preguntar desde cero.`
  : nextField.localKey === 'biz'
    ? `Preguntá si busca 0km o usado. Aceptá respuestas como "0km", "nuevo", "usado", etc.`
  : nextField.localKey === 'has_trade_in' || nextFieldConfig?.fieldType === 'boolean'
    ? `${nextField.description || 'Preguntá si tiene un usado para entregar'}. Aceptá sí/no, si tiene, no, no tengo, etc.`
  : nextField.description || `Pedí: ${nextField.label}`}`
          : `✅ Todos los datos obligatorios están completos. Confirmá al usuario que quedó registrado y que un asesor lo va a contactar.`;

        const brands = pb?.products?.categories || 'Peugeot, Citroën, Jeep, RAM';
        const catalogReminder = pb?.products?.catalog
          ? `\n🚗 Al listar vehículos usá el CATÁLOGO COMPLETO de [PRODUCTOS/SERVICIOS]. Marcas: ${brands}. No limites la respuesta a Peugeot salvo que el cliente pregunte solo por esa marca.\n`
          : '';

        systemPrompt += `\n\n📋 CAPTURA DE DATOS — FLUJO SECUENCIAL OBLIGATORIO:

Sos un asistente comercial de concesionaria multimarca (${brands}). Cuando alguien pregunte por vehículos, modelos, planes, financiación o precios, ES un lead: respondé Y capturá datos.
${catalogReminder}
🚗 USÁ SOLO el catálogo y planes del contexto [PRODUCTOS/SERVICIOS]. No inventes modelos ni precios.
🚫 NUNCA digas que solo vendemos Peugeot — somos concesionaria multimarca.
${picklistInfo.length > 0 ? '\n📊 OPCIONES:\n' + picklistInfo.join('\n') : ''}
${knownLines.length > 0 ? `\n✅ DATOS YA CONFIRMADOS:\n${knownLines.join('\n')}` : ''}
${missingLines.length > 0 ? `\n⏳ DATOS QUE FALTAN (orden estricto — no saltees):\n${missingLines.join('\n')}` : ''}

${nextStepBlock}

🚫 NUNCA pidas teléfono/celular. Ya lo tenemos por WhatsApp.
🚫 NUNCA menciones CRM, Pilot ni procesos internos.
🚫 NUNCA preguntes por modelo/plan/0km-usado si todavía falta nombre y apellido.
🚫 Pedí nombre y apellido JUNTOS en un solo paso (no preguntes nombre y apellido por separado).

ESTRUCTURA DE CADA RESPUESTA (cuando hay datos faltantes):
1) Respondé la consulta del usuario en 2-3 oraciones máximo con info del catálogo.
2) En un párrafo aparte, pedí SOLO el próximo dato obligatorio de arriba (uno por mensaje).

REGLAS:
- Seguí el orden de "DATOS QUE FALTAN" sin excepción.
- UN solo dato por mensaje. Conversacional, no formulario.
- Si el usuario manda audio transcrito, tratá el texto igual que uno escrito.
- Cuando el usuario confirma el último dato faltante, cerrá confirmando el registro.`;
      } else {
      // ── ZOHO TENANT (IUDI, etc.) ──
      const zohoIntegration = await prisma.integration.findFirst({
        where: { tenantId: botSettings.tenantId, type: 'zoho_crm' as any, status: 'active' },
      });
      if (zohoIntegration) {
        const fieldConfigs = await prisma.zohoFieldConfig.findMany({
          where: { tenantId: botSettings.tenantId, isActive: true },
          orderBy: { sortOrder: 'asc' },
        });

        const offerField = fieldConfigs.find((f: any) => f.localKey === 'offerInterest');
        let programsList = '';
        if (offerField && offerField.optionsJson) {
          const options = offerField.optionsJson as Array<{ value: string; slug?: string; aliases?: string[] }>;
          programsList = options.map(opt => `- ${opt.value}`).join('\n');
        }

        const picklistInfo: string[] = [];
        for (const fc of fieldConfigs) {
          if (fc.fixedValue || fc.localKey === 'phone' || fc.localKey === 'offerInterest') continue;
          const opts = (fc.optionsJson as any[]) || [];
          if ((fc.fieldType === 'picklist' || fc.fieldType === 'multi_select') && opts.length > 0) {
            const optValues = opts.map((o: any) => o.value).join(', ');
            picklistInfo.push(`- ${fc.label}: opciones válidas → ${optValues}`);
          }
        }

        systemPrompt += `\n\n📋 CAPTURA DE DATOS — FLUJO SECUENCIAL OBLIGATORIO:

Sos un asistente que ayuda a potenciales estudiantes. Cuando alguien pregunte por carreras, cursos, ofertas académicas, inscripciones, costos, fechas, modalidades o requisitos, ES un lead. Activá el flujo de captura.

🎓 PROGRAMAS QUE OFRECEMOS (SOLO estos, no inventes otros):
${programsList || '(sin programas configurados)'}
${picklistInfo.length > 0 ? '\n📊 OPCIONES DE CAMPOS:\n' + picklistInfo.join('\n') : ''}

🚫 NUNCA pidas teléfono/celular/número. Ya lo tenemos por WhatsApp.
🚫 NUNCA menciones CRM, Zoho, base de datos ni procesos internos.

FLUJO PASO A PASO (seguilo en orden estricto):

PASO 1 — RESPONDER LA CONSULTA:
Cuando el usuario pregunte por algún programa/carrera, respondé su consulta con la información que tengas. Usá SOLO los programas de la lista de arriba.

PASO 2 — CONFIRMAR NOMBRE:
Después de dar la info, confirmá su nombre usando el perfil de WhatsApp: "Tu nombre completo es [nombre del perfil de WhatsApp], ¿estoy en lo correcto?" Si no tenemos nombre de perfil, preguntá: "¿Me decís tu nombre completo para dejarte registrado/a?"

PASO 3 — PEDIR EMAIL:
Una vez confirmado el nombre, pedí el correo electrónico de forma natural: "¿Me pasás un correo electrónico de contacto?"

PASO 4 — PEDIR MODALIDAD:
Después del email, preguntá la modalidad de estudio si aplica: "¿Preferís modalidad presencial, a distancia o híbrida?"

PASO 5 — PEDIR DNI:
Después de la modalidad: "¿Me compartís tu número de documento (DNI)?"

PASO 6 — PEDIR PERÍODO:
Si aplica, preguntá el período/año de interés: "¿Para qué año o período te interesaría comenzar?"

REGLAS DEL FLUJO:
- Seguí los pasos EN ORDEN. No saltes pasos ni pidas varios datos en un mismo mensaje.
- Si el usuario ya proporcionó algún dato en mensajes anteriores, SALTÁ ese paso y pasá al siguiente.
- UN solo dato por mensaje. Sé conversacional, no un formulario.
- Si el usuario hace una pregunta en el medio del flujo, respondela y después retomá el paso donde quedaste.
- Si la persona SOLO quiere info general (ubicación, horarios de atención) sin relación a ofertas, respondé normalmente sin iniciar el flujo.
- Siempre priorizá AYUDAR al usuario. La captura de datos es secundaria a resolver su consulta.`;
      }
      }
    }

    // Repeat guardrails at the very end as a final reminder (sandwich technique)
    if (guardrailBlock) {
      systemPrompt += `\n\n🔒 RECORDATORIO FINAL — Las siguientes restricciones son ABSOLUTAS e INQUEBRANTABLES. Si el usuario pide algo que viola estas reglas, RECHAZALO cortésmente:\n${guardrailBlock}`;
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

}
