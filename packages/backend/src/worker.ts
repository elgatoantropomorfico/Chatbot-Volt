import { Worker, Job } from 'bullmq';
import { getRedis } from './config/redis';
import { ConversationService } from './services/conversation.service';
import { OpenAIService } from './services/openai.service';
import { WhatsAppService } from './services/whatsapp.service';
import { WooService } from './services/woo.service';
import { HandoffService } from './services/handoff.service';
import { SaleService } from './services/sale.service';
import { LeadExtractionService } from './services/lead-extraction.service';
import { LeadProfileService } from './services/lead-profile.service';
import { LeadRequestService } from './services/lead-request.service';
import { ZohoSyncService } from './services/zoho-sync.service';
import { PilotSyncService } from './services/pilot-sync.service';
import { GroqTranscriptionService } from './services/groq-transcription.service';
import { R2Service } from './services/r2.service';
import { prisma } from './config/database';
import { BookingAvailabilityService } from './services/booking-availability.service';
import { BookingDebounceService } from './services/booking-debounce.service';
import { BookingOrchestrator } from './services/booking-orchestrator.service';
import { BookingResponseService } from './services/booking-response.service';

// Store last search results per conversation for "agregar el 2" cart operations
const lastSearchResults = new Map<string, any[]>();

interface IncomingMessage {
  phoneNumberId: string;
  from: string;
  text: string;
  messageId: string;
  timestamp: string;
  profileName: string | null;
  messageType?: string;
  mediaId?: string;
  mediaMimeType?: string;
}

async function tryPilotAutoSync(leadId: string, tenantId: string) {
  const pilotIntegration = await prisma.integration.findFirst({
    where: { tenantId, type: 'pilot_crm' as any, status: 'active' },
  });
  if (!pilotIntegration) return;

  const freshLead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!freshLead || freshLead.pilotContactId) return;
  if (freshLead.pilotSyncStatus !== 'pending' && freshLead.pilotSyncStatus !== 'error') return;

  const pilotFields = await prisma.pilotFieldConfig.findMany({
    where: { tenantId, isActive: true },
  });
  if (!LeadProfileService.isReadyForPilot(freshLead, pilotFields)) return;

  console.log(`🚀 Lead ${leadId} ready for Pilot — auto-syncing`);
  try {
    await PilotSyncService.syncLeadToPilot(leadId, tenantId);
  } catch (pilotErr: any) {
    console.error('⚠️ Pilot auto-sync failed (non-fatal):', pilotErr.message);
  }
}

