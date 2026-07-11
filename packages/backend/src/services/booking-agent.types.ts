import type { BookingFlowContext, BookingFlowState } from './booking-flow.service';

export type AgentMode = 'idle' | 'booking';

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

export interface AgentState {
  mode: AgentMode;
  greetingPending: boolean;
  service: AgentServiceRef | null;
  offeredSlot: AgentSlotRef | null;
  listedSlots: Array<{ date: string; time: string; label: string }>;
  customer: AgentCustomerRef | null;
  pricePreviewShown?: boolean;
}

export type CheckoutPhase = 'payment_choice' | 'waiting_payment' | 'confirmed';

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

export const CHECKOUT_PHASES: CheckoutPhase[] = ['payment_choice', 'waiting_payment', 'confirmed'];

export const V1_CHECKOUT_STATES: BookingFlowState[] = ['payment_choice', 'waiting_payment', 'confirmed'];

export const V1_LEGACY_CANCEL_STATES: BookingFlowState[] = ['cancel_pick', 'cancel_confirm'];

export function emptyAgentState(overrides?: Partial<AgentState>): AgentState {
  return {
    mode: 'idle',
    greetingPending: true,
    service: null,
    offeredSlot: null,
    listedSlots: [],
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
