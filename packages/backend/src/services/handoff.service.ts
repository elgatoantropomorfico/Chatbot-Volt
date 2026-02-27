import { prisma } from '../config/database';
import { WhatsAppService } from './whatsapp.service';

interface HandoffTriggers {
  keywords?: string[];
  outside_business_hours?: boolean;
  force_on_negative_sentiment?: boolean;
}

export class HandoffService {
  static buildWaMeLink(phone: string, text: string): string {
    const encoded = encodeURIComponent(text);
    return `https://wa.me/${phone}?text=${encoded}`;
  }

  static buildHandoffMessage(
    template: string,
    vars: {
      leadName?: string;
      leadPhone?: string;
      handoffReason?: string;
      conversationSummary?: string;
      tenantName?: string;
      waMeLink?: string;
    },
  ): string {
    let message = template;
    message = message.replace('{{wa_me_link}}', vars.waMeLink || '');
    message = message.replace('{{lead_name}}', vars.leadName || 'Cliente');
    message = message.replace('{{lead_phone}}', vars.leadPhone || '');
    message = message.replace('{{handoff_reason}}', vars.handoffReason || '');
    message = message.replace('{{conversation_summary}}', vars.conversationSummary || '');
    message = message.replace('{{tenant_name}}', vars.tenantName || '');
    return message;
  }

  static checkTriggers(text: string, triggers: HandoffTriggers | null): string | null {
    if (!triggers) return null;

    if (triggers.keywords?.length) {
      const lowerText = text.toLowerCase();
      for (const keyword of triggers.keywords) {
        if (lowerText.includes(keyword.toLowerCase())) {
          return `Keyword detected: "${keyword}"`;
        }
      }
    }

    return null;
  }

  static async executeHandoff(
    conversationId: string,
    reason: string,
    customMessage?: string,
  ) {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        lead: true,
        channel: true,
        tenant: { include: { botSettings: true } },
      },
    });

    if (!conversation) throw new Error('Conversation not found');
    if (!conversation.tenant.botSettings) throw new Error('Bot settings not found');

    const botSettings = conversation.tenant.botSettings;

    if (!botSettings.handoffEnabled) {
      throw new Error('Handoff is not enabled for this tenant');
    }

    if (!botSettings.handoffPhoneE164) {
      throw new Error('No handoff phone number configured');
    }

    // Build wa.me link
    const prellenText = `Hola! Soy ${conversation.lead.name || conversation.lead.phone} (${conversation.lead.phone}). Vengo desde el bot. Motivo: ${reason}. Resumen: ${conversation.summary || 'Sin resumen disponible'}`;
    const waMeLink = this.buildWaMeLink(botSettings.handoffPhoneE164, prellenText);

    // Build message to send to the user
    const template = customMessage || botSettings.handoffMessageTemplate || 'Te derivo con un asesor: {{wa_me_link}}';
    const messageText = this.buildHandoffMessage(template, {
      leadName: conversation.lead.name || undefined,
      leadPhone: conversation.lead.phone,
      handoffReason: reason,
      conversationSummary: conversation.summary || undefined,
      tenantName: conversation.tenant.name,
      waMeLink,
    });

    // Update conversation status
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        status: 'pending_human',
        handoffReason: reason,
        handoffAt: new Date(),
      },
    });

    // Send WhatsApp message with wa.me link
    const providerMessageId = await WhatsAppService.sendTextMessage({
      phoneNumberId: conversation.channel.phoneNumberId,
      to: conversation.lead.phone,
      text: messageText,
    });

    // Save system message
    await prisma.message.create({
      data: {
        conversationId,
        direction: 'system',
        text: `[HANDOFF] ${reason} - Enviado link wa.me`,
        providerMessageId,
      },
    });

    return {
      status: 'pending_human',
      handoffReason: reason,
      waMeLink,
      messageSent: true,
    };
  }
}
