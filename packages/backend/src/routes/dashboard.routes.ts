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

      // 7-day trends
      const trendDays: { date: string; label: string; conversations: number; messages: number; leads: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const dayStart = new Date(today);
        dayStart.setDate(dayStart.getDate() - i);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);

        const [convCount, msgCount, leadCount] = await Promise.all([
          prisma.conversation.count({
            where: { ...baseWhere, createdAt: { gte: dayStart, lt: dayEnd } },
          }),
          prisma.message.count({
            where: {
              conversation: user.role === 'super_admin' ? {} : { tenantId },
              createdAt: { gte: dayStart, lt: dayEnd },
            },
          }),
          prisma.lead.count({
            where: { ...baseWhere, createdAt: { gte: dayStart, lt: dayEnd } },
          }),
        ]);

        trendDays.push({
          date: dayStart.toISOString().slice(0, 10),
          label: dayStart.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric' }),
          conversations: convCount,
          messages: msgCount,
          leads: leadCount,
        });
      }

      // Lead stage distribution
      const leadStageGroups = await prisma.lead.groupBy({
        by: ['stage'],
        where: baseWhere,
        _count: { _all: true },
      });
      const leadStages = leadStageGroups.map((g) => ({
        stage: g.stage,
        count: g._count._all,
      }));

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
        trends: trendDays,
        leadStages,
        modules: {
          sales: false,
          booking: false,
          zoho: false,
          pilot: false,
        },
      };

      if (tenantId) {
        const integrations = await prisma.integration.findMany({
          where: { tenantId, status: 'active' },
          select: { type: true },
        });
        stats.modules.zoho = integrations.some((i) => i.type === 'zoho_crm');
        stats.modules.pilot = integrations.some((i) => i.type === 'pilot_crm');
      }

      // Sales stats (only if WooCommerce integration exists and Sale model is available)
      try {
        const wooIntegration = await prisma.integration.findFirst({
          where: { ...baseWhere, type: 'woocommerce', status: 'active' }
        });

        if (wooIntegration && (prisma as any).sale) {
          stats.modules.sales = true;
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

      // Booking stats
      try {
        if (tenantId) {
          const bookingSettings = await prisma.bookingSettings.findFirst({
            where: { tenantId },
          });
          if (bookingSettings?.bookingEnabled) {
            stats.modules.booking = true;
            const todayStart = new Date(today);
            const todayEnd = new Date(today);
            todayEnd.setDate(todayEnd.getDate() + 1);

            const [todayAppointments, confirmed, pendingPayment, weekPaid] = await Promise.all([
              prisma.appointment.count({
                where: { tenantId, appointmentDate: { gte: todayStart, lt: todayEnd } },
              }),
              prisma.appointment.count({
                where: { tenantId, status: 'confirmado' },
              }),
              prisma.appointment.count({
                where: { tenantId, status: 'pendiente_pago' },
              }),
              prisma.appointment.aggregate({
                where: {
                  tenantId,
                  status: 'confirmado',
                  confirmedAt: { gte: weekAgo },
                },
                _sum: { amountPaid: true },
              }),
            ]);

            stats.booking = {
              todayAppointments,
              confirmed,
              pendingPayment,
              weekRevenue: Number(weekPaid._sum.amountPaid || 0),
            };
          }
        }
      } catch (error) {
        console.log('Booking stats not available');
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

  // GET /api/dashboard/actions — pending action items for tenant
  fastify.get('/actions', async (request, reply) => {
    try {
      const user = request.user as any;
      const tenantId = user.tenantId;
      if (!tenantId) return reply.send({ actions: [] });

      const actions: any[] = [];

      // 1. Pending sales (wa_human only)
      try {
        const pendingSales: any[] = await prisma.$queryRawUnsafe(
          `SELECT COUNT(*)::int as count FROM sales WHERE tenant_id = $1 AND status = 'pending'`,
          tenantId
        );
        const count = pendingSales[0]?.count || 0;
        if (count > 0) {
          actions.push({
            id: 'pending_sales',
            type: 'warning',
            title: 'Ventas pendientes',
            description: `Tenés ${count} venta${count > 1 ? 's' : ''} esperando confirmación.`,
            link: '/dashboard/sales',
            linkLabel: 'Ir a Ventas',
          });
        }
      } catch {}

      // 2. Leads without label (stage = nuevo, with activity)
      const unlabeledLeads = await prisma.lead.count({
        where: { tenantId, stage: 'nuevo' },
      });
      if (unlabeledLeads > 0) {
        actions.push({
          id: 'unlabeled_leads',
          type: 'info',
          title: 'Leads sin clasificar',
          description: `${unlabeledLeads} lead${unlabeledLeads > 1 ? 's' : ''} en estado "nuevo" sin etiqueta asignada.`,
          link: '/dashboard/leads',
          linkLabel: 'Ir a Leads',
        });
      }

      // 3. Conversations pending human attention
      const pendingHuman = await prisma.conversation.count({
        where: { tenantId, status: 'pending_human' },
      });
      if (pendingHuman > 0) {
        actions.push({
          id: 'pending_human',
          type: 'urgent',
          title: 'Atención humana requerida',
          description: `${pendingHuman} conversación${pendingHuman > 1 ? 'es' : ''} esperando respuesta de un agente.`,
          link: '/dashboard/inbox',
          linkLabel: 'Ir a Inbox',
        });
      }

      // 4. Missing WhatsApp channel
      const channel = await prisma.channel.findFirst({
        where: { tenant: { id: tenantId } },
      });
      if (!channel || !channel.phoneNumberId) {
        actions.push({
          id: 'missing_channel',
          type: 'config',
          title: 'Canal de WhatsApp no configurado',
          description: 'Configurá tu canal de WhatsApp para empezar a recibir mensajes.',
          link: '/dashboard/settings',
          linkLabel: 'Ir a Configuración',
        });
      }

      // 5. Missing bot settings / prompt builder
      const botSettings = await prisma.botSettings.findFirst({
        where: { tenantId },
      });
      if (!botSettings || !botSettings.promptBuilderJson) {
        actions.push({
          id: 'missing_bot_config',
          type: 'config',
          title: 'Bot sin configurar',
          description: 'Completá la configuración del bot con datos de tu negocio para mejorar las respuestas.',
          link: '/dashboard/bot',
          linkLabel: 'Ir a Bot / IA',
        });
      }

      reply.send({ actions });
    } catch (error) {
      console.error('Dashboard actions error:', error);
      reply.status(500).send({ error: 'Failed to load dashboard actions' });
    }
  });

  // GET /api/dashboard/search — global tenant search
  fastify.get('/search', async (request, reply) => {
    try {
      const user = request.user as any;
      const tenantId = user.tenantId;
      if (!tenantId) return reply.send({ results: [] });

      const q = String((request.query as any).q || '').trim();
      const limit = Math.min(Number((request.query as any).limit) || 8, 20);
      if (q.length < 2) return reply.send({ results: [] });

      const perType = Math.ceil(limit / 2);
      const results: any[] = [];
      const textFilter = {
        OR: [
          { name: { contains: q, mode: 'insensitive' as const } },
          { phone: { contains: q } },
        ],
      };

      const [conversations, leads, appointments, wooIntegration] = await Promise.all([
        prisma.conversation.findMany({
          where: {
            tenantId,
            isArchived: false,
            lead: textFilter,
          },
          include: {
            lead: { select: { id: true, name: true, phone: true, stage: true } },
            messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { text: true } },
          },
          orderBy: { updatedAt: 'desc' },
          take: perType,
        }),
        prisma.lead.findMany({
          where: { tenantId, ...textFilter },
          orderBy: { updatedAt: 'desc' },
          take: perType,
        }),
        prisma.bookingSettings.findFirst({ where: { tenantId } }).then(async (settings) => {
          if (!settings?.bookingEnabled) return [];
          return prisma.appointment.findMany({
            where: {
              tenantId,
              OR: [
                { customerName: { contains: q, mode: 'insensitive' } },
                { customerPhone: { contains: q } },
                { lead: textFilter },
                { service: { name: { contains: q, mode: 'insensitive' } } },
              ],
            },
            include: {
              service: { select: { name: true } },
              lead: { select: { name: true, phone: true } },
            },
            orderBy: [{ appointmentDate: 'desc' }, { appointmentTime: 'desc' }],
            take: perType,
          });
        }),
        prisma.integration.findFirst({
          where: { tenantId, type: 'woocommerce', status: 'active' },
        }),
      ]);

      for (const c of conversations) {
        const preview = c.messages[0]?.text?.slice(0, 60) || 'Sin mensajes';
        results.push({
          type: 'conversation',
          id: c.id,
          title: c.lead?.name || c.lead?.phone || 'Conversación',
          subtitle: c.lead?.phone || preview,
          badge: c.status === 'pending_human' ? 'Atención humana' : c.status,
          href: `/dashboard/inbox?c=${c.id}`,
        });
      }

      for (const l of leads) {
        results.push({
          type: 'lead',
          id: l.id,
          title: l.name || l.phone,
          subtitle: l.phone,
          badge: l.stage,
          href: `/dashboard/leads?lead=${l.id}`,
        });
      }

      for (const a of appointments) {
        const dateStr = a.appointmentDate instanceof Date
          ? a.appointmentDate.toISOString().slice(0, 10)
          : String(a.appointmentDate).slice(0, 10);
        results.push({
          type: 'appointment',
          id: a.id,
          title: a.customerName || a.lead?.name || a.customerPhone,
          subtitle: `${dateStr} ${a.appointmentTime} · ${a.service?.name || 'Turno'}`,
          badge: a.status,
          href: `/dashboard/turnos?appointment=${a.id}`,
        });
      }

      if (wooIntegration && (prisma as any).sale) {
        const sales = await (prisma as any).sale.findMany({
          where: {
            tenantId,
            OR: [
              { customerName: { contains: q, mode: 'insensitive' } },
              { customerPhone: { contains: q } },
              { lead: textFilter },
            ],
          },
          orderBy: { createdAt: 'desc' },
          take: perType,
          include: { lead: { select: { name: true, phone: true } } },
        });
        for (const s of sales) {
          results.push({
            type: 'sale',
            id: s.id,
            title: s.customerName || s.lead?.name || s.customerPhone || 'Venta',
            subtitle: s.customerPhone || s.lead?.phone || '',
            badge: s.status,
            href: `/dashboard/sales?sale=${s.id}`,
          });
        }
      }

      reply.send({ results: results.slice(0, limit) });
    } catch (error) {
      console.error('Dashboard search error:', error);
      reply.status(500).send({ error: 'Search failed' });
    }
  });
}
