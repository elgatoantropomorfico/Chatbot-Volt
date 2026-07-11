import { prisma } from '../config/database';
import { BookingAvailabilityService } from './booking-availability.service';
import { BookingPricingService } from './booking-pricing.service';
import { BookingContextService } from './booking-context.service';
import {
  filterSlotsByQuery,
} from './booking-datetime.service';
import { formatServicePreviewBody, matchServiceFromText } from './booking-flow-nav.service';
import type { BookingConversationContext } from './booking-agent.types';
import { emptyAgentState } from './booking-agent.types';

export interface ToolExecutionContext {
  tenantId: string;
  conversationId: string;
  leadId: string;
  phone: string;
  settings: any;
}

export interface ToolResult {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: string;
  contextPatch?: Partial<BookingConversationContext>;
}

export class BookingToolExecutor {
  static async execute(
    name: string,
    args: Record<string, unknown>,
    ctx: BookingConversationContext,
    exec: ToolExecutionContext,
  ): Promise<{ result: ToolResult; ctx: BookingConversationContext }> {
    const started = Date.now();
    let result: ToolResult;

    try {
      switch (name) {
        case 'list_services':
          result = await this.listServices(exec);
          break;
        case 'match_service':
          result = await this.matchService(exec, String(args.query || ''));
          break;
        case 'show_price_info':
          result = await this.showPriceInfo(exec, ctx, args.service_id as string | undefined);
          break;
        case 'find_available_slots':
          result = await this.findAvailableSlots(exec, ctx, args);
          break;
        case 'confirm_service':
          result = this.confirmService(ctx, args);
          break;
        case 'confirm_slot':
          result = this.confirmSlot(ctx, args);
          break;
        case 'set_customer_name':
          result = await this.setCustomerName(ctx, exec, String(args.full_name || ''));
          break;
        case 'set_customer_notes':
          result = this.setCustomerNotes(ctx, args);
          break;
        case 'initiate_checkout':
          result = await this.initiateCheckout(ctx, exec);
          break;
        case 'list_my_appointments':
          result = await this.listMyAppointments(exec);
          break;
        case 'cancel_appointment':
          result = await this.cancelAppointment(exec, String(args.appointment_id || ''));
          break;
        case 'reset_booking':
          result = this.resetBooking();
          break;
        default:
          result = { ok: false, error: `Herramienta desconocida: ${name}` };
      }
    } catch (err: any) {
      result = { ok: false, error: err.message || 'Error ejecutando herramienta' };
    }

    let nextCtx = ctx;
    if (result.contextPatch) {
      nextCtx = {
        ...ctx,
        ...result.contextPatch,
        agentState: result.contextPatch.agentState
          ? { ...ctx.agentState, ...result.contextPatch.agentState }
          : ctx.agentState,
      };
      await BookingContextService.save(exec.conversationId, nextCtx);
    }

    result.data = { ...(result.data || {}), ms: Date.now() - started };
    return { result, ctx: nextCtx };
  }

  private static async listServices(exec: ToolExecutionContext): Promise<ToolResult> {
    const services = await prisma.bookingService.findMany({
      where: { tenantId: exec.tenantId, isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, shortDescription: true, serviceType: true },
    });
    return {
      ok: true,
      data: {
        services: services.map((s) => ({
          id: s.id,
          name: s.name,
          type: s.serviceType,
          short: s.shortDescription,
        })),
      },
    };
  }

  private static async matchService(exec: ToolExecutionContext, query: string): Promise<ToolResult> {
    const services = await prisma.bookingService.findMany({
      where: { tenantId: exec.tenantId, isActive: true },
      select: {
        id: true, name: true, shortDescription: true, longDescription: true, serviceType: true,
      },
    });
    const match = matchServiceFromText(query, services);
    if (!match) return { ok: true, data: { matched: false } };
    const svc = services.find((s) => s.id === match.id);
    return {
      ok: true,
      data: {
        matched: true,
        service: {
          id: match.id,
          name: match.name,
          preview: svc ? formatServicePreviewBody(svc, match.name) : match.name,
        },
      },
    };
  }

