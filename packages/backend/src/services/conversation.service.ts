import { prisma } from '../config/database';

interface IncomingMessageData {
  phoneNumberId: string;
  from: string;
  text: string;
  messageId: string;
  profileName?: string | null;
}

export class ConversationService {
  static async resolveOrCreate(data: IncomingMessageData) {
    // 1. Find channel by phone_number_id
    const channel = await prisma.channel.findUnique({
      where: { phoneNumberId: data.phoneNumberId },
      include: { tenant: true },
    });

    if (!channel || !channel.isActive) {
      throw new Error(`No active channel found for phone_number_id: ${data.phoneNumberId}`);
    }

    const tenantId = channel.tenantId;

    // 2. Find or create lead
    let lead = await prisma.lead.findUnique({
      where: { tenantId_phone: { tenantId, phone: data.from } },
    });

    if (!lead) {
      lead = await prisma.lead.create({
        data: {
          tenantId,
          channelId: channel.id,
          phone: data.from,
          name: data.profileName || null,
          stage: 'nuevo',
        },
      });
    } else if (data.profileName && !lead.name) {
      lead = await prisma.lead.update({
        where: { id: lead.id },
        data: { name: data.profileName },
      });
    }

    // 3. Find open conversation or create one
    let conversation = await prisma.conversation.findFirst({
      where: {
        leadId: lead.id,
        channelId: channel.id,
        status: { in: ['open', 'pending_human'] },
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          tenantId,
          leadId: lead.id,
          channelId: channel.id,
          status: 'open',
        },
      });
    }

    // 4. Save incoming message
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'in',
        text: data.text,
        providerMessageId: data.messageId,
      },
    });

    // 5. Update lead's last message timestamp
    await prisma.lead.update({
      where: { id: lead.id },
      data: { lastMessageAt: new Date() },
    });

    return {
      channel,
      tenant: channel.tenant,
      lead,
      conversation,
      message,
    };
  }

  static async saveOutgoingMessage(conversationId: string, text: string, providerMessageId?: string | null) {
    return prisma.message.create({
      data: {
        conversationId,
        direction: 'out',
        text,
        providerMessageId: providerMessageId || null,
      },
    });
  }

  static async updateSummary(conversationId: string, summary: string) {
    return prisma.conversation.update({
      where: { id: conversationId },
      data: { summary },
    });
  }
}
