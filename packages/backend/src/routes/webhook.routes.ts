import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../config/env';
import { WhatsAppService } from '../services/whatsapp.service';
import { getMessageQueue } from '../queues/message.queue';

export async function webhookRoutes(app: FastifyInstance) {
  // Verification endpoint (GET) - Meta sends this to verify the webhook
  app.get('/whatsapp', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      'hub.mode'?: string;
      'hub.verify_token'?: string;
      'hub.challenge'?: string;
    };

    if (
      query['hub.mode'] === 'subscribe' &&
      query['hub.verify_token'] === env.WHATSAPP_VERIFY_TOKEN
    ) {
      app.log.info('Webhook verified');
      return reply.status(200).send(query['hub.challenge']);
    }

    return reply.status(403).send('Forbidden');
  });

  // Debug endpoint to see last webhook payload
  let lastWebhookPayload: any = null;
  app.get('/debug', async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ lastPayload: lastWebhookPayload, timestamp: new Date().toISOString() });
  });

  // Message reception endpoint (POST) - Meta sends messages here
  app.post('/whatsapp', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as any;

    // Store for debug
    lastWebhookPayload = body;
    console.log('📩 WEBHOOK RECEIVED:', JSON.stringify(body, null, 2));

    // Always respond 200 quickly to Meta
    reply.status(200).send('EVENT_RECEIVED');

    try {
      if (body?.object !== 'whatsapp_business_account') {
        console.log('⚠️ Not a whatsapp_business_account event, ignoring');
        return;
      }

      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          if (change.field !== 'messages') {
            console.log(`⚠️ Webhook field is '${change.field}', not 'messages', skipping`);
            continue;
          }

          const value = change.value;
          const phoneNumberId = value?.metadata?.phone_number_id;
          console.log(`📱 phone_number_id from webhook: ${phoneNumberId}`);

          if (!phoneNumberId) continue;

          const messages = value.messages || [];
          console.log(`📨 Messages count: ${messages.length}`);

          if (messages.length === 0) {
            console.log('⚠️ No messages in this webhook event (might be a status update)');
          }

          for (const message of messages) {
            console.log(`📝 Message type: ${message.type}, from: ${message.from}`);
            if (message.type !== 'text') {
              console.log(`⚠️ Skipping non-text message type: ${message.type}`);
              continue;
            }

            const incomingMessage = {
              phoneNumberId,
              from: message.from,
              text: message.text?.body || '',
              messageId: message.id,
              timestamp: message.timestamp,
              profileName: value.contacts?.[0]?.profile?.name || null,
            };

            console.log('✅ Enqueuing message:', JSON.stringify(incomingMessage));

            try {
              await getMessageQueue().add('process-message', incomingMessage, {
                attempts: 3,
                backoff: { type: 'exponential', delay: 2000 },
              });
              console.log('✅ Message enqueued successfully');
            } catch (queueErr) {
              console.error('❌ Failed to enqueue message:', queueErr);
            }
          }
        }
      }
    } catch (err) {
      console.error('❌ Error processing webhook:', err);
    }
  });
}