  private static async showPriceInfo(
    exec: ToolExecutionContext,
    ctx: BookingConversationContext,
    serviceId?: string,
  ): Promise<ToolResult> {
    const settings = exec.settings;
    const basePrice = settings.basePrice ? Number(settings.basePrice) : null;
    const depositPct = settings.depositPercentage || 50;
    const promoBlock = await BookingPricingService.formatActivePromosSummary(exec.tenantId, basePrice);

    let serviceLine = '';
    const sid = serviceId || ctx.agentState.service?.id;
    if (sid) {
      const pricing = await BookingPricingService.resolvePrice(exec.tenantId, sid);
      serviceLine = `Precio del camino elegido: $${pricing.finalPrice.toLocaleString('es-AR')} ARS`;
      if (pricing.discountLabel) serviceLine += ` (${pricing.discountLabel})`;
    } else if (basePrice) {
      serviceLine = `Precio base de sesión: $${basePrice.toLocaleString('es-AR')} ARS`;
    }

    const lines = [
      serviceLine || 'Consultá el precio al confirmar el camino.',
      `Seña para reservar: ${depositPct}% del valor de la sesión.`,
      promoBlock,
    ].filter(Boolean);

    return {
      ok: true,
      data: { text: lines.join('\n\n') },
      contextPatch: {
        agentState: { ...ctx.agentState, pricePreviewShown: true, mode: 'booking' },
      },
    };
  }

  private static async findAvailableSlots(
    exec: ToolExecutionContext,
    ctx: BookingConversationContext,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    const serviceId = (args.service_id as string) || ctx.agentState.service?.id;
    const limit = Math.min(Number(args.limit) || 5, 10);
    const dateQuery = (args.date_query as string) || '';

    let slots = await BookingAvailabilityService.getAvailableSlots(exec.tenantId, {
      limit: 40,
      serviceId,
    });

    let filtered = slots.map((s) => ({ date: s.date, time: s.time, label: s.label }));
    if (dateQuery) {
      filtered = filterSlotsByQuery(
        dateQuery,
        exec.settings.timezone || 'America/Argentina/Cordoba',
        filtered,
      );
    }

    const picked = filtered.slice(0, limit);

    return {
      ok: true,
      data: { found: picked.length > 0, slots: picked },
      contextPatch: {
        agentState: {
          ...ctx.agentState,
          mode: 'booking',
          listedSlots: picked,
          offeredSlot: picked[0]
            ? { ...picked[0], confirmed: false }
            : ctx.agentState.offeredSlot,
        },
      },
    };
  }

  private static confirmService(ctx: BookingConversationContext, args: Record<string, unknown>): ToolResult {
    const serviceId = String(args.service_id || '');
    const serviceName = String(args.service_name || '');
    if (!serviceId || !serviceName) {
      return { ok: false, error: 'service_id y service_name requeridos' };
    }
    return {
      ok: true,
      data: { confirmed: true, service: { id: serviceId, name: serviceName } },
      contextPatch: {
        agentState: {
          ...ctx.agentState,
          mode: 'booking',
          service: { id: serviceId, name: serviceName, confirmed: true },
        },
      },
    };
  }

  private static confirmSlot(ctx: BookingConversationContext, args: Record<string, unknown>): ToolResult {
    const date = String(args.date || '');
    const time = String(args.time || '');
    const label = String(args.label || `${date} — ${time}`);
    if (!date || !time) return { ok: false, error: 'date y time requeridos' };

    const listed = ctx.agentState.listedSlots;
    const fromList = listed.find((s) => s.date === date && s.time === time);

    return {
      ok: true,
      data: { confirmed: true, slot: { date, time, label: fromList?.label || label } },
      contextPatch: {
        agentState: {
          ...ctx.agentState,
          mode: 'booking',
          offeredSlot: {
            date,
            time,
            label: fromList?.label || label,
            confirmed: true,
          },
        },
      },
    };
  }

  private static async setCustomerName(
    ctx: BookingConversationContext,
    exec: ToolExecutionContext,
    fullName: string,
  ): Promise<ToolResult> {
    const name = fullName.trim();
    if (name.length < 3) return { ok: false, error: 'Nombre demasiado corto' };
    try {
      await prisma.lead.update({ where: { id: exec.leadId }, data: { name } });
    } catch (err: any) {
      console.warn('⚠️ No se pudo actualizar nombre del lead:', err.message);
    }
    return {
      ok: true,
      data: { fullName: name },
      contextPatch: {
        agentState: {
          ...ctx.agentState,
          mode: 'booking',
          customer: {
            fullName: name,
            nameConfirmed: true,
            notesCollected: ctx.agentState.customer?.notesCollected,
            notes: ctx.agentState.customer?.notes,
          },
        },
      },
    };
  }