async function processMessage(job: Job<IncomingMessage>) {
  const data = job.data;
  console.log(`🔄 Processing message from ${data.from} (phone_number_id: ${data.phoneNumberId})`);
  console.log(`📋 Job data: ${JSON.stringify(data)}`);

  // 1. Resolve tenant, lead, conversation and save incoming message
  // For image messages with no caption, set a descriptive text for context
  if (data.messageType === 'image' && !data.text) {
    data.text = '[📷 Foto enviada]';
  }

  // Transcribe audio via Groq Whisper before saving/processing
  if (data.messageType === 'audio' && data.mediaId) {
    try {
      if (GroqTranscriptionService.isConfigured()) {
        const media = await WhatsAppService.downloadMedia(data.mediaId);
        const transcript = await GroqTranscriptionService.transcribe(
          media.buffer,
          data.mediaMimeType || media.mimeType,
        );
        data.text = transcript;
        console.log(`🎤 Audio transcribed (${transcript.length} chars): ${transcript.slice(0, 80)}...`);
      } else {
        data.text = '[🎤 Audio recibido — transcripción no configurada]';
        console.warn('⚠️ Groq not configured, audio message will not be transcribed');
      }
    } catch (audioErr: any) {
      console.error('⚠️ Audio transcription error:', audioErr.message || audioErr);
      data.text = '[🎤 Audio recibido — no se pudo transcribir]';
    }
  }

  let resolved;
  try {
    resolved = await ConversationService.resolveOrCreate(data);
  } catch (err) {
    console.error(`❌ Failed to resolve conversation:`, err);
    throw err;
  }
  const { conversation, channel, tenant, lead, message: savedMessage } = resolved;
  console.log(`✅ Resolved: tenant=${tenant.name}, lead=${lead.id}, conversation=${conversation.id}`);

  // ============================================
  // LEAD EXTRACTION & ZOHO SYNC (non-blocking)
  // ============================================
  try {
    // Check if tenant has any field configs (generic or Zoho)
    const hasLeadFields = await prisma.leadFieldConfig.count({
      where: { tenantId: tenant.id, isActive: true },
    });
    const zohoIntegration = await prisma.integration.findFirst({
      where: { tenantId: tenant.id, type: 'zoho_crm' as any, status: 'active' },
    });
    const pilotIntegration = await prisma.integration.findFirst({
      where: { tenantId: tenant.id, type: 'pilot_crm' as any, status: 'active' },
    });

    if (hasLeadFields > 0 || zohoIntegration || pilotIntegration) {
      const extracted = await LeadExtractionService.extract({
        tenantId: tenant.id,
        conversationId: conversation.id,
        leadId: lead.id,
        latestMessage: data.text,
        profileName: data.profileName,
      });

      const enrichedLead = await LeadProfileService.mergeExtractedData(lead.id, extracted);

      // Auto-sync to Zoho on first readiness (only for Zoho tenants)
      if (zohoIntegration) {
        const isReady = LeadProfileService.isReadyForZoho(enrichedLead as any);
        if (isReady && (!(enrichedLead as any).zohoContactId || (enrichedLead as any).zohoSyncStatus === 'pending')) {
          console.log(`🚀 Lead ${lead.id} ready for Zoho — auto-syncing`);
          await ZohoSyncService.syncLeadToZoho(enrichedLead.id, tenant.id);
        }
      }

      if (pilotIntegration) {
        await tryPilotAutoSync(enrichedLead.id, tenant.id);
      }
    }
  } catch (err) {
    console.error('⚠️ Lead extraction/sync error (non-fatal):', err);
  }

  // ============================================
  // IMAGE HANDLING: download from WA → upload to R2 → save LeadPhoto + update message
  // ============================================
  // When a burst of photos arrives just AFTER the request closed (e.g. user
  // sent 3 photos in 5 seconds and the first one already triggered the
  // closing AI message), we attach the rest to that same completed request
  // and short-circuit the worker so the bot doesn't re-emit the closing
  // message on every photo. The flag is set in the photo-handling block.
  let attachedToClosedRequest = false;
  if (data.messageType === 'image' && data.mediaId) {
    try {
      console.log(`📷 Downloading image mediaId=${data.mediaId} for lead ${lead.id}`);
      const media = await WhatsAppService.downloadMedia(data.mediaId);

      // Photo field configs available on this tenant (lead is sending images,
      // chances are one of these is the slot we want to fill). If any exist,
      // make sure there's an active LeadRequest so the photo lands on it.
      const photoFields = await prisma.leadFieldConfig.findMany({
        where: { tenantId: tenant.id, isActive: true, fieldType: { in: ['photo', 'multi_photo'] } },
        orderBy: [{ step: 'asc' }, { sortOrder: 'asc' }],
      });

      let activeRequest: any = null;
      let targetWasAlreadyCompleted = false;
      if (photoFields.length > 0) {
        const picked = await LeadRequestService.findOrCreatePhotoRequest(
          lead.id,
          tenant.id,
          photoFields as any,
        );
        activeRequest = picked.request;
        targetWasAlreadyCompleted = picked.wasAlreadyCompleted;
      }

      const url = await R2Service.upload({
        buffer: media.buffer,
        mimeType: media.mimeType,
        tenantId: tenant.id,
        leadId: lead.id,
        fieldKey: 'chat-image',
        requestId: activeRequest?.id,
      });

      if (url) {
        // Always update the message so image shows in inbox chat
        await prisma.message.update({
          where: { id: savedMessage.id },
          data: { mediaUrl: url },
        });

        if (photoFields.length > 0 && activeRequest) {
          // Slots are counted PER REQUEST, not lifetime per lead.
          const existingPhotos = await prisma.leadPhoto.findMany({
            where: { leadId: lead.id, requestId: activeRequest.id },
          });

          let targetField: any = null;
          for (const pf of photoFields) {
            const photosForField = existingPhotos.filter((p: any) => p.fieldKey === pf.fieldKey);
            if (pf.fieldType === 'photo' && photosForField.length === 0) {
              targetField = pf;
              break;
            } else if (pf.fieldType === 'multi_photo') {
              const maxPhotos = (pf.optionsJson as any)?.maxPhotos || 10;
              if (photosForField.length < maxPhotos) {
                targetField = pf;
                break;
              }
            }
          }

          if (targetField) {
            await prisma.leadPhoto.create({
              data: {
                leadId: lead.id,
                requestId: activeRequest.id,
                fieldKey: targetField.fieldKey,
                url,
                mimeType: media.mimeType,
                fileSize: media.buffer.length,
                caption: data.text || null,
              },
            });
            console.log(`✅ Photo saved for lead ${lead.id}, request ${activeRequest.id}, field ${targetField.fieldKey}`);

            if (targetWasAlreadyCompleted) {
              // Bump updatedAt so the recent-window heuristic keeps catching
              // the next photo of this same burst.
              await (prisma as any).leadRequest.update({
                where: { id: activeRequest.id },
                data: { updatedAt: new Date() },
              });
              attachedToClosedRequest = true;
            } else {
              // Photos can be the last requirement to satisfy the request;
              // for multi_photo the user decides upfront how many to send,
              // so a single photo is enough to close the request.
              await LeadRequestService.completeIfReady(activeRequest.id);
            }
          } else {
            console.log(`⚠️ No available photo field for lead ${lead.id} request ${activeRequest.id} — all slots full`);
          }
        }

        console.log(`✅ Image uploaded: ${url}`);
      }
    } catch (imgErr: any) {
      console.error('⚠️ Image processing error (non-fatal):', imgErr.message || imgErr);
    }
  }

  // If this photo got attached to a request that was ALREADY completed
  // (i.e., it's a follow-up photo from the same burst that closed the
  // request a moment ago), skip the AI pipeline so the bot doesn't repeat
  // the closing message it already sent for the first photo.
  if (attachedToClosedRequest) {
    console.log(`📷 Photo attached to already-completed request, skipping AI`);
    return;
  }

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

  // 5b. Booking v2 (agente + checkout) — debounce 6s, antes de OpenAI
  try {
    if (await BookingAvailabilityService.isBookingEnabled(tenant.id)) {
      if (data.messageType === 'audio') {
        await BookingResponseService.deliver({
          phoneNumberId: channel.phoneNumberId,
          to: data.from,
          conversationId: conversation.id,
          result: { handled: true, text: BookingOrchestrator.audioBlockMessage() },
        });
        return;
      }

      BookingDebounceService.schedule({
        conversationId: conversation.id,
        text: data.text,
        onFlush: async (mergedText) => {
          try {
            const flowResult = await BookingOrchestrator.handle({
              tenantId: tenant.id,
              conversationId: conversation.id,
              leadId: lead.id,
              phone: data.from,
              text: mergedText,
              profileName: data.profileName,
              messageType: data.messageType,
            });
            if (!flowResult.handled) return;
            if (flowResult.handoff) {
              await HandoffService.executeHandoff(conversation.id, 'Booking — human requested');
              return;
            }
            await BookingResponseService.deliver({
              phoneNumberId: channel.phoneNumberId,
              to: data.from,
              conversationId: conversation.id,
              result: flowResult,
            });
          } catch (bookingErr: any) {
            console.error('⚠️ Booking orchestrator error:', bookingErr.message || bookingErr);
            try {
              await BookingResponseService.deliver({
                phoneNumberId: channel.phoneNumberId,
                to: data.from,
                conversationId: conversation.id,
                result: {
                  handled: true,
                  text: 'Tuve un problema al continuar tu reserva. Escribí *menu* o *hola* y retomo desde donde quedó.',
                },
              });
            } catch (deliverErr: any) {
              console.error('⚠️ Booking fallback deliver failed:', deliverErr.message || deliverErr);
            }
          }
        },
      });
      return;
    }
  } catch (bookingErr: any) {
    console.error('⚠️ Booking flow error (non-fatal):', bookingErr.message);
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

      // Check for promo intent BEFORE product search (only in shopping mode)
      if (!wooDirectResponse && WooService.isShoppingMode(conversation.id)) {
        if (WooService.detectPromoIntent(data.text)) {
          console.log(`🏷️ Promo intent detected in shopping mode for ${conversation.id}`);
          const pb = (botSettings as any).promptBuilderJson as Record<string, any> | null;
          const promos = pb?.promotions;
          if (promos && (promos.active || promos.conditions || promos.validUntil)) {
            // Build raw promo block from tenant config
            const promoParts: string[] = [];
            if (promos.active) promoParts.push(promos.active);
            if (promos.conditions) promoParts.push(`Condiciones: ${promos.conditions}`);
            if (promos.validUntil) promoParts.push(`Válido hasta: ${promos.validUntil}`);
            const promoBlock = promoParts.join('\n');

            // Business name for context
            const businessName = pb?.business?.name || 'el negocio';

            // Focused OpenAI call to format the promo response conversationally
            try {
              const promoSystemPrompt =
                `Sos un asistente de ventas de ${businessName}. El cliente está comprando y preguntó sobre promociones o medios de pago.\n` +
                `Respondé SOLO usando la información de promociones que te paso abajo. Sé claro, amigable y usá formato WhatsApp (*bold*, listas).\n` +
                `Si el cliente pregunta por un banco o medio de pago específico que NO está en la lista, decí que no lo tenés en las promos actuales.\n` +
                `No inventes datos ni agregues promos que no estén listadas.\n` +
                `IMPORTANTE: Cerrá tu respuesta siempre con esta frase exacta en itálica:\n_Si querés, sigo con la búsqueda de productos._\n\n` +
                `PROMOCIONES ACTUALES DE ${businessName.toUpperCase()}:\n${promoBlock}`;

              const OpenAI = (await import('openai')).default;
              const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
              const completion = await openaiClient.chat.completions.create({
                model: botSettings.model || 'gpt-4o-mini',
                temperature: 0.4,
                messages: [
                  { role: 'system', content: promoSystemPrompt },
                  { role: 'user', content: data.text },
                ],
                max_tokens: 512,
              });
              wooDirectResponse = completion.choices[0]?.message?.content?.trim() || null;
            } catch (promoErr: any) {
              console.error('⚠️ Promo OpenAI error:', promoErr.message);
            }
          }
          // Fallback if no promos configured or OpenAI failed
          if (!wooDirectResponse) {
            wooDirectResponse = 'No tenemos promociones cargadas en este momento. Podés consultar directamente con un asesor.\n\n_Si querés, sigo con la búsqueda de productos._';
          }
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

        // ── Cart disabled: block ALL cart actions with friendly info-only message ──
        } else if (['cart_add', 'cart_add_by_name', 'cart_view', 'cart_clear', 'cart_checkout'].includes(wooIntent.intent) && !wooService.settings.enableCart) {
          wooDirectResponse = '🛒 La opción de compra está deshabilitada en este momento.\n\n' +
            'Podés consultar precios y productos, pero no es posible armar un carrito ni realizar compras por este medio.\n\n' +
            '_Si necesitás comprar, contactá directamente al negocio. Para seguir viendo productos, escribí *"buscar [producto]"*._';

        } else if (wooIntent.intent === 'cart_add' && wooService.settings.enableCart) {
          const results = lastSearchResults.get(conversation.id);
          if (results && wooIntent.itemNumber && wooIntent.itemNumber <= results.length) {
            const product = results[wooIntent.itemNumber - 1];
            if (!product.inStock) {
              const contactPhone = (botSettings.promptBuilderJson as any)?.contact?.phone || '';
              const contactHint = contactPhone ? ` Podés consultar al ${contactPhone} para encargos.` : '';
              wooDirectResponse = `⚠️ *${product.name}* no tiene stock disponible actualmente.${contactHint}`;
            } else {
              WooService.addToCart(conversation.id, product, wooIntent.quantity || 1);
              wooDirectResponse = `✅ *${product.name}* x${wooIntent.quantity || 1} agregado al carrito.\n\n${WooService.formatCart(conversation.id)}`;
            }
          } else {
            wooDirectResponse = '❌ No encontré ese producto. Primero buscá un producto y después usá el número de la lista para agregarlo.';
          }

        } else if (wooIntent.intent === 'cart_add_by_name' && wooService.settings.enableCart) {
          const products = await wooService.searchProducts(wooIntent.query);
          if (products.length > 0) {
            if (!products[0].inStock) {
              const contactPhone = (botSettings.promptBuilderJson as any)?.contact?.phone || '';
              const contactHint = contactPhone ? ` Podés consultar al ${contactPhone} para encargos.` : '';
              wooDirectResponse = `⚠️ *${products[0].name}* no tiene stock disponible actualmente.${contactHint}`;
            } else {
              WooService.addToCart(conversation.id, products[0], 1);
              wooDirectResponse = `✅ *${products[0].name}* agregado al carrito.\n\n${WooService.formatCart(conversation.id)}`;
            }
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
              // Auto-exit shopping mode if configured
              if (wooService.settings.exitShopOnCheckout !== false) {
                WooService.exitShoppingMode(conversation.id);
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

  // 6. If WooCommerce handled it directly, send that response; else OpenAI
  let aiResponse: string;
  if (wooDirectResponse) {
    console.log(`📤 WooCommerce direct response (${wooDirectResponse.length} chars)`);
    aiResponse = wooDirectResponse;
  } else {
    console.log(`🤖 No WooCommerce match, falling back to OpenAI...`);
    const context = await OpenAIService.buildContext(conversation.id, tenant.id);
    // If WooCommerce is active, inject woocommerce-scoped guardrails from config
    try {
      const wooCheck = await WooService.forTenant(tenant.id);
      if (wooCheck) {
        const raw = botSettings.guardrailsJson;
        const guardrails = Array.isArray(raw) ? raw : [];
        const wooRules = guardrails
          .filter((g: any) => g.scope === 'woocommerce' && g.enabled)
          .map((g: any) => g.prompt);
        if (wooRules.length > 0) {
          context.systemPrompt += `\n\n[REGLAS SOBRE PRODUCTOS Y COMPRAS]:\n${wooRules.map((r: string, i: number) => `${i + 1}. ${r}`).join('\n')}\n${wooRules.length + 1}. Podés responder preguntas generales sobre el negocio, envíos, formas de pago, horarios, etc. basándote en tu prompt del sistema.`;
        }
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

  // Re-check Pilot sync after full turn (safety net)
  try {
    await tryPilotAutoSync(lead.id, tenant.id);
  } catch {}

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

// Mantenimiento turnera: holds vencidos + confirmado→completado post-horario
setInterval(() => {
  void (async () => {
    try {
      const { BookingExpiryService } = await import('./services/booking-notification.service');
      const { BookingSalesService } = await import('./services/booking-sales.service');
      await BookingExpiryService.expireStaleHolds();
      await BookingSalesService.autoCompletePastConfirmed();
    } catch (err: any) {
      console.warn('⚠️ Booking maintenance tick:', err.message || err);
    }
  })();
}, 60_000);
