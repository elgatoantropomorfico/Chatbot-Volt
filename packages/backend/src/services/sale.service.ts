import { prisma } from '../config/database';

interface CreateSaleInput {
  tenantId: string;
  leadId: string;
  conversationId?: string;
  customerName?: string;
  customerPhone?: string;
  checkoutMode: string;
  items: { productId: number; name: string; price: string; quantity: number }[];
}

export class SaleService {
  static async createSale(input: CreateSaleInput) {
    const totalAmount = input.items.reduce((sum, item) => {
      return sum + (parseFloat(item.price) || 0) * item.quantity;
    }, 0);

    const sale = await prisma.sale.create({
      data: {
        tenantId: input.tenantId,
        leadId: input.leadId,
        conversationId: input.conversationId || null,
        status: 'pending',
        totalAmount,
        currency: 'ARS',
        checkoutMode: input.checkoutMode,
        customerName: input.customerName || null,
        customerPhone: input.customerPhone || null,
        itemsJson: input.items,
      },
      include: {
        lead: { select: { id: true, name: true, phone: true } },
      },
    });

    console.log(`💰 Sale created: ${sale.id} | $${totalAmount.toLocaleString('es-AR')} | ${input.items.length} items | mode=${input.checkoutMode}`);
    return sale;
  }

  static async listSales(tenantId: string, filters?: {
    status?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = { tenantId };

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.search) {
      where.OR = [
        { customerName: { contains: filters.search, mode: 'insensitive' } },
        { customerPhone: { contains: filters.search } },
        { lead: { name: { contains: filters.search, mode: 'insensitive' } } },
        { lead: { phone: { contains: filters.search } } },
      ];
    }

    if (filters?.dateFrom || filters?.dateTo) {
      where.createdAt = {};
      if (filters?.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
      if (filters?.dateTo) where.createdAt.lte = new Date(filters.dateTo + 'T23:59:59.999Z');
    }

    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        include: {
          lead: { select: { id: true, name: true, phone: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.sale.count({ where }),
    ]);

    return { sales, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  static async getSale(id: string) {
    return prisma.sale.findUnique({
      where: { id },
      include: {
        lead: { select: { id: true, name: true, phone: true, stage: true } },
      },
    });
  }

  static async updateSaleStatus(id: string, status: 'pending' | 'completed' | 'cancelled', notes?: string) {
    return prisma.sale.update({
      where: { id },
      data: {
        status,
        ...(notes !== undefined ? { notes } : {}),
      },
    });
  }

  static async getStats(tenantId: string) {
    const [totalSales, pendingSales, completedSales, cancelledSales, revenueResult] = await Promise.all([
      prisma.sale.count({ where: { tenantId } }),
      prisma.sale.count({ where: { tenantId, status: 'pending' } }),
      prisma.sale.count({ where: { tenantId, status: 'completed' } }),
      prisma.sale.count({ where: { tenantId, status: 'cancelled' } }),
      prisma.sale.aggregate({
        where: { tenantId, status: { in: ['pending', 'completed'] } },
        _sum: { totalAmount: true },
      }),
    ]);

    // Revenue this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthRevenue = await prisma.sale.aggregate({
      where: {
        tenantId,
        status: { in: ['pending', 'completed'] },
        createdAt: { gte: startOfMonth },
      },
      _sum: { totalAmount: true },
      _count: true,
    });

    return {
      totalSales,
      pendingSales,
      completedSales,
      cancelledSales,
      totalRevenue: revenueResult._sum.totalAmount || 0,
      monthRevenue: monthRevenue._sum.totalAmount || 0,
      monthSalesCount: monthRevenue._count || 0,
    };
  }
}
