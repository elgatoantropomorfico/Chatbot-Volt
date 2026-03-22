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
    // First fetch bot settings to get maxContextMessages
    const botSettings = await prisma.botSettings.findUnique({ where: { tenantId } });
    const maxMessages = botSettings?.maxContextMessages || 15;

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
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
        if (p.description) parts.push(p.description);
        if (p.categories) parts.push(`Categorías: ${p.categories}`);
        if (p.priceRange) parts.push(`Rango de precios: ${p.priceRange}`);
        if (p.notes) parts.push(`Notas: ${p.notes}`);
        if (parts.length) sections.push(`[PRODUCTOS/SERVICIOS]\n${parts.join('\n')}`);
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

    // Inject lead capture instructions for tenants with active Zoho CRM integration
    const zohoIntegration = await prisma.integration.findFirst({
      where: { tenantId: botSettings.tenantId, type: 'zoho_crm', status: 'active' },
    });
    if (zohoIntegration) {
      // Load available programs from ZohoFieldConfig
      const offerField = await prisma.zohoFieldConfig.findFirst({
        where: { tenantId: botSettings.tenantId, localKey: 'offerInterest', isActive: true },
      });
      
      let programsList = '';
      if (offerField && offerField.optionsJson) {
        const options = offerField.optionsJson as Array<{ value: string; slug?: string; aliases?: string[] }>;
        programsList = '\n\n🎓 PROGRAMAS DISPONIBLES:\n' + options.map(opt => {
          const aliases = opt.aliases && opt.aliases.length > 0 ? ` (también conocido como: ${opt.aliases.join(', ')})` : '';
          return `- ${opt.value}${aliases}`;
        }).join('\n');
      }

      systemPrompt += `\n\n📋 CAPTURA DE LEADS — INSTRUCCIONES IMPORTANTES:
Cualquier persona que pregunte por ofertas académicas, carreras, cursos, inscripciones, costos, fechas, modalidades, requisitos, o muestre el mínimo interés en estudiar, ES un lead potencial. Tratalo como tal desde el primer mensaje.
${programsList}

REGLAS CLAVE:
1. NUNCA preguntes el teléfono — ya lo tenemos por WhatsApp.
2. Sé proactivo: si alguien pregunta "qué carreras tienen?" o "cuánto sale?", YA es un lead. No esperes a que diga "quiero inscribirme".
3. Respondé su consulta PRIMERO mostrando SOLO los programas de la lista de arriba, y después de darle la info que pidió, preguntá su nombre de forma natural: "¿Me decís tu nombre así te dejo registrada la consulta?" o "¿Con quién tengo el gusto?".
4. Si ya sabés qué oferta le interesa, no preguntes de nuevo. Si no queda claro, preguntá: "¿Te interesa algún programa en particular?"
5. Los datos secundarios (email, DNI, modalidad, período) solo pedilos si surgen naturalmente o si la persona quiere avanzar con una inscripción formal. No presiones.
6. NUNCA menciones CRM, Zoho, sincronización, base de datos, ni procesos internos.
7. Si la persona SOLO quiere info general de la organización (ubicación, horarios de atención) sin relación a ofertas académicas, respondé normalmente sin presionar por datos.
8. IMPORTANTE: Solo ofrecé los programas que están en la lista de arriba. NO inventes carreras ni programas que no están listados.

FLUJO IDEAL:
- Usuario pregunta algo sobre ofertas/programas → respondé con la info de los programas reales → pedí nombre naturalmente
- Usuario dice su nombre → continuá ayudando, si no mencionó oferta específica preguntá cuál le interesa
- Una vez que tenés nombre + oferta de interés → seguí la conversación normalmente, completá otros datos solo si fluyen

Sé conversacional y cálido, nunca como un formulario. Tu prioridad es AYUDAR, y de paso capturar los datos.`;
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
