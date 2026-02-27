import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database';
import { requireRole } from '../middleware/roles';
import { AuthService } from '../services/auth.service';

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['tenant_admin', 'agent']),
  tenantId: z.string(),
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  role: z.enum(['tenant_admin', 'agent']).optional(),
});

export async function userRoutes(app: FastifyInstance) {
  // List users (superadmin: all, tenant_admin: own tenant)
  app.get('/', {
    preHandler: [requireRole('superadmin', 'tenant_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;
    const where = user.role === 'superadmin' ? {} : { tenantId: user.tenantId! };

    const users = await prisma.user.findMany({
      where,
      select: { id: true, email: true, role: true, tenantId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return reply.send({ users });
  });

  // Get current user profile
  app.get('/me', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.userId },
      select: {
        id: true, email: true, role: true, tenantId: true, createdAt: true,
        tenant: { select: { id: true, name: true, status: true } },
      },
    });
    return reply.send({ user });
  });

  // Create user (superadmin or tenant_admin)
  app.post('/', {
    preHandler: [requireRole('superadmin', 'tenant_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createUserSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'Validation failed', details: body.error.flatten() });
    }

    const currentUser = request.user;
    if (currentUser.role === 'tenant_admin' && body.data.tenantId !== currentUser.tenantId) {
      return reply.status(403).send({ error: 'Cannot create users for other tenants' });
    }

    try {
      const user = await AuthService.register(body.data);
      return reply.status(201).send({ user });
    } catch (err: any) {
      return reply.status(409).send({ error: err.message });
    }
  });

  // Update user
  app.patch('/:id', {
    preHandler: [requireRole('superadmin', 'tenant_admin')],
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const body = updateUserSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'Validation failed', details: body.error.flatten() });
    }

    const user = await prisma.user.update({
      where: { id: request.params.id },
      data: body.data,
      select: { id: true, email: true, role: true, tenantId: true },
    });
    return reply.send({ user });
  });

  // Delete user (superadmin only)
  app.delete('/:id', {
    preHandler: [requireRole('superadmin')],
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    await prisma.user.delete({ where: { id: request.params.id } });
    return reply.send({ message: 'User deleted' });
  });
}
