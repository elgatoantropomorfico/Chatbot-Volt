import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/database';
import { requireRole } from '../middleware/roles';
import { AuthService } from '../services/auth.service';

const userSelect = { id: true, email: true, name: true, role: true, tenantId: true, createdAt: true };

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
  role: z.enum(['tenant_admin', 'agent']),
  tenantId: z.string(),
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().optional(),
  password: z.string().min(6).optional(),
  role: z.enum(['tenant_admin', 'agent']).optional(),
});

const updateProfileSchema = z.object({
  name: z.string().optional(),
  password: z.string().min(6).optional(),
});

export async function userRoutes(app: FastifyInstance) {
  // List users (superadmin: all, tenant_admin: own tenant excluding self)
  app.get('/', {
    preHandler: [requireRole('superadmin', 'tenant_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;
    const where = user.role === 'superadmin'
      ? {}
      : { tenantId: user.tenantId!, id: { not: user.userId } };

    const users = await prisma.user.findMany({
      where,
      select: userSelect,
      orderBy: { createdAt: 'desc' },
    });
    return reply.send({ users });
  });

  // Get current user profile
  app.get('/me', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.userId },
      select: {
        ...userSelect,
        tenant: { select: { id: true, name: true, status: true } },
      },
    });
    return reply.send({ user });
  });

  // Update own profile (any authenticated user)
  app.patch('/me', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = updateProfileSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'Validation failed', details: body.error.flatten() });
    }

    const data: any = {};
    if (body.data.name !== undefined) data.name = body.data.name;
    if (body.data.password) data.passwordHash = await bcrypt.hash(body.data.password, 12);

    if (Object.keys(data).length === 0) {
      return reply.status(400).send({ error: 'No fields to update' });
    }

    const user = await prisma.user.update({
      where: { id: request.user.userId },
      data,
      select: {
        ...userSelect,
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

  // Update user (superadmin: any user, tenant_admin: own tenant users)
  app.patch('/:id', {
    preHandler: [requireRole('superadmin', 'tenant_admin')],
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const body = updateUserSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'Validation failed', details: body.error.flatten() });
    }

    const currentUser = request.user;
    const targetUser = await prisma.user.findUnique({ where: { id: request.params.id }, select: { tenantId: true } });
    if (!targetUser) return reply.status(404).send({ error: 'User not found' });

    if (currentUser.role === 'tenant_admin' && targetUser.tenantId !== currentUser.tenantId) {
      return reply.status(403).send({ error: 'Cannot edit users from other tenants' });
    }

    const data: any = {};
    if (body.data.email !== undefined) data.email = body.data.email;
    if (body.data.name !== undefined) data.name = body.data.name;
    if (body.data.role !== undefined) data.role = body.data.role;
    if (body.data.password) data.passwordHash = await bcrypt.hash(body.data.password, 12);

    const user = await prisma.user.update({
      where: { id: request.params.id },
      data,
      select: userSelect,
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
