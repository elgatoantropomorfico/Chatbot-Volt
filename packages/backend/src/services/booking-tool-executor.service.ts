import { prisma } from '../config/database';
import { BookingAvailabilityService } from './booking-availability.service';
import { BookingPricingService } from './booking-pricing.service';
import { BookingContextService } from './booking-context.service';
import {
  filterSlotsByQuery,
  matchesDaypart,
  weekRangeInTz,
} from './booking-datetime.service';
import { formatServicePreviewBody, matchServiceFromText } from './booking-flow-nav.service';
import type {
  BookingConversationContext,
  DatePreference,
  Daypart,
} from './booking-agent.types';
import { emptyAgentState, slotKey } from './booking-agent.types';

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

const MORE_SLOTS_LABEL = 'Ver más horarios';
const MORE_MENU_OPTIONS = ['Esta semana', 'Semana próxima', 'Elegir fecha'];

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
        case 'show_slot_browse_menu':
          result = this.showSlotBrowseMenu(ctx);
          break;
        case 'get_available_days':
          result = await this.getAvailableDays(exec, ctx, args);
          break;
        case 'get_slots_for_day':
          result = await this.getSlotsForDay(exec, ctx, args);
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
        agentState: { ...ctx.agentState, pricePreviewShown: true, mode: 'booking', uiPresentation: null },
      },
    };
  }

  private static async findAvailableSlots(
    exec: ToolExecutionContext,
    ctx: BookingConversationContext,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    const serviceId = (args.service_id as string) || ctx.agentState.service?.id;
    const dateQuery = String(args.date_query || '');
    const modeArg = String(args.mode || '').toUpperCase();
    const rangeArg = String(args.range || '');
    const daypart = (String(args.daypart || 'ANY').toUpperCase() || 'ANY') as Daypart;
    const tz = exec.settings.timezone || 'America/Argentina/Cordoba';

    const hasShown = (ctx.agentState.shownSlotKeys?.length || 0) > 0;
    const excludeShown = args.exclude_shown !== undefined
      ? !!args.exclude_shown
      : hasShown;

    let mode: DatePreference['mode'] = 'ASAP';
    if (modeArg === 'RANGE' || modeArg === 'EXACT_DATE' || modeArg === 'ASAP') {
      mode = modeArg as DatePreference['mode'];
    } else if (rangeArg === 'this_week' || rangeArg === 'next_week') {
      mode = 'RANGE';
    } else if (dateQuery) {
      mode = 'EXACT_DATE';
    }

    const limitDefault = mode === 'ASAP' && !excludeShown ? 2 : 3;
    const limit = Math.min(Math.max(Number(args.limit) || limitDefault, 1), 5);

    let dateFrom: string | undefined;
    let dateTo: string | undefined;
    if (mode === 'RANGE') {
      const which = rangeArg === 'next_week' ? 'next' : 'this';
      const wr = weekRangeInTz(tz, which);
      dateFrom = wr.dateFrom;
      dateTo = wr.dateTo;
    }

    const slots = await BookingAvailabilityService.getAvailableSlots(exec.tenantId, {
      limit: 80,
      serviceId,
      fromDateStr: dateFrom,
      toDateStr: dateTo,
    });

    let filtered = slots.map((s) => ({ date: s.date, time: s.time, label: s.label }));

    if (dateQuery) {
      filtered = filterSlotsByQuery(dateQuery, tz, filtered);
    }
    if (daypart && daypart !== 'ANY') {
      filtered = filtered.filter((s) => matchesDaypart(s.time, daypart));
    }

    const shown = new Set(ctx.agentState.shownSlotKeys || []);
    if (excludeShown && shown.size > 0) {
      filtered = filtered.filter((s) => !shown.has(slotKey(s.date, s.time)));
    }

    const picked = filtered.slice(0, limit);
    let nearestFallback: typeof picked = [];

    if (picked.length === 0 && (mode === 'EXACT_DATE' || excludeShown)) {
      const all = await BookingAvailabilityService.getAvailableSlots(exec.tenantId, {
        limit: 40,
        serviceId,
      });
      nearestFallback = all
        .map((s) => ({ date: s.date, time: s.time, label: s.label }))
        .filter((s) => !excludeShown || !shown.has(slotKey(s.date, s.time)))
        .slice(0, 2);
    }

    const toShow = picked.length > 0 ? picked : nearestFallback;
    const newKeys = toShow.map((s) => slotKey(s.date, s.time));
    const nextShown = [...new Set([...(ctx.agentState.shownSlotKeys || []), ...newKeys])];

    const options = toShow.map((s) => s.label);
    if (toShow.length > 0) options.push(MORE_SLOTS_LABEL);

    const body = picked.length > 0
      ? 'Estos son los primeros horarios disponibles:'
      : nearestFallback.length > 0
        ? 'No encontré lugar en ese momento. Lo más cercano que tengo es:'
        : 'No encontré horarios libres con ese filtro.';

    const preference: DatePreference = {
      mode,
      dateFrom,
      dateTo,
      daypart: daypart || 'ANY',
    };

    return {
      ok: true,
      data: {
        found: toShow.length > 0,
        slots: toShow,
        used_fallback: picked.length === 0 && nearestFallback.length > 0,
        presentation: 'quick_slots',
        next_if_rejected: 'show_slot_browse_menu o find_available_slots(exclude_shown=true)',
      },
      contextPatch: {
        agentState: {
          ...ctx.agentState,
          mode: 'booking',
          datePreference: preference,
          listedSlots: toShow,
          shownSlotKeys: nextShown,
          offeredSlot: toShow[0]
            ? { ...toShow[0], confirmed: false }
            : ctx.agentState.offeredSlot,
          browsePhase: toShow.length > 0 ? 'presenting_slots' : ctx.agentState.browsePhase,
          uiPresentation: toShow.length > 0
            ? { type: 'quick_slots', body, options }
            : null,
        },
      },
    };
  }

  private static showSlotBrowseMenu(ctx: BookingConversationContext): ToolResult {
    return {
      ok: true,
      data: {
        options: MORE_MENU_OPTIONS,
        hint: 'Esta semana → get_available_days(range=this_week). Semana próxima → next_week. Elegir fecha → pedir fecha libre y find_available_slots con date_query.',
      },
      contextPatch: {
        agentState: {
          ...ctx.agentState,
          mode: 'booking',
          browsePhase: 'more_menu',
          uiPresentation: {
            type: 'more_menu',
            body: '¿Cómo preferís buscar?',
            options: MORE_MENU_OPTIONS,
          },
        },
      },
    };
  }

  private static async getAvailableDays(
    exec: ToolExecutionContext,
    ctx: BookingConversationContext,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    const serviceId = (args.service_id as string) || ctx.agentState.service?.id;
    const tz = exec.settings.timezone || 'America/Argentina/Cordoba';
    const rangeArg = String(args.range || '');

    let dateFrom = args.date_from ? String(args.date_from) : '';
    let dateTo = args.date_to ? String(args.date_to) : '';

    if (!dateFrom || !dateTo) {
      const which = rangeArg === 'next_week' ? 'next' : 'this';
      const wr = weekRangeInTz(tz, which);
      dateFrom = wr.dateFrom;
      dateTo = wr.dateTo;
    }

    const days = await BookingAvailabilityService.getAvailableDays(exec.tenantId, {
      dateFrom,
      dateTo,
      serviceId,
    });

    if (days.length === 0) {
      if (rangeArg === 'this_week') {
        const next = weekRangeInTz(tz, 'next');
        const nextDays = await BookingAvailabilityService.getAvailableDays(exec.tenantId, {
          dateFrom: next.dateFrom,
          dateTo: next.dateTo,
          serviceId,
        });
        if (nextDays.length > 0) {
          return {
            ok: true,
            data: { found: true, weeks: 'next_week_fallback', days: nextDays },
            contextPatch: {
              agentState: {
                ...ctx.agentState,
                mode: 'booking',
                availableDays: nextDays,
                datePreference: {
                  mode: 'RANGE',
                  dateFrom: next.dateFrom,
                  dateTo: next.dateTo,
                  daypart: ctx.agentState.datePreference?.daypart || 'ANY',
                },
                browsePhase: 'picking_day',
                uiPresentation: {
                  type: 'available_days',
                  body: 'Esta semana no hay lugar. En la próxima tengo estos días:',
                  options: [...nextDays.map((d) => d.label), MORE_SLOTS_LABEL],
                },
              },
            },
          };
        }
      }

      return {
        ok: true,
        data: { found: false, days: [] },
        contextPatch: {
          agentState: {
            ...ctx.agentState,
            browsePhase: 'more_menu',
            uiPresentation: {
              type: 'more_menu',
              body: 'No encontré días con lugar en ese rango. ¿Probamos otra búsqueda?',
              options: MORE_MENU_OPTIONS,
            },
          },
        },
      };
    }

    return {
      ok: true,
      data: { found: true, days },
      contextPatch: {
        agentState: {
          ...ctx.agentState,
          mode: 'booking',
          availableDays: days,
          datePreference: {
            mode: 'RANGE',
            dateFrom,
            dateTo,
            daypart: ctx.agentState.datePreference?.daypart || 'ANY',
          },
          browsePhase: 'picking_day',
          uiPresentation: {
            type: 'available_days',
            body: 'Tengo disponibilidad estos días:',
            options: [...days.slice(0, 8).map((d) => d.label), MORE_SLOTS_LABEL],
          },
        },
      },
    };
  }

  private static async getSlotsForDay(
    exec: ToolExecutionContext,
    ctx: BookingConversationContext,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    let date = String(args.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const hit = ctx.agentState.availableDays?.find(
        (d) => d.label.toLowerCase() === date.toLowerCase() || d.date === date,
      );
      if (hit) date = hit.date;
      else return { ok: false, error: 'date YYYY-MM-DD requerido' };
    }

    const serviceId = (args.service_id as string) || ctx.agentState.service?.id;
    const daypart = (String(args.daypart || ctx.agentState.datePreference?.daypart || 'ANY').toUpperCase() || 'ANY') as Daypart;

    const slots = await BookingAvailabilityService.getAvailableSlots(exec.tenantId, {
      limit: 40,
      serviceId,
      fromDateStr: date,
      toDateStr: date,
    });

    let filtered = slots.map((s) => ({ date: s.date, time: s.time, label: s.label }));
    if (daypart && daypart !== 'ANY') {
      filtered = filtered.filter((s) => matchesDaypart(s.time, daypart));
    }

    const picked = filtered.slice(0, 5);
    const newKeys = picked.map((s) => slotKey(s.date, s.time));
    const nextShown = [...new Set([...(ctx.agentState.shownSlotKeys || []), ...newKeys])];

    if (picked.length === 0) {
      return {
        ok: true,
        data: { found: false, slots: [] },
        contextPatch: {
          agentState: {
            ...ctx.agentState,
            uiPresentation: {
              type: 'more_menu',
              body: 'Ese día ya no tiene horarios libres. ¿Buscamos otro?',
              options: MORE_MENU_OPTIONS,
            },
            browsePhase: 'more_menu',
          },
        },
      };
    }

    const dayLabel = ctx.agentState.availableDays?.find((d) => d.date === date)?.label
      || picked[0].label.split('—')[0]?.trim()
      || date;

    return {
      ok: true,
      data: { found: true, slots: picked },
      contextPatch: {
        agentState: {
          ...ctx.agentState,
          mode: 'booking',
          listedSlots: picked,
          shownSlotKeys: nextShown,
          offeredSlot: { ...picked[0], confirmed: false },
          browsePhase: 'day_slots',
          uiPresentation: {
            type: 'day_slots',
            body: `Horarios disponibles el ${dayLabel}:`,
            options: [...picked.map((s) => s.time), MORE_SLOTS_LABEL],
          },
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
          listedSlots: [],
          shownSlotKeys: [],
          availableDays: [],
          offeredSlot: null,
          datePreference: { mode: 'ASAP', daypart: 'ANY' },
          browsePhase: null,
          uiPresentation: null,
        },
      },
    };
  }

  private static confirmSlot(ctx: BookingConversationContext, args: Record<string, unknown>): ToolResult {
    const date = String(args.date || '');
    const time = String(args.time || '');
    const label = String(args.label || `${date} — ${time}`);
    if (!date || !time) return { ok: false, error: 'date y time requeridos' };

    const listed = ctx.agentState.listedSlots || [];
    const fromList = listed.find((s) => s.date === date && s.time === time)
      || listed.find((s) => s.time === time);

    return {
      ok: true,
      data: { confirmed: true, slot: { date, time, label: fromList?.label || label } },
      contextPatch: {
        agentState: {
          ...ctx.agentState,
          mode: 'booking',
          offeredSlot: {
            date: fromList?.date || date,
            time: fromList?.time || time,
            label: fromList?.label || label,
            confirmed: true,
          },
          browsePhase: null,
          uiPresentation: null,
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
          uiPresentation: null,
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
          uiPresentation: null,
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
        agentState: { ...ctx.agentState, mode: 'idle', uiPresentation: null },
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