  private static setCustomerNotes(ctx: BookingConversationContext, args: Record<string, unknown>): ToolResult {
    const skip = !!args.skip;
    const notes = skip ? null : (args.notes ? String(args.notes).trim() : null);
    if (!skip && !notes) return { ok: false, error: 'Indicá notes o skip=true' };

    return {
      ok: true,
      data: { notes, skipped: skip },
      contextPatch: {
        agentState: {
          ...ctx.agentState,
          mode: 'booking',
          customer: {
            fullName: ctx.agentState.customer?.fullName || '',
            nameConfirmed: ctx.agentState.customer?.nameConfirmed ?? false,
            notes,
            notesCollected: true,
          },
        },
      },
    };
  }

  private static async initiateCheckout(
    ctx: BookingConversationContext,
    exec: ToolExecutionContext,
  ): Promise<ToolResult> {
    const { service, offeredSlot, customer } = ctx.agentState;
    if (!service?.confirmed) return { ok: false, error: 'Servicio no confirmado' };
    if (!offeredSlot?.confirmed) return { ok: false, error: 'Horario no confirmado' };
    if (!customer?.nameConfirmed || !customer.fullName) {
      return { ok: false, error: 'Nombre del cliente no confirmado' };
    }
    if (!customer.notesCollected) {
      return { ok: false, error: 'Falta paso de notas (pedir o marcar que no hay)' };
    }

    const prior = await prisma.appointment.count({
      where: { leadId: exec.leadId, status: 'confirmado' },
    });

    const checkout = {
      phase: 'payment_choice' as const,
      serviceId: service.id,
      serviceName: service.name,
      slotDate: offeredSlot.date,
      slotTime: offeredSlot.time,
      slotLabel: offeredSlot.label,
      customerName: customer.fullName,
      customerNotes: customer.notes ?? null,
      isFirstTime: prior === 0,
    };

    return {
      ok: true,
      data: { checkout_started: true, phase: 'payment_choice' },
      contextPatch: {
        checkout,
        agentState: { ...ctx.agentState, mode: 'idle' },
      },
    };
  }

  private static async listMyAppointments(exec: ToolExecutionContext): Promise<ToolResult> {
    const apts = await prisma.appointment.findMany({
      where: {
        tenantId: exec.tenantId,
        leadId: exec.leadId,
        status: { in: ['confirmado', 'pendiente_pago', 'pendiente_datos'] },
      },
      include: { service: true },
      orderBy: { appointmentDate: 'asc' },
      take: 8,
    });

    const tz = exec.settings.timezone || 'America/Argentina/Cordoba';
    const items = apts.map((a) => {
      const dateStr = a.appointmentDate.toISOString().slice(0, 10);
      const label = a.appointmentDate.toLocaleDateString('es-AR', {
        weekday: 'short', day: '2-digit', month: '2-digit', timeZone: tz,
      });
      return {
        id: a.id,
        service: a.service.name,
        slot: `${label} — ${a.appointmentTime}`,
        status: a.status,
      };
    });

    return { ok: true, data: { appointments: items } };
  }

  private static async cancelAppointment(exec: ToolExecutionContext, appointmentId: string): Promise<ToolResult> {
    if (!exec.settings.cancelEnabled) {
      return { ok: false, error: 'Cancelación automática deshabilitada' };
    }
    const apt = await prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        tenantId: exec.tenantId,
        leadId: exec.leadId,
        status: { in: ['confirmado', 'pendiente_pago', 'pendiente_datos'] },
      },
      include: { service: true },
    });
    if (!apt) return { ok: false, error: 'Turno no encontrado o no cancelable' };

    await prisma.appointment.update({
      where: { id: apt.id },
      data: { status: 'cancelado', cancelledAt: new Date() },
    });

    return {
      ok: true,
      data: {
        cancelled: true,
        service: apt.service.name,
        appointment_id: apt.id,
      },
    };
  }

  private static resetBooking(): ToolResult {
    return {
      ok: true,
      data: { reset: true },
      contextPatch: {
        checkout: null,
        agentState: emptyAgentState({ greetingPending: false }),
      },
    };
  }
}
