import type { BookingFlowContext, BookingFlowState } from './booking-flow.service';

export type AgentMode = 'idle' | 'booking';

export type DatePreferenceMode = 'ASAP' | 'RANGE' | 'EXACT_DATE';
export type Daypart = 'ANY' | 'MORNING' | 'AFTERNOON';
export type BrowsePhase =
  | 'presenting_slots'
  | 'more_menu'
  | 'awaiting_date'
  | 'picking_day'
  | 'day_slots';

export type RecommenderStep = 'q1' | 'q2';

export interface RecommenderState {
  step: RecommenderStep;
  q1?: number;
}

export interface AgentServiceRef {
  id: string;
  name: string;
  confirmed: boolean;
}

export interface AgentSlotRef {
  date: string;
  time: string;
  label: string;
  confirmed: boolean;
}

export interface AgentCustomerRef {
  fullName: string;
  nameConfirmed: boolean;
  notes?: string | null;
  notesCollected?: boolean;
}

export interface DatePreference {
  mode: DatePreferenceMode;
  dateFrom?: string;
  dateTo?: string;
  daypart?: Daypart;
}

export interface UiPresentation {
  type: 'quick_slots' | 'more_menu' | 'available_days' | 'day_slots';
  body: string;
  options: string[];
}

export interface AgentState {
  mode: AgentMode;
  greetingPending: boolean;
  service: AgentServiceRef | null;
  offeredSlot: AgentSlotRef | null;
  listedSlots: Array<{ date: string; time: string; label: string }>;
  /** Keys date@time ya mostrados — para no repetir al pedir "otros" */
  shownSlotKeys: string[];
  availableDays: Array<{ date: string; label: string; count: number }>;
  datePreference: DatePreference | null;
  browsePhase: BrowsePhase | null;
  uiPresentation: UiPresentation | null;
  /** Cancelación pendiente de confirmación dura */
  pendingCancel: { appointmentId: string; label: string } | null;
  /** Reprogramación in place (mismo turno / mismo cobro) */
  pendingReschedule: {
    appointmentId: string;
    label: string;
    serviceId: string;
    phase: 'pick_apt' | 'pick_slot';
    options?: Array<{ id: string; label: string; serviceId: string }>;
  } | null;
  /** Flujo "Ayudame a elegir" */
  recommender: RecommenderState | null;
  /** Tras Q1/Q2: camino recomendado, esperando confirmar reserva */
  pendingRecommend: {
    id: string;
    name: string;
    recommendationText: string;
  } | null;
  /** Tras "Ya sé cuál quiero": eligiendo de la lista de caminos */
  pickingServiceList?: boolean;
  customer: AgentCustomerRef | null;
  pricePreviewShown?: boolean;
}

export type CheckoutPhase = 'promo_choice' | 'payment_choice' | 'waiting_payment' | 'confirmed';

export interface CheckoutPayload {
  phase: CheckoutPhase;
  serviceId: string;
  serviceName: string;
  slotDate: string;
  slotTime: string;
  slotLabel: string;
  customerName: string;
  customerNotes?: string | null;
  isFirstTime?: boolean;
  paymentType?: 'sena' | 'total';
  appointmentId?: string;
  /** Promo elegida o auto-aplicada */
  priceRuleId?: string | null;
  discountLabel?: string | null;
}

export interface AiWindow {
  fromMessageId: string | null;
}

export interface BookingConversationContext {
  version: 2;
  agentState: AgentState;
  checkout: CheckoutPayload | null;
  aiWindow: AiWindow;
  /** v1 cancel flow en curso — se delega al FSM legacy hasta migrar cancel tools */
  legacyV1?: BookingFlowContext;
}

export interface ToolCallRecord {
  name: string;
  args: Record<string, unknown>;
  resultSummary: string;
  ms: number;
}

export interface AgentRunResult {
  reply: string;
  toolCalls: ToolCallRecord[];
  iterations: number;
}

export const CHECKOUT_PHASES: CheckoutPhase[] = ['promo_choice', 'payment_choice', 'waiting_payment', 'confirmed'];

export const V1_CHECKOUT_STATES: BookingFlowState[] = ['payment_choice', 'waiting_payment', 'confirmed'];

export const V1_LEGACY_CANCEL_STATES: BookingFlowState[] = ['cancel_pick', 'cancel_confirm'];

export function slotKey(date: string, time: string): string {
  return `${date}@${time}`;
}

export function emptyAgentState(overrides?: Partial<AgentState>): AgentState {
  return {
    mode: 'idle',
    greetingPending: true,
    service: null,
    offeredSlot: null,
    listedSlots: [],
    shownSlotKeys: [],
    availableDays: [],
    datePreference: null,
    browsePhase: null,
    uiPresentation: null,
    pendingCancel: null,
    pendingReschedule: null,
    recommender: null,
    pendingRecommend: null,
    customer: null,
    ...overrides,
  };
}

export function emptyBookingContext(overrides?: Partial<BookingConversationContext>): BookingConversationContext {
  return {
    version: 2,
    agentState: emptyAgentState(),
    checkout: null,
    aiWindow: { fromMessageId: null },
    ...overrides,
  };
}
