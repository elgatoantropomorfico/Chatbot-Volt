import OpenAI from 'openai';
import { env } from '../config/env';
import { prisma } from '../config/database';
import { BookingAiService } from './booking-ai.service';
import { BookingContextService } from './booking-context.service';
import { BookingToolExecutor, type ToolExecutionContext } from './booking-tool-executor.service';
import { BOOKING_AGENT_TOOLS, toolCatalogText } from './booking-tool-definitions';
import type { AgentRunResult, BookingConversationContext, ToolCallRecord } from './booking-agent.types';

const MAX_ITERATIONS = 8;

export class BookingAgentService {
  private static openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

  static async run(params: {
    tenantId: string;
    conversationId: string;
    leadId: string;
    phone: string;
    text: string;
    profileName?: string | null;
    ctx: BookingConversationContext;
    settings: any;
  }): Promise<{ reply: string; ctx: BookingConversationContext; runMeta: AgentRunResult }> {
    if (!this.openai) {
      return {
        reply: 'Por el momento no puedo procesar reservas automáticas. Escribí *humano* y te ayuda alguien del equipo.',
        ctx: params.ctx,
        runMeta: { reply: '', toolCalls: [], iterations: 0 },
      };
    }

    const exec: ToolExecutionContext = {
      tenantId: params.tenantId,
      conversationId: params.conversationId,
      leadId: params.leadId,
      phone: params.phone,
      settings: params.settings,
    };

    let ctx = params.ctx;
    const toolCalls: ToolCallRecord[] = [];
    const history = await this.loadHistory(params.conversationId, 12);
    const systemPrompt = await this.buildSystemPrompt(params.tenantId, params.settings, ctx, params.profileName);

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: params.text },
    ];

    let reply = '';
    let iterations = 0;

    for (iterations = 0; iterations < MAX_ITERATIONS; iterations++) {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.35,
        max_tokens: 500,
        messages,
        tools: BOOKING_AGENT_TOOLS,
        tool_choice: 'auto',
      });

      const choice = completion.choices[0]?.message;
      if (!choice) break;

      if (choice.tool_calls?.length) {
        messages.push(choice);
        // Orden estable: confirmar servicio antes de buscar slots (evita que confirm limpie la búsqueda)
        const ordered = [...choice.tool_calls].sort((a, b) => {
          const rank = (name: string) => {
            if (name === 'confirm_service') return 0;
            if (name === 'match_service' || name === 'list_services') return 1;
            if (name.startsWith('find_') || name.startsWith('get_')) return 2;
            return 3;
          };
          const an = a.type === 'function' ? a.function.name : '';
          const bn = b.type === 'function' ? b.function.name : '';
          return rank(an) - rank(bn);
        });
        for (const tc of ordered) {
          if (tc.type !== 'function') continue;
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.function.arguments || '{}');
          } catch {
            args = {};
          }
          const started = Date.now();
          const { result, ctx: nextCtx } = await BookingToolExecutor.execute(
            tc.function.name,
            args,
            ctx,
            exec,
          );
          ctx = nextCtx;
          toolCalls.push({
            name: tc.function.name,
            args,
            resultSummary: result.ok
              ? JSON.stringify(result.data || {}).slice(0, 120)
              : `error:${result.error}`,
            ms: Date.now() - started,
          });
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(result),
          });
        }
        continue;
      }

      reply = choice.content?.trim() || '';
      break;
    }

    if (!reply) {
      reply = 'Contame un poco más y te ayudo con la reserva 🌿';
    }

    if (toolCalls.length > 0) {
      console.log('📅 Agent turn:', JSON.stringify({
        conversationId: params.conversationId,
        iterations: iterations + 1,
        tools: toolCalls,
        botReply: reply.slice(0, 200),
      }));
    }

    return {
      reply,
      ctx,
      runMeta: { reply, toolCalls, iterations: iterations + 1 },
    };
  }

  private static async loadHistory(conversationId: string, limit: number) {
    const rows = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { direction: true, text: true },
    });
    return rows.reverse().map((m) => ({
      role: (m.direction === 'in' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.text,
    }));
  }

  private static async buildSystemPrompt(
    tenantId: string,
    settings: any,
    ctx: BookingConversationContext,
    profileName?: string | null,
  ): Promise<string> {
    const context = await BookingAiService.buildContext(tenantId, settings);
    const tz = settings.timezone || 'America/Argentina/Cordoba';
    const today = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'long', timeZone: tz });

    const contactHint = profileName
      ? `\nQuien escribe se llama ${profileName} en WhatsApp; no es identidad confirmada hasta set_customer_name.`
      : '';

    return `Sos la asistente de turnos de un spa/masajes en Argentina por WhatsApp.
Hoy: ${today} (${tz}).

Tu trabajo: ayudar a reservar, consultar precios y cancelar turnos. Hablá natural, cálido y breve en español argentino.
${contactHint}

ESTADO (borrador editable — las herramientas lo modifican):
\`\`\`json
${JSON.stringify(ctx.agentState, null, 2)}
\`\`\`

HERRAMIENTAS (usá como una recepcionista — no inventes horarios ni precios):
${toolCatalogText()}

FLUJO DE HORARIOS (disponibilidad primero — estilo Calendly/grandes apps):
1. Menú principal: Ayudame a elegir / Ya sé cuál quiero / Ver precios — el SISTEMA lo resuelve (recomendador o lista). No inventes catálogo largo si el usuario tocó esas opciones.
2. Con servicio confirmado, NO preguntes "¿para cuándo?". Llamá find_available_slots(mode=ASAP, limit=2).
2. El sistema muestra 2 horarios reales + "Ver más horarios". Tu mensaje: una frase corta de intro; no listes de nuevo todos los slots.
3. Si elige un horario → confirm_slot con date/time de listedSlots.
4. "Ver más" / menú Esta semana / Semana próxima / Elegir fecha / elegir día o slot de botones: el SISTEMA lo resuelve solo. No rearmes esos menús ni vuelvas a listar opciones.
5. Si browsePhase=awaiting_date: pedí SOLO la fecha (no llames ASAP ni re-muestres el menú de rangos).
6. Si pide "otros horarios" en texto libre → find_available_slots(exclude_shown=true).
7. Si fecha exacta sin cupo, la tool ya trae fallback cercano: presentalo.

INTEGRIDAD:
- NUNCA menciones fecha/hora concreta sin haber llamado find_available_slots / get_available_days / get_slots_for_day en ESTE intercambio.
- show_price_info es solo texto de precios/promos; NO lista horarios.
- Antes de initiate_checkout: servicio confirmado, horario confirmado, nombre confirmado, notas pedidas (o skip).
- initiate_checkout es el único camino al pago; no simules links de Mercado Pago.
- NUNCA digas que el turno está "confirmado" antes del pago/seña. Hasta entonces está pre-reservado / anotado.
- Cancelar: list_my_appointments → request_cancel_appointment (NUNCA cancel_appointment directo). El sistema pide Sí/No.
- Si confirm_slot o initiate_checkout reportan horario ocupado, presentá las alternativas sin inventar.
- menu / empezar de nuevo → reset_booking.
- Si el usuario ya dijo servicio+fecha+franja en un mensaje, completá todo (match_service + confirm_service + find_available_slots con date_query/daypart) sin repetir preguntas.

CONTEXTO DEL NEGOCIO:
${context}`;
  }
}
