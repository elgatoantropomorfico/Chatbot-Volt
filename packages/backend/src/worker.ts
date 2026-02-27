import { Worker, Job } from 'bullmq';
import { getRedis } from './config/redis';
import { ConversationService } from './services/conversation.service';
import { OpenAIService } from './services/openai.service';
import { WhatsAppService } from './services/whatsapp.service';
import { WooService } from './services/woo.service';
import { HandoffService } from './services/handoff.service';
import { SaleService } from './services/sale.service';
import { prisma } from './config/database';

// Store last search results per conversation for "agregar el 2" cart operations
const lastSearchResults = new Map<string, any[]>();

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
  console.log(`📋 Job data: ${JSON.stringify(data)}`);

  // 1. Resolve tenant, lead, conversation and save incoming message
  let resolved;
  try {
    resolved = await ConversationService.resolveOrCreate(data);
  } catch (err) {
    console.error(`❌ Failed to resolve conversation:`, err);
    throw err;
  }
  const { conversation, channel, tenant, lead } = resolved;
  console.log(`✅ Resolved: tenant=${tenant.name}, lead=${lead.id}, conversation=${conversation.id}`);

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

  // 5. Check for WooCommerce intent (wrapped in try/catch to prevent crashes)
  let wooDirectResponse: string | null = null;
  try {
    const wooService = await WooService.forTenant(tenant.id);
    if (wooService) {
      // Check for explicit exit from shopping mode FIRST
      if (WooService.isShoppingMode(conversation.id)) {
        const exitMsg = WooService.detectExit(data.text);
        if (exitMsg) {
          WooService.exitShoppingMode(conversation.id);
          wooDirectResponse = exitMsg;
        }
      }

      // Check for explicit entry to shopping mode (generic "quiero comprar", "catálogo", etc.)
      if (!wooDirectResponse) {
        const entryMsg = WooService.detectEntry(data.text);
        if (entryMsg) {
          WooService.enterShoppingMode(conversation.id);
          wooDirectResponse = entryMsg;
        }
      }

      // Detect WooCommerce intent (pass conversationId for shopping mode awareness)
      if (!wooDirectResponse) {
        let wooIntent = WooService.detectIntent(data.text, conversation.id);

        // If no intent detected but in shopping mode and last search returned no results, treat as retry
        if (!wooIntent && WooService.isShoppingMode(conversation.id) && WooService.consumeRetrySearch(conversation.id)) {
          console.log(`🔄 Retry search for conversation ${conversation.id}: "${data.text}"`);
          wooIntent = { intent: 'product_search', query: data.text.replace(/[?!¿¡.,]+$/g, '').trim() };
        }

        if (wooIntent) {
          console.log(`🛒 WooCommerce intent: ${wooIntent.intent} (query: "${wooIntent.query}") [shop_mode=${WooService.isShoppingMode(conversation.id)}]`);

          if (wooIntent.intent === 'product_search' && wooService.settings.enableProductSearch) {
            // Auto-enter shopping mode on product search
            if (!WooService.isShoppingMode(conversation.id)) {
              WooService.enterShoppingMode(conversation.id);
            }
            const products = await wooService.searchProducts(wooIntent.query);
            // Store last search results for cart_add by number
            if (products.length > 0) {
              lastSearchResults.set(conversation.id, products);
            } else {
              // Mark for retry: next message will be treated as search
              WooService.markNoResults(conversation.id);
            }
            wooDirectResponse = wooService.formatProductResponse(products, wooIntent.query);

        } else if (wooIntent.intent === 'order_lookup' && wooService.settings.enableOrderLookup) {
          const orders = await wooService.searchOrdersByPhone(data.from);
          wooDirectResponse = wooService.formatOrderResponse(orders);

        } else if (wooIntent.intent === 'cart_add' && wooService.settings.enableCart) {
          const results = lastSearchResults.get(conversation.id);
          if (results && wooIntent.itemNumber && wooIntent.itemNumber <= results.length) {
            const product = results[wooIntent.itemNumber - 1];
            WooService.addToCart(conversation.id, product, wooIntent.quantity || 1);
            wooDirectResponse = `✅ *${product.name}* x${wooIntent.quantity || 1} agregado al carrito.\n\n${WooService.formatCart(conversation.id)}`;
          } else {
            wooDirectResponse = '❌ No encontré ese producto. Primero buscá un producto y después usá el número de la lista para agregarlo.';
          }

        } else if (wooIntent.intent === 'cart_add_by_name' && wooService.settings.enableCart) {
          const products = await wooService.searchProducts(wooIntent.query);
          if (products.length > 0) {
            WooService.addToCart(conversation.id, products[0], 1);
            wooDirectResponse = `✅ *${products[0].name}* agregado al carrito.\n\n${WooService.formatCart(conversation.id)}`;
          } else {
            wooDirectResponse = `❌ No encontré "${wooIntent.query}" en el catálogo.`;
          }

        } else if (wooIntent.intent === 'cart_view' && wooService.settings.enableCart) {
          wooDirectResponse = WooService.formatCart(conversation.id);

        } else if (wooIntent.intent === 'cart_clear' && wooService.settings.enableCart) {
          WooService.clearCart(conversation.id);
          wooDirectResponse = '🗑️ Tu carrito fue vaciado.';

        } else if (wooIntent.intent === 'cart_checkout' && wooService.settings.enableCart) {
          const cartItems = WooService.getCart(conversation.id);
          if (cartItems.length === 0) {
            wooDirectResponse = '🛒 Tu carrito está vacío. Buscá productos y agregalos antes de finalizar.';
          } else {
            const checkoutPhone = wooService.settings.checkoutPhone;
            if (!checkoutPhone) {
              wooDirectResponse = '⚠️ El checkout no está configurado. Contactá al negocio directamente.';
            } else if (wooService.settings.checkoutMode === 'wa_human') {
              const customerName = lead.name || data.profileName || '';
              wooDirectResponse = WooService.generateCheckout(
                conversation.id,
                customerName,
                data.from,
                checkoutPhone,
              );
              // Record the sale
              try {
                await SaleService.createSale({
                  tenantId: tenant.id,
                  leadId: lead.id,
                  conversationId: conversation.id,
                  customerName,
                  customerPhone: data.from,
                  checkoutMode: 'wa_human',
                  items: cartItems,
                });
              } catch (saleErr: any) {
                console.error('⚠️ Failed to record sale:', saleErr.message);
              }
            } else {
              // Future: mercadopago checkout
              wooDirectResponse = '⚠️ El método de pago aún no está disponible. Contactá al negocio directamente.';
            }
          }
        }
      }
      }
    }
  } catch (wooErr: any) {
    console.error('⚠️ WooCommerce error (non-fatal):', wooErr.message || wooErr);
  }

  // 6. If WooCommerce handled it directly, send that response
  let aiResponse: string;
  if (wooDirectResponse) {
    console.log(`📤 WooCommerce direct response (${wooDirectResponse.length} chars)`);
    aiResponse = wooDirectResponse;
  } else {
    console.log(`🤖 No WooCommerce match, falling back to OpenAI...`);
    const context = await OpenAIService.buildContext(conversation.id, tenant.id);
    // If WooCommerce is active, prevent OpenAI from inventing product info
    try {
      const wooCheck = await WooService.forTenant(tenant.id);
      if (wooCheck) {
        context.systemPrompt += '\n\n[REGLAS SOBRE PRODUCTOS Y COMPRAS]:\n1. NUNCA inventes nombres de productos específicos, precios ni disponibilidad de stock. No tenés acceso al inventario.\n2. NUNCA confirmes una compra ni digas que un pedido fue realizado. Vos NO procesás compras.\n3. Si el cliente pregunta por un producto específico, decile que escriba "Busco [nombre del producto]" para consultar el catálogo.\n4. Si el cliente quiere comprar, decile que escriba "Finalizar compra".\n5. Podés responder preguntas generales sobre el negocio, envíos, formas de pago, horarios, etc. basándote en tu prompt del sistema.';
      }
    } catch {}
    aiResponse = await OpenAIService.generateResponse(context);
  }

  // 8. Send response via WhatsApp
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

// Handle uncaught errors to prevent worker process from dying
process.on('uncaughtException', (err) => {
  console.error('🚨 Uncaught Exception in worker:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('🚨 Unhandled Rejection in worker:', reason);
});

console.log('🤖 Volt Worker started - listening for messages...');
