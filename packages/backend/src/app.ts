import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './config/env';
import { authPlugin } from './plugins/auth';
import { authRoutes } from './routes/auth.routes';
import { tenantRoutes } from './routes/tenant.routes';
import { channelRoutes } from './routes/channel.routes';
import { userRoutes } from './routes/user.routes';
import { leadRoutes } from './routes/lead.routes';
import { conversationRoutes } from './routes/conversation.routes';
import { botSettingsRoutes } from './routes/bot-settings.routes';
import { integrationRoutes } from './routes/integration.routes';
import { webhookRoutes } from './routes/webhook.routes';

export async function buildApp() {
  const app = Fastify({
    logger: {
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  });

  // Plugins
  await app.register(cors, {
    origin: env.NODE_ENV === 'development' ? true : ['http://localhost:3000'],
    credentials: true,
  });

  await app.register(authPlugin);

  // Health check
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // Public routes
  app.register(authRoutes, { prefix: '/api/auth' });
  app.register(webhookRoutes, { prefix: '/api/webhook' });

  // Protected routes
  app.register(async function protectedRoutes(instance) {
    instance.addHook('onRequest', instance.authenticate);

    instance.register(tenantRoutes, { prefix: '/api/tenants' });
    instance.register(channelRoutes, { prefix: '/api/channels' });
    instance.register(userRoutes, { prefix: '/api/users' });
    instance.register(leadRoutes, { prefix: '/api/leads' });
    instance.register(conversationRoutes, { prefix: '/api/conversations' });
    instance.register(botSettingsRoutes, { prefix: '/api/bot-settings' });
    instance.register(integrationRoutes, { prefix: '/api/integrations' });
  });

  return app;
}
