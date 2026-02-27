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

  // Message reception endpoint (POST) - Meta sends messages here
  app.post('/whatsapp', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as any;

    // Always respond 200 quickly to Meta
    reply.status(200).send('EVENT_RECEIVED');

    try {
      if (body?.object !== 'whatsapp_business_account') return;

      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          if (change.field !== 'messages') continue;

          const value = change.value;
          const phoneNumberId = value?.metadata?.phone_number_id;

          if (!phoneNumberId) continue;

          for (const message of value.messages || []) {
            if (message.type !== 'text') continue;

            const incomingMessage = {
              phoneNumberId,
              from: message.from,
              text: message.text?.body || '',
              messageId: message.id,
              timestamp: message.timestamp,
              profileName: value.contacts?.[0]?.profile?.name || null,
            };

            app.log.info({ incomingMessage }, 'Incoming WhatsApp message');

            // Enqueue for async processing
            await getMessageQueue().add('process-message', incomingMessage, {
              attempts: 3,
              backoff: { type: 'exponential', delay: 2000 },
            });
          }
        }
      }
    } catch (err) {
      app.log.error(err, 'Error processing webhook');
    }
  });
}
