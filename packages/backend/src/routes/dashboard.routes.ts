import { FastifyInstance } from 'fastify';
import { prisma } from '../config/database';

export async function dashboardRoutes(fastify: FastifyInstance) {
  // GET /api/dashboard/stats
  fastify.get('/stats', async (request, reply) => {
    try {
      const user = request.user as any;
      const tenantId = user.tenantId;

      // Base queries for tenant data
      const baseWhere = user.role === 'super_admin' ? {} : { tenantId };

      // Conversations stats
      const [totalConversations, activeConversations, pendingHumanConversations] = await Promise.all([
        prisma.conversation.count({ where: baseWhere }),
        prisma.conversation.count({ where: { ...baseWhere, status: 'open' } }),
        prisma.conversation.count({ where: { ...baseWhere, status: 'pending_human' } }),
      ]);

      // Leads stats
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);

      const [totalLeads, newLeadsToday, newLeadsThisWeek] = await Promise.all([
        prisma.lead.count({ where: baseWhere }),
        prisma.lead.count({ where: { ...baseWhere, createdAt: { gte: today } } }),
        prisma.lead.count({ where: { ...baseWhere, createdAt: { gte: weekAgo } } }),
      ]);

      // Messages stats
      const [totalMessages, todayMessages] = await Promise.all([
        prisma.message.count({ 
          where: { 
            conversation: user.role === 'super_admin' ? {} : { tenantId }
          } 
        }),
        prisma.message.count({ 
          where: { 
            conversation: user.role === 'super_admin' ? {} : { tenantId },
            createdAt: { gte: today }
          } 
        }),
      ]);

      // Calculate average response time (simplified - time between user message and next bot message)
      const recentMessages = await prisma.message.findMany({
        where: {
          conversation: user.role === 'super_admin' ? {} : { tenantId },
          createdAt: { gte: weekAgo }
        },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true, direction: true }
      });

      let avgResponseTime = 0;
      let responseCount = 0;
      for (let i = 0; i < recentMessages.length - 1; i++) {
        const current = recentMessages[i];
        const next = recentMessages[i + 1];
        if (current.direction === 'in' && next.direction === 'out') {
          const diff = next.createdAt.getTime() - current.createdAt.getTime();
          avgResponseTime += diff / 1000; // Convert to seconds
          responseCount++;
        }
      }
      avgResponseTime = responseCount > 0 ? avgResponseTime / responseCount : 0;

      const stats: any = {
        conversations: {
          total: totalConversations,
          active: activeConversations,
          pendingHuman: pendingHumanConversations,
        },
        leads: {
          total: totalLeads,
          newToday: newLeadsToday,
          newThisWeek: newLeadsThisWeek,
        },
        messages: {
          total: totalMessages,
          todayCount: todayMessages,
          avgResponseTime: Math.round(avgResponseTime),
        },
      };

      // Sales stats (only if WooCommerce integration exists and Sale model is available)
      try {
        const wooIntegration = await prisma.integration.findFirst({
          where: { ...baseWhere, type: 'woocommerce', status: 'active' }
        });

        if (wooIntegration && (prisma as any).sale) {
          const [totalSales, todaySales, pendingSales] = await Promise.all([
            (prisma as any).sale.count({ where: baseWhere }),
            (prisma as any).sale.aggregate({
              where: { ...baseWhere, createdAt: { gte: today } },
              _sum: { totalAmount: true },
              _count: true,
            }),
            (prisma as any).sale.count({ where: { ...baseWhere, status: 'pending' } }),
          ]);

          stats.sales = {
            total: totalSales,
            todayRevenue: todaySales._sum.totalAmount || 0,
            pendingOrders: pendingSales,
          };
        }
      } catch (error) {
        console.log('Sales stats not available (Sale model may not exist)');
      }

      // Tenant stats (only for super admin)
      if (user.role === 'super_admin') {
        const [totalTenants, activeTenants] = await Promise.all([
          prisma.tenant.count(),
          prisma.tenant.count({ where: { status: 'active' } }),
        ]);

        stats.tenants = {
          total: totalTenants,
          active: activeTenants,
        };
      }

      reply.send(stats);
    } catch (error) {
      console.error('Dashboard stats error:', error);
      reply.status(500).send({ error: 'Failed to load dashboard stats' });
    }
  });
}
