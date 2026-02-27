import { Worker, Job } from 'bullmq';
import { getRedis } from './config/redis';
import { ConversationService } from './services/conversation.service';
import { OpenAIService } from './services/openai.service';
import { WhatsAppService } from './services/whatsapp.service';
import { WooService } from './services/woo.service';
import { HandoffService } from './services/handoff.service';
import { prisma } from './config/database';

interface IncomingMessage {
  phoneNumberId: string;
  from: string;
  text: string;
  messageId: string;
  timestamp: string;
  profileName: string | null;
}

async function processMessage(job: Job<IncomingMessage>) {
  const data = job.data;
  console.log(`🔄 Processing message from ${data.from} (phone_number_id: ${data.phoneNumberId})`);

  // 1. Resolve tenant, lead, conversation and save incoming message
  const resolved = await ConversationService.resolveOrCreate(data);
  const { conversation, channel, tenant, lead } = resolved;

  // 2. If conversation is pending_human, skip AI processing
  if (conversation.status === 'pending_human') {
    console.log(`⏸️ Conversation ${conversation.id} is pending_human, skipping AI`);
    return;
  }

  // 3. Load bot settings
  const botSettings = await prisma.botSettings.findUnique({
    where: { tenantId: tenant.id },
  });

  if (!botSettings) {
    console.error(`❌ No bot settings for tenant ${tenant.id}`);
    return;
  }

  // 4. Check handoff triggers before calling OpenAI
  if (botSettings.handoffEnabled && botSettings.handoffTriggersJson) {
    const triggerReason = HandoffService.checkTriggers(
      data.text,
      botSettings.handoffTriggersJson as any,
    );

    if (triggerReason) {
      console.log(`🔀 Handoff triggered: ${triggerReason}`);
      await HandoffService.executeHandoff(conversation.id, triggerReason);
      return;
    }
  }

  // 5. Check for WooCommerce intent
  const wooIntent = OpenAIService.detectWooIntent(data.text);
  let wooContext = '';

  if (wooIntent) {
    const wooService = await WooService.forTenant(tenant.id);
    if (wooService) {
      console.log(`🛒 WooCommerce intent detected: ${wooIntent.intent}`);

      if (wooIntent.intent === 'order_lookup') {
        const orders = await wooService.searchOrdersByPhone(data.from);
        wooContext = `\n\n[Información de pedidos del cliente]:\n${wooService.formatOrderResponse(orders)}`;
      } else if (wooIntent.intent === 'product_search') {
        const products = await wooService.searchProducts(wooIntent.query);
        wooContext = `\n\n[Resultados de búsqueda de productos]:\n${wooService.formatProductResponse(products)}`;
      }
    }
  }

  // 6. Build context and call OpenAI
  const context = await OpenAIService.buildContext(conversation.id, tenant.id);

  if (wooContext) {
    context.systemPrompt += wooContext;
  }

  const aiResponse = await OpenAIService.generateResponse(context);

  // 7. Send response via WhatsApp
  const providerMessageId = await WhatsAppService.sendTextMessage({
    phoneNumberId: channel.phoneNumberId,
    to: data.from,
    text: aiResponse,
  });

  // 8. Save outgoing message
  await ConversationService.saveOutgoingMessage(conversation.id, aiResponse, providerMessageId);

  // 9. Periodically generate summary (every 10 messages)
  const messageCount = await prisma.message.count({
    where: { conversationId: conversation.id },
  });

  if (messageCount % 10 === 0 && messageCount > 0) {
    try {
      const summary = await OpenAIService.generateSummary(conversation.id);
      if (summary) {
        await ConversationService.updateSummary(conversation.id, summary);
      }
    } catch (err) {
      console.error('Error generating summary:', err);
    }
  }

  console.log(`✅ Message processed for ${data.from}, response sent`);
}

// Create worker
const worker = new Worker('message-processing', processMessage, {
  connection: getRedis(),
  concurrency: 5,
  limiter: {
    max: 30,
    duration: 1000,
  },
});

worker.on('completed', (job) => {
  console.log(`✅ Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`❌ Job ${job?.id} failed:`, err.message);
});

worker.on('error', (err) => {
  console.error('Worker error:', err);
});

console.log('🤖 Volt Worker started - listening for messages...');
