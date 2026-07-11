import { prisma } from '../config/database';
import type { BookingFlowContext } from './booking-flow.service';
import {
  CHECKOUT_PHASES,
  emptyAgentState,
  emptyBookingContext,
  type AgentState,
  type BookingConversationContext,
  type CheckoutPayload,
  V1_CHECKOUT_STATES,
  V1_LEGACY_CANCEL_STATES,
} from './booking-agent.types';

function checkoutFromV1(flow: BookingFlowContext): CheckoutPayload | null {
  if (!V1_CHECKOUT_STATES.includes(flow.state)) return null;
  if (!flow.serviceId || !flow.slotDate || !flow.slotTime || !flow.customerName) return null;
  return {
    phase: flow.state as CheckoutPayload['phase'],
    serviceId: flow.serviceId,
    serviceName: flow.serviceName || '',
    slotDate: flow.slotDate,
    slotTime: flow.slotTime,
    slotLabel: flow.slotLabel || `${flow.slotDate} — ${flow.slotTime}`,
    customerName: flow.customerName,
    customerNotes: flow.customerNotes ?? null,
    isFirstTime: flow.isFirstTime,
    paymentType: flow.paymentType,
    appointmentId: flow.appointmentId,
  };
}

export function v1FlowFromCheckout(checkout: CheckoutPayload): BookingFlowContext {
  return {
    state: checkout.phase,
    serviceId: checkout.serviceId,
    serviceName: checkout.serviceName,
    slotDate: checkout.slotDate,
    slotTime: checkout.slotTime,
    slotLabel: checkout.slotLabel,
    customerName: checkout.customerName,
    customerNotes: checkout.customerNotes ?? undefined,
    isFirstTime: checkout.isFirstTime,
    paymentType: checkout.paymentType,
    appointmentId: checkout.appointmentId,
    notesStepDone: true,
  };
}

function agentStateFromCheckout(checkout: CheckoutPayload): AgentState {
  return emptyAgentState({
    mode: 'idle',
    greetingPending: false,
    service: { id: checkout.serviceId, name: checkout.serviceName, confirmed: true },
    offeredSlot: {
      date: checkout.slotDate,
      time: checkout.slotTime,
      label: checkout.slotLabel,
      confirmed: true,
    },
    customer: {
      fullName: checkout.customerName,
      nameConfirmed: true,
      notes: checkout.customerNotes ?? null,
      notesCollected: true,
    },
  });
}

export class BookingContextService {
  static async load(conversationId: string): Promise<BookingConversationContext> {
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { bookingFlowJson: true },
    });
    const raw = conv?.bookingFlowJson as Record<string, unknown> | null;
    if (!raw || typeof raw !== 'object') return emptyBookingContext();

    if (raw.version === 2) {
      const ctx = raw as unknown as BookingConversationContext;
      return {
        ...emptyBookingContext(),
        ...ctx,
        version: 2,
        agentState: { ...emptyAgentState(), ...ctx.agentState },
        aiWindow: { fromMessageId: ctx.aiWindow?.fromMessageId ?? null },
      };
    }

    const v1 = raw as unknown as BookingFlowContext;
    if (!v1.state) return emptyBookingContext();

    if (V1_LEGACY_CANCEL_STATES.includes(v1.state)) {
      return emptyBookingContext({ legacyV1: v1 });
    }

    const checkout = checkoutFromV1(v1);
    if (checkout) {
      return emptyBookingContext({
        agentState: agentStateFromCheckout(checkout),
        checkout,
        aiWindow: { fromMessageId: null },
      });
    }

    return emptyBookingContext({ agentState: emptyAgentState({ greetingPending: true }) });
  }

  static async save(conversationId: string, ctx: BookingConversationContext): Promise<void> {
    const payload: BookingConversationContext = {
      version: 2,
      agentState: ctx.agentState,
      checkout: ctx.checkout,
      aiWindow: ctx.aiWindow,
      ...(ctx.legacyV1 ? { legacyV1: ctx.legacyV1 } : {}),
    };
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { bookingFlowJson: payload as any },
    });
  }

  static async syncFromV1Flow(
    conversationId: string,
    v1: BookingFlowContext,
    priorAgent?: AgentState,
  ): Promise<BookingConversationContext> {
    const ctx = await this.load(conversationId);

    if (v1.state === 'booking_start' || v1.state === 'idle' || v1.state === 'handoff') {
      ctx.checkout = null;
      ctx.agentState = emptyAgentState({ greetingPending: false });
      ctx.legacyV1 = undefined;
    } else if (CHECKOUT_PHASES.includes(v1.state as CheckoutPayload['phase'])) {
      const checkout = checkoutFromV1(v1);
      if (checkout) {
        ctx.checkout = checkout;
        ctx.agentState = priorAgent ?? agentStateFromCheckout(checkout);
      }
    }

    await this.save(conversationId, ctx);
    return ctx;
  }

  static async resetAfterBooking(conversationId: string, keepCustomerName?: string): Promise<void> {
    const ctx = emptyBookingContext({
      agentState: emptyAgentState({
        greetingPending: false,
        customer: keepCustomerName
          ? { fullName: keepCustomerName, nameConfirmed: true, notesCollected: false }
          : null,
      }),
      checkout: null,
      aiWindow: { fromMessageId: null },
    });
    await this.save(conversationId, ctx);
  }
}
