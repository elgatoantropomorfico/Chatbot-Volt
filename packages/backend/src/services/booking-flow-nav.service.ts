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
export const CONFIRM_SERVICE_OPTIONS = ['Sí, reservar este camino', 'Ver otros caminos'];
export const CONFIRM_PAYMENT_TOTAL_OPTIONS = ['Sí, pagar 100%', 'Ver opciones de pago'];
export const CONFIRM_PAYMENT_SENA_OPTIONS = ['Sí, señar', 'Ver opciones de pago'];

export type ServicePreviewFields = {
  name: string;
  serviceType?: string | null;
  shortDescription?: string | null;
  longDescription?: string | null;
  botRecommendationText?: string | null;
  recommendedWhen?: unknown;
};

function normalizeMatchText(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

function formatRecommendedWhen(recommendedWhen: unknown): string | null {
  const items = Array.isArray(recommendedWhen)
    ? recommendedWhen.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    : [];
  if (!items.length) return null;
  return `✨ *Ideal para:* ${items.join(' · ')}`;
}

function buildServiceDetailText(service: ServicePreviewFields): string {
  const long = service.longDescription?.trim();
  const short = service.shortDescription?.trim();
  if (long && short && long !== short) return `${long}\n\n${short}`;
  return long || short || service.botRecommendationText?.trim() || '';
}

/** Info del camino primero; la confirmación de reserva va al final */
export function formatServicePreviewBody(
  service: ServicePreviewFields,
  serviceName?: string,
): string {
  const name = serviceName || service.name;
  const parts: string[] = [`🌿 *${name}*`];

  if (service.serviceType?.trim()) {
    parts.push(`_${service.serviceType.trim()}_`);
  }

  const detail = buildServiceDetailText(service);
  if (detail) parts.push('', detail);

  const when = formatRecommendedWhen(service.recommendedWhen);
  if (when) parts.push('', when);

  parts.push('', '¿Querés reservar este camino?');
  return parts.join('\n');
}

export function looksLikeServiceInfoQuery(q: string): boolean {
  return /\b(info|informaci[oó]n|contame|cu[eé]ntame|saber m[aá]s|qu[eé] es|c[oó]mo es|detalle|detalles|diferencia|compar|explica|explicame|explícame)\b/i.test(q)
    || /\b(qu[eé]\s+otras?\s+cosas|otras?\s+cosas|otros?\s+servicios|otros?\s+caminos|qu[eé]\s+m[aá]s\s+ofrec|qu[eé]\s+ofrecen|qu[eé]\s+tienen|qu[eé]\s+m[aá]s\s+tienen|ver\s+otros|cambiar\s+(de\s+)?(servicio|camino))\b/i.test(q);
}

/** Pregunta de precios / promos (no elegir horario) */
export function looksLikePriceQuery(q: string): boolean {
  return /\b(precio|precios|promo|promos|promoci[oó]n|promociones|cu[aá]nto\s+(sale|cuesta|vale|cobr)|valor(es)?|tarifa|costo|se[nñ]a)\b/i.test(q);
}

/** Solo info de promociones (no el menú Ver precios completo) */
export function looksLikePromoInfoQuery(q: string): boolean {
  const t = q.toLowerCase();
  if (!/\b(promo|promos|promoci[oó]n|promociones|descuento|descuentos|oferta|ofertas|2\s*x\s*1)\b/i.test(t)) {
    return false;
  }
  // "ver precios", "cuánto sale", etc. → lista de precios (con promos inline), no bloque de promos
  if (/\b(ver\s+precios|lista\s+de\s+precios|cu[aá]nto\s+(sale|cuesta|vale|cobr)|tarifas?|costos?)\b/i.test(t)) {
    return false;
  }
  return true;
}

/** Texto libre que debe soltar menús sticky de horarios/días */
export function looksLikeBrowseReleaseQuery(q: string): boolean {
  return looksLikeServiceInfoQuery(q) || looksLikePriceQuery(q);
}

function scoreServiceTextMatch(q: string, text: string | null | undefined, tokenWeight: number): number {
  if (!text) return 0;
  const normalized = normalizeMatchText(text);
  if (q.includes(normalized)) return tokenWeight * 3;
  const tokens = normalized.split(/\s+/).filter((t) => t.length > 4);
  return tokens.filter((t) => q.includes(t)).length * tokenWeight;
}

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
  services: Array<{
    id: string;
    name: string;
    shortDescription?: string | null;
    longDescription?: string | null;
    serviceType?: string | null;
  }>,
): { id: string; name: string } | null {
  if (looksLikeSlotPickQuery(rawText)) return null;

  const q = normalizeMatchText(rawText);
  if (q.length < 4) return null;

  const infoQuery = looksLikeServiceInfoQuery(q);
  let best: { id: string; name: string; score: number } | null = null;

  for (const s of services) {
    const name = normalizeMatchText(s.name);
    let score = 0;

    if (q.includes(name)) score += 100;
    const nameTokens = name.split(/\s+/).filter((t) => t.length > 3);
    score += nameTokens.filter((t) => q.includes(t)).length * 35;

    score += scoreServiceTextMatch(q, s.serviceType, 25);
    score += scoreServiceTextMatch(q, s.shortDescription, 15);
    score += scoreServiceTextMatch(q, s.longDescription, 12);

    if (score > (best?.score ?? 0)) {
      best = { id: s.id, name: s.name, score };
    }
  }

  const threshold = infoQuery ? 45 : 70;
  if (best && best.score >= threshold) return { id: best.id, name: best.name };
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
