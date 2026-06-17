/**
 * Navegación del flujo de reserva: preview tentativo → confirmación → siguiente hueco.
 */
import { looksLikeSlotPickQuery } from './booking-datetime.service';

export type SlotPick = { date: string; time: string; label: string };

export type BookingNavState =
  | 'booking_start'
  | 'choosing_service_mode'
  | 'recommender_q1'
  | 'recommender_q2'
  | 'service_selected'
  | 'slot_selection'
  | 'confirm_slot_preview'
  | 'confirm_service_preview'
  | 'confirm_payment_preview'
  | 'customer_name'
  | 'customer_notes'
  | 'payment_choice'
  | 'waiting_payment'
  | 'confirmed'
  | 'handoff'
  | 'cancel_pick'
  | 'cancel_confirm'
  | 'idle';

export interface BookingNavContext {
  state: BookingNavState;
  serviceId?: string;
  serviceName?: string;
  slotDate?: string;
  slotTime?: string;
  slotLabel?: string;
  customerName?: string;
  customerNotes?: string;
  paymentType?: 'sena' | 'total';
  previewSlots?: SlotPick[];
  previewSlot?: SlotPick;
  previewServiceId?: string;
  previewServiceName?: string;
  previewPaymentType?: 'sena' | 'total';
  pricePreviewActive?: boolean;
  notesStepDone?: boolean;
}

export const CONFIRM_SLOT_OPTIONS = ['Sí, ese horario', 'Elegir otro horario'];
export const CONFIRM_SERVICE_OPTIONS = ['Sí, este camino', 'Ver otros caminos'];
export const CONFIRM_PAYMENT_TOTAL_OPTIONS = ['Sí, pagar 100%', 'Ver opciones de pago'];
export const CONFIRM_PAYMENT_SENA_OPTIONS = ['Sí, señar', 'Ver opciones de pago'];

/** Primer módulo obligatorio que falta (o confirmación de preview pendiente) */
export function nextRequiredStep(flow: BookingNavContext): BookingNavState {
  if (flow.previewSlot && !flow.slotDate) return 'confirm_slot_preview';
  if (flow.previewServiceId && !flow.serviceId) return 'confirm_service_preview';

  if (!flow.serviceId) return 'choosing_service_mode';

  if (!flow.slotDate) {
    if (flow.previewSlot) return 'confirm_slot_preview';
    return 'slot_selection';
  }

  if (!flow.customerName) return 'customer_name';

  if (!flow.notesStepDone) return 'customer_notes';

  if (!flow.paymentType) {
    if (flow.previewPaymentType) return 'confirm_payment_preview';
    return 'payment_choice';
  }

  return flow.state;
}

/** Siguiente paso tras confirmar un módulo (slot, servicio, etc.) */
export function nextStepAfterConfirm(flow: BookingNavContext): BookingNavState {
  if (!flow.serviceId) return 'choosing_service_mode';
  if (!flow.slotDate) return flow.previewSlot ? 'confirm_slot_preview' : 'slot_selection';
  if (!flow.customerName) return 'customer_name';
  if (!flow.notesStepDone) return 'customer_notes';
  if (!flow.paymentType) {
    return flow.previewPaymentType ? 'confirm_payment_preview' : 'payment_choice';
  }
  return 'payment_choice';
}

export function parsePaymentPreview(text: string): 'sena' | 'total' | null {
  const q = text.toLowerCase();
  if (/\b(pagar\s+(el\s+)?100|pago\s+total|100\s*%|cien\s+por\s+ciento|pagar\s+todo|abonar\s+todo|el\s+total)\b/.test(q)) {
    return 'total';
  }
  if (/\b(señar|senal|la\s+seña|50\s*%|abonar\s+(la\s+)?seña|pagar\s+la\s+seña)\b/.test(q)) {
    return 'sena';
  }
  return null;
}

export function matchServiceFromText(
  rawText: string,
  services: Array<{ id: string; name: string; shortDescription?: string | null }>,
): { id: string; name: string } | null {
  if (looksLikeSlotPickQuery(rawText)) return null;

  const q = rawText.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  if (q.length < 4) return null;

  let best: { id: string; name: string; score: number } | null = null;

  for (const s of services) {
    const name = s.name.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    let score = 0;

    if (q.includes(name)) score += 100;
    const nameTokens = name.split(/\s+/).filter((t) => t.length > 3);
    const hits = nameTokens.filter((t) => q.includes(t));
    score += hits.length * 35;

    if (s.shortDescription) {
      const descTokens = s.shortDescription.toLowerCase().split(/\s+/).filter((t) => t.length > 4);
      const descHits = descTokens.filter((t) => q.includes(t));
      score += descHits.length * 15;
    }

    if (score > (best?.score ?? 0)) {
      best = { id: s.id, name: s.name, score };
    }
  }

  if (best && best.score >= 70) return { id: best.id, name: best.name };
  return null;
}

export function isConfirmYes(input: string): boolean {
  return /^(sí|si|dale|ok|confirmo|confirmar|ese|esa|ese horario|este camino|sí,? ese|si,? ese)/i.test(input.trim())
    || pickConfirmOption(input) === 1;
}

export function isConfirmModify(input: string): boolean {
  return /^(no|otro|otra|cambiar|modificar|elegir otro|ver otro)/i.test(input.trim())
    || pickConfirmOption(input) === 2;
}

function pickConfirmOption(input: string): number | null {
  const t = input.trim().toLowerCase();
  if (t === '1' || t === 'uno') return 1;
  if (t === '2' || t === 'dos') return 2;
  return null;
}
