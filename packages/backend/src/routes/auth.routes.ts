import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AuthService } from '../services/auth.service';
import { env } from '../config/env';
import jwt from 'jsonwebtoken';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['superadmin', 'tenant_admin', 'agent']).optional(),
  tenantId: z.string().optional().nullable(),
});

function generateRefreshToken(userId: string): { token: string; expiresAt: Date } {
  const token = jwt.sign({ userId }, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_EXPIRES_IN });
  const decoded = jwt.decode(token) as { exp: number };
  return { token, expiresAt: new Date(decoded.exp * 1000) };
}

export async function authRoutes(app: FastifyInstance) {
  app.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = loginSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'Validation failed', details: body.error.flatten() });
    }

    try {
      const user = await AuthService.validateCredentials(body.data);
      const accessToken = app.jwt.sign({
        userId: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
      });

      const refresh = generateRefreshToken(user.id);
      await AuthService.saveRefreshToken(user.id, refresh.token, refresh.expiresAt);

      return reply.send({
        accessToken,
        refreshToken: refresh.token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId,
        },
      });
    } catch (err: any) {
      return reply.status(401).send({ error: err.message });
    }
  });

  app.post('/register', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = registerSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'Validation failed', details: body.error.flatten() });
    }

    try {
      const user = await AuthService.register(body.data);
      return reply.status(201).send({ user });
    } catch (err: any) {
      return reply.status(409).send({ error: err.message });
    }
  });

  app.post('/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    const { refreshToken } = request.body as { refreshToken?: string };
    if (!refreshToken) {
      return reply.status(400).send({ error: 'Refresh token required' });
    }

    try {
      jwt.verify(refreshToken, env.JWT_REFRESH_SECRET);
    } catch {
      return reply.status(401).send({ error: 'Invalid refresh token' });
    }

    const stored = await AuthService.findRefreshToken(refreshToken);
    if (!stored || stored.expiresAt < new Date()) {
      return reply.status(401).send({ error: 'Refresh token expired or not found' });
    }

    await AuthService.deleteRefreshToken(refreshToken);

    const user = stored.user;
    const accessToken = app.jwt.sign({
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    });

    const newRefresh = generateRefreshToken(user.id);
    await AuthService.saveRefreshToken(user.id, newRefresh.token, newRefresh.expiresAt);

    return reply.send({ accessToken, refreshToken: newRefresh.token });
  });

  app.post('/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    const { refreshToken } = request.body as { refreshToken?: string };
    if (refreshToken) {
      await AuthService.deleteRefreshToken(refreshToken);
    }
    return reply.send({ message: 'Logged out' });
  });
}
