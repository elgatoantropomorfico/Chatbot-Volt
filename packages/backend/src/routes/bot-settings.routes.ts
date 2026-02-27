import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import OpenAI from 'openai';
import { prisma } from '../config/database';
import { requireRole } from '../middleware/roles';
import { env } from '../config/env';

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const updateBotSettingsSchema = z.object({
  systemPrompt: z.string().optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxContextMessages: z.number().min(1).max(50).optional(),
  handoffEnabled: z.boolean().optional(),
  handoffPhoneE164: z.string().nullable().optional(),
  handoffMessageTemplate: z.string().nullable().optional(),
  handoffWaMeTemplate: z.string().nullable().optional(),
  handoffTriggersJson: z.any().optional(),
  guardrailsJson: z.any().optional(),
  promptBuilderJson: z.any().optional(),
});

export async function botSettingsRoutes(app: FastifyInstance) {
  // Get bot settings for tenant
  app.get('/:tenantId', async (request: FastifyRequest<{ Params: { tenantId: string } }>, reply: FastifyReply) => {
    const user = request.user;
    const { tenantId } = request.params;

    if (user.role !== 'superadmin' && user.tenantId !== tenantId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const settings = await prisma.botSettings.findUnique({ where: { tenantId } });
    if (!settings) return reply.status(404).send({ error: 'Bot settings not found' });
    return reply.send({ settings });
  });

  // Update bot settings
  app.patch('/:tenantId', {
    preHandler: [requireRole('superadmin', 'tenant_admin')],
  }, async (request: FastifyRequest<{ Params: { tenantId: string } }>, reply: FastifyReply) => {
    const user = request.user;
    const { tenantId } = request.params;

    if (user.role === 'tenant_admin' && user.tenantId !== tenantId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const body = updateBotSettingsSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'Validation failed', details: body.error.flatten() });
    }

    const settings = await prisma.botSettings.upsert({
      where: { tenantId },
      update: body.data,
      create: { tenantId, ...body.data },
    });

    return reply.send({ settings });
  });

  // Generate field content with AI
  const generateFieldSchema = z.object({
    section: z.string(),
    field: z.string(),
    currentValue: z.string().optional(),
    promptBuilderJson: z.any(),
  });

  app.post('/:tenantId/generate-field', {
    preHandler: [requireRole('superadmin', 'tenant_admin')],
  }, async (request: FastifyRequest<{ Params: { tenantId: string } }>, reply: FastifyReply) => {
    const user = request.user;
    const { tenantId } = request.params;

    if (user.role === 'tenant_admin' && user.tenantId !== tenantId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const body = generateFieldSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'Validation failed', details: body.error.flatten() });
    }

    const { section, field, currentValue, promptBuilderJson } = body.data;
    const pb = promptBuilderJson || {};

    // Build context summary from all filled sections
    const contextParts: string[] = [];
    if (pb.business?.name) contextParts.push(`Negocio: ${pb.business.name}`);
    if (pb.business?.industry) contextParts.push(`Rubro: ${pb.business.industry}`);
    if (pb.business?.description) contextParts.push(`Descripción: ${pb.business.description}`);
    if (pb.business?.tone) contextParts.push(`Tono: ${pb.business.tone}`);
    if (pb.location?.city) contextParts.push(`Ciudad: ${pb.location.city}`);
    if (pb.location?.province) contextParts.push(`Provincia: ${pb.location.province}`);
    if (pb.location?.country) contextParts.push(`País: ${pb.location.country}`);
    if (pb.location?.address) contextParts.push(`Dirección: ${pb.location.address}`);
    if (pb.location?.type) contextParts.push(`Tipo de lugar: ${pb.location.type}`);
    if (pb.hours?.schedule) contextParts.push(`Horarios: ${pb.hours.schedule}`);
    if (pb.contact?.phone) contextParts.push(`Teléfono: ${pb.contact.phone}`);
    if (pb.contact?.email) contextParts.push(`Email: ${pb.contact.email}`);
    if (pb.contact?.website) contextParts.push(`Web: ${pb.contact.website}`);
    if (pb.products?.description) contextParts.push(`Productos: ${pb.products.description}`);
    if (pb.products?.categories) contextParts.push(`Categorías: ${pb.products.categories}`);
    if (pb.products?.priceRange) contextParts.push(`Rango de precios: ${pb.products.priceRange}`);
    if (pb.shipping?.methods) contextParts.push(`Envíos: ${pb.shipping.methods}`);
    if (pb.shipping?.paymentMethods) contextParts.push(`Medios de pago: ${pb.shipping.paymentMethods}`);
    if (pb.promotions?.active) contextParts.push(`Promociones: ${pb.promotions.active}`);
    if (pb.policies?.returns) contextParts.push(`Devoluciones: ${pb.policies.returns}`);
    if (pb.personality?.style) contextParts.push(`Estilo: ${pb.personality.style}`);
    if (pb.personality?.language) contextParts.push(`Idioma: ${pb.personality.language}`);

    if (contextParts.length === 0) {
      return reply.status(400).send({ error: 'Necesitás completar al menos algunos campos del negocio (nombre, rubro, descripción) para que la IA pueda generar contenido.' });
    }

    const contextSummary = contextParts.join('\n');

    // Field-specific instructions
    const fieldInstructions: Record<string, Record<string, string>> = {
      business: {
        description: 'Generá una descripción profesional y concisa del negocio (2-3 oraciones) para que un chatbot use como contexto.',
        tone: 'Sugerí el tono de comunicación más adecuado para este tipo de negocio.',
      },
      location: {
        notes: 'Generá notas útiles sobre la ubicación del negocio que un chatbot podría comunicar a clientes (referencias, cómo llegar, etc.).',
      },
      hours: {
        schedule: 'Generá un horario de atención típico y bien formateado para este tipo de negocio. Usá formato:\nLunes a Viernes: HH:MM - HH:MM\nSábados: HH:MM - HH:MM\nDomingos: Cerrado',
        holidays: 'Sugerí una política de feriados adecuada para este tipo de negocio.',
        notes: 'Generá una nota breve sobre horarios que podría ser útil para los clientes.',
      },
      contact: {},
      products: {
        description: 'Generá una descripción general de los productos/servicios que ofrece este negocio (2-3 oraciones).',
        categories: 'Sugerí categorías principales de productos/servicios para este tipo de negocio, separadas por coma.',
        priceRange: 'Sugerí un rango de precios razonable para este tipo de negocio.',
        notes: 'Generá una nota útil sobre los productos/servicios.',
      },
      shipping: {
        methods: 'Sugerí métodos de envío apropiados para este tipo de negocio.',
        zones: 'Sugerí zonas de cobertura de envío razonables.',
        costs: 'Sugerí una estructura de costos de envío razonable.',
        paymentMethods: 'Sugerí medios de pago apropiados para este tipo de negocio en Argentina.',
        notes: 'Generá una nota breve sobre envíos.',
      },
      promotions: {
        active: 'Sugerí 2-3 promociones atractivas y realistas para este tipo de negocio.',
        conditions: 'Sugerí condiciones típicas para las promociones.',
      },
      policies: {
        returns: 'Generá una política de devoluciones profesional y clara para este tipo de negocio (2-3 oraciones).',
        exchanges: 'Generá una política de cambios profesional y clara.',
        warranty: 'Sugerí una política de garantía razonable.',
        notes: 'Generá una nota breve sobre políticas.',
      },
      personality: {
        greeting: 'Generá un saludo inicial atractivo y acorde al tono del negocio para el chatbot.',
        farewell: 'Generá una despedida cálida y acorde al tono del negocio.',
        style: 'Describí el estilo de respuesta ideal para el chatbot de este negocio (longitud, emojis, trato, etc.).',
        restrictions: 'Sugerí restricciones importantes que el chatbot debe respetar para este tipo de negocio.',
        language: 'Indicá el idioma y variante regional más adecuada.',
      },
    };

    const specificInstruction = fieldInstructions[section]?.[field] || `Generá contenido apropiado para el campo "${field}" de la sección "${section}".`;

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content: `Sos un asistente que ayuda a configurar un chatbot para negocios. Tu tarea es generar contenido para un campo específico de la configuración, basándote en el contexto existente del negocio.

Reglas:
- Respondé SOLO con el contenido del campo, sin explicaciones ni encabezados.
- Usá español argentino.
- Sé conciso y profesional.
- Basate en la información que ya existe del negocio.
- Si el campo ya tiene contenido, mejoralo o completalo.`,
          },
          {
            role: 'user',
            content: `Contexto del negocio:\n${contextSummary}\n\n${currentValue ? `Contenido actual del campo: "${currentValue}"\nMejorá o completá este contenido.\n\n` : ''}Instrucción: ${specificInstruction}`,
          },
        ],
        max_tokens: 512,
      });

      const generated = completion.choices[0]?.message?.content?.trim() || '';
      return reply.send({ generated });
    } catch (err: any) {
      console.error('AI generate field error:', err.message);
      return reply.status(500).send({ error: 'Error al generar contenido con IA' });
    }
  });
}
