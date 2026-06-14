import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { MercadoPagoService } from '../services/mercadopago.service';

function extractPaymentId(request: FastifyRequest): string | null {
  const body = request.body as Record<string, unknown> | undefined;
  const query = request.query as Record<string, unknown>;

  const data = body?.data as { id?: string | number } | undefined;
  const candidates = [
    data?.id,
    query['data.id'],
    query.id,
    body?.id,
  ];

  for (const raw of candidates) {
    if (raw != null && String(raw).trim()) return String(raw).trim();
  }
  return null;
}

async function handleMercadoPagoWebhook(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { tenantId } = request.params as { tenantId: string };

  // Respond fast — MP retries on non-2xx
  const paymentId = extractPaymentId(request);
  if (!paymentId) {
    return reply.send({ received: true });
  }

  // Process async after responding would be ideal, but MP expects quick 200;
  // our handler is fast enough (single GET payment + DB update).
  try {
    await MercadoPagoService.processPaymentNotification(tenantId, paymentId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('⚠️ MP webhook error:', message);
  }

  return reply.send({ received: true });
}

export async function mercadopagoWebhookRoutes(app: FastifyInstance) {
  // MP may POST (webhooks v2) or GET (legacy IPN) to notification_url
  app.post('/mercadopago/:tenantId', handleMercadoPagoWebhook);
  app.get('/mercadopago/:tenantId', handleMercadoPagoWebhook);
}
