/**
 * Flags de debug al pie de mensajes de turnera (solo con BOOKING_DEBUG_FLAGS=1).
 * Quitar variable de entorno cuando el flujo v2 esté estable en producción.
 */
import { env } from '../config/env';
import type { FlowHandleResult } from './booking-flow.service';

const FOOTER_MARKER = '_[🔧';

function shortId(id: string, len = 8): string {
  return id.length <= len ? id : id.slice(0, len);
}

function flagPart(key: string, value: string | number | boolean | null | undefined): string | null {
  if (value === null || value === undefined || value === '' || value === false) return null;
  return `${key}:${value}`;
}

/** v1 bookingFlowJson (FSM actual) */
function flagsFromV1Flow(flow: Record<string, unknown>): string[] {
  const parts: string[] = [];
  const push = (p: string | null) => { if (p) parts.push(p); };

  push(flagPart('st', flow.state as string));
  if (flow.pricePreviewActive) parts.push('pp:1');

  if (flow.serviceId) {
    push(flagPart('svc', shortId(String(flow.serviceId))));
    if (flow.serviceName) push(flagPart('sn', String(flow.serviceName).slice(0, 12)));
  } else if (flow.previewServiceId) {
    push(flagPart('psvc', (flow.previewServiceName as string)?.slice(0, 14) || shortId(String(flow.previewServiceId))));
  }

  if (flow.slotDate && flow.slotTime) {
    push(flagPart('sl', `${flow.slotDate}@${flow.slotTime}`));
  } else if (flow.previewSlot && typeof flow.previewSlot === 'object') {
    const ps = flow.previewSlot as { date?: string; time?: string };
    if (ps.date && ps.time) push(flagPart('psl', `${ps.date}@${ps.time}`));
  }

  if (flow.appointmentId) push(flagPart('apt', shortId(String(flow.appointmentId))));
  push(flagPart('pay', flow.paymentType as string));
  if (flow.previewPaymentType) push(flagPart('ppay', String(flow.previewPaymentType)));

  if (flow.customerName) parts.push('nm:1');
  if (flow.notesStepDone) parts.push('notes:ok');
  push(flagPart('br', flow.slotBrowse as string));
  if (Array.isArray(flow.tempSlots)) push(flagPart('ts', flow.tempSlots.length));
  if (Array.isArray(flow.previewSlots)) push(flagPart('prs', flow.previewSlots.length));
  if (flow.cancelAppointmentId) push(flagPart('cx', shortId(String(flow.cancelAppointmentId))));

  return parts;
}

/** v2 bookingFlowJson (agente + checkout) — listo para migración */
function flagsFromV2Context(ctx: Record<string, unknown>): string[] {
  const parts: string[] = ['v2'];
  const push = (p: string | null) => { if (p) parts.push(p); };

  const agent = ctx.agentState as Record<string, unknown> | undefined;
  const checkout = ctx.checkout as Record<string, unknown> | undefined;

  if (agent) {
    push(flagPart('mode', agent.mode as string));
    if (agent.greetingPending) parts.push('greet:1');
    const svc = agent.service as { id?: string; name?: string; confirmed?: boolean } | null;
    if (svc?.id) {
      push(flagPart('svc', svc.confirmed ? `${svc.name?.slice(0, 10) || shortId(svc.id)}✓` : shortId(svc.id)));
    }
    const slot = agent.offeredSlot as { date?: string; time?: string; confirmed?: boolean } | null;
    if (slot?.date && slot?.time) {
      push(flagPart('sl', `${slot.date}@${slot.time}${slot.confirmed ? '✓' : ''}`));
    }
    const cust = agent.customer as { fullName?: string; nameConfirmed?: boolean; notes?: string | null } | null;
    if (cust?.fullName) push(flagPart('nm', cust.nameConfirmed ? 'ok' : 'pend'));
    if (cust && 'notes' in cust) push(flagPart('notes', cust.notes === null ? 'skip' : 'set'));
    if (Array.isArray(agent.listedSlots)) push(flagPart('lst', agent.listedSlots.length));
    if (Array.isArray(agent.shownSlotKeys) && agent.shownSlotKeys.length) {
      push(flagPart('sh', agent.shownSlotKeys.length));
    }
    push(flagPart('br', agent.browsePhase as string));
    const pref = agent.datePreference as { mode?: string } | null;
    if (pref?.mode) push(flagPart('pref', pref.mode));
    if (agent.pendingCancel) parts.push('cx:pend');
    const rec = agent.recommender as { step?: string } | null;
    if (rec?.step) push(flagPart('rec', rec.step));
    if (agent.pickingServiceList) parts.push('psvc:1');
  }

  if (checkout?.phase) push(flagPart('chk', String(checkout.phase)));
  if (checkout?.appointmentId) push(flagPart('apt', shortId(String(checkout.appointmentId))));

  return parts;
}

export class BookingDebugService {
  static isEnabled(): boolean {
    const v = env.BOOKING_DEBUG_FLAGS?.toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
  }

  static formatFooter(flowJson: unknown, hint?: string): string | null {
    if (!this.isEnabled()) return null;

    const flow = (flowJson && typeof flowJson === 'object' ? flowJson : {}) as Record<string, unknown>;
    const parts: string[] = [];

    if (hint) parts.push(`@${hint}`);

    if (flow.version === 2) {
      parts.push(...flagsFromV2Context(flow));
    } else {
      parts.push(...flagsFromV1Flow(flow));
    }

    if (parts.length === 0) return hint ? `_[🔧 @${hint}]_` : null;
    return `_[🔧 ${parts.join('|')}]_`;
  }

  static appendToText(text: string | undefined, flowJson: unknown, hint?: string): string | undefined {
    if (!text) return text;
    const footer = this.formatFooter(flowJson, hint);
    if (!footer || text.includes(FOOTER_MARKER)) return text;
    return `${text}\n\n${footer}`;
  }

  static applyToResult(result: FlowHandleResult, flowJson: unknown, hint?: string): FlowHandleResult {
    if (!this.isEnabled()) return result;

    const footer = this.formatFooter(flowJson, hint);
    if (!footer) return result;

    console.log(`🔧 booking debug ${footer.replace(/\n/g, ' ')}`);

    const next: FlowHandleResult = { ...result };

    if (next.text) {
      next.text = this.appendToText(next.text, flowJson, hint)!;
    }

    if (next.interactive) {
      const body = next.interactive.body || next.text || '';
      if (!body.includes(FOOTER_MARKER)) {
        const withFooter = `${body}\n\n${footer}`;
        next.interactive = { ...next.interactive, body: withFooter };
        if (!next.text || next.text.length < withFooter.length) {
          next.text = withFooter;
        }
      }
    } else if (!next.text) {
      next.text = footer;
    }

    return next;
  }
}
