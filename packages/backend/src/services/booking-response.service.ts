import { prisma } from '../config/database';
import { WhatsAppService } from './whatsapp.service';
import { ConversationService } from './conversation.service';
import { BookingDebugService } from './booking-debug.service';
import type { FlowHandleResult } from './booking-flow.service';

export class BookingResponseService {
  static async deliver(params: {
    phoneNumberId: string;
    to: string;
    conversationId: string;
    result: FlowHandleResult;
    debugHint?: string;
  }): Promise<void> {
    let result = params.result;
    if (BookingDebugService.isEnabled()) {
      const freshConv = await prisma.conversation.findUnique({
        where: { id: params.conversationId },
        select: { bookingFlowJson: true },
      });
      result = BookingDebugService.applyToResult(result, freshConv?.bookingFlowJson, params.debugHint);
    }

    let providerMessageId: string | null = null;
    const text = result.text || '';

    if (result.interactive) {
      const ix = result.interactive;
      let body = ix.body;
      if (text && text.length > body.length) {
        const enriched = text
          .replace(/\n\n(?:\d+️⃣[^\n]+\n?)+$/u, '')
          .trim()
          .slice(0, 1020);
        if (enriched.length > body.length) body = enriched;
      }
      providerMessageId = await WhatsAppService.sendInteractive({
        phoneNumberId: params.phoneNumberId,
        to: params.to,
        body,
        type: ix.type,
        buttons: ix.buttons,
        listButtonText: ix.listButtonText,
        listRows: ix.listRows,
        listSectionTitle: ix.listSectionTitle,
      });
    } else if (text) {
      providerMessageId = await WhatsAppService.sendTextMessage({
        phoneNumberId: params.phoneNumberId,
        to: params.to,
        text,
      });
    }

    if (text) {
      await ConversationService.saveOutgoingMessage(params.conversationId, text, providerMessageId);
    }
  }
}
