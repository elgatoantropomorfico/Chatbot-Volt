import { FastifyRequest, FastifyReply } from 'fastify';
import { UserRole } from '@prisma/client';

export function requireRole(...roles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;
    if (!user || !roles.includes(user.role)) {
      return reply.status(403).send({ error: 'Forbidden: insufficient permissions' });
    }
  };
}

export function requireTenant() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;
    if (!user.tenantId && user.role !== 'superadmin') {
      return reply.status(403).send({ error: 'Forbidden: no tenant assigned' });
    }
  };
}
