import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { SaleService } from '../services/sale.service';
import { prisma } from '../config/database';

const updateStatusSchema = z.object({
  status: z.enum(['pending', 'completed', 'cancelled']),
  notes: z.string().optional(),
});

function getTenantId(user: any): string | null {
  return user.role === 'superadmin' ? null : user.tenantId;
}

export async function saleRoutes(app: FastifyInstance) {
  // List sales
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;
    const tenantId = getTenantId(user);
    if (!tenantId) {
      return reply.status(400).send({ error: 'Tenant context required' });
    }

    const query = request.query as {
      status?: string;
      search?: string;
      dateFrom?: string;
      dateTo?: string;
      page?: string;
      limit?: string;
    };

    const result = await SaleService.listSales(tenantId, {
      status: query.status,
      search: query.search,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      page: query.page ? parseInt(query.page) : undefined,
      limit: query.limit ? parseInt(query.limit) : undefined,
    });

    return reply.send(result);
  });

  // Get sale stats
  app.get('/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;
    const tenantId = getTenantId(user);
    if (!tenantId) {
      return reply.status(400).send({ error: 'Tenant context required' });
    }

    const stats = await SaleService.getStats(tenantId);
    return reply.send({ stats });
  });

  // Get single sale
  app.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const sale = await SaleService.getSale(request.params.id);
    if (!sale) return reply.status(404).send({ error: 'Sale not found' });

    const user = request.user;
    if (user.role !== 'superadmin' && sale.tenantId !== user.tenantId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    return reply.send({ sale });
  });

  // Update sale status
  app.patch('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const body = updateStatusSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'Validation failed', details: body.error.flatten() });
    }

    const sale = await SaleService.updateSaleStatus(
      request.params.id,
      body.data.status,
      body.data.notes,
    );
    return reply.send({ sale });
  });

  // Delete sale (only wa_human checkout mode)
  app.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const sale = await SaleService.getSale(request.params.id);
    if (!sale) return reply.status(404).send({ error: 'Sale not found' });

    const user = request.user;
    if (user.role !== 'superadmin' && sale.tenantId !== user.tenantId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    if (sale.checkoutMode !== 'wa_human') {
      return reply.status(400).send({ error: 'Solo se pueden eliminar ventas con checkout manual (WhatsApp Humano)' });
    }

    await prisma.sale.delete({ where: { id: request.params.id } });
    return reply.send({ message: 'Sale deleted' });
  });
}
