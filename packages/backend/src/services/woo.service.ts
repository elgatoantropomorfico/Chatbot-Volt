import axios from 'axios';
import { prisma } from '../config/database';

interface WooConfig {
  baseUrl: string;
  consumerKey: string;
  consumerSecret: string;
}

export class WooService {
  private config: WooConfig;
  private client: ReturnType<typeof axios.create>;

  constructor(config: WooConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: `${config.baseUrl}/wp-json/wc/v3`,
      auth: {
        username: config.consumerKey,
        password: config.consumerSecret,
      },
      timeout: 10000,
    });
  }

  static async forTenant(tenantId: string): Promise<WooService | null> {
    const integration = await prisma.integration.findFirst({
      where: { tenantId, type: 'woocommerce', status: 'active' },
    });

    if (!integration) return null;

    const config = JSON.parse(integration.configEncrypted) as WooConfig;
    return new WooService(config);
  }

  async searchOrdersByPhone(phone: string): Promise<any[]> {
    try {
      const { data } = await this.client.get('/orders', {
        params: { search: phone, per_page: 5, orderby: 'date', order: 'desc' },
      });
      return data.map((order: any) => ({
        id: order.id,
        number: order.number,
        status: order.status,
        total: order.total,
        currency: order.currency,
        dateCreated: order.date_created,
        billing: {
          firstName: order.billing?.first_name,
          lastName: order.billing?.last_name,
          phone: order.billing?.phone,
        },
        lineItems: order.line_items?.map((item: any) => ({
          name: item.name,
          quantity: item.quantity,
          total: item.total,
        })),
      }));
    } catch (err: any) {
      console.error('WooCommerce order search error:', err.message);
      return [];
    }
  }

  async searchOrderByNumber(orderNumber: string): Promise<any | null> {
    try {
      const { data } = await this.client.get('/orders', {
        params: { search: orderNumber, per_page: 1 },
      });
      if (!data.length) return null;

      const order = data[0];
      return {
        id: order.id,
        number: order.number,
        status: order.status,
        total: order.total,
        currency: order.currency,
        dateCreated: order.date_created,
        billing: {
          firstName: order.billing?.first_name,
          lastName: order.billing?.last_name,
        },
        shipping: {
          address: order.shipping ? `${order.shipping.address_1}, ${order.shipping.city}` : null,
        },
        lineItems: order.line_items?.map((item: any) => ({
          name: item.name,
          quantity: item.quantity,
          total: item.total,
        })),
      };
    } catch (err: any) {
      console.error('WooCommerce order lookup error:', err.message);
      return null;
    }
  }

  async searchProducts(query: string): Promise<any[]> {
    try {
      const { data } = await this.client.get('/products', {
        params: { search: query, per_page: 5, status: 'publish' },
      });
      return data.map((product: any) => ({
        id: product.id,
        name: product.name,
        price: product.price,
        regularPrice: product.regular_price,
        salePrice: product.sale_price,
        inStock: product.in_stock,
        permalink: product.permalink,
        shortDescription: product.short_description?.replace(/<[^>]*>/g, '').substring(0, 200),
      }));
    } catch (err: any) {
      console.error('WooCommerce product search error:', err.message);
      return [];
    }
  }

  formatOrderResponse(orders: any[]): string {
    if (!orders.length) return 'No encontré pedidos asociados a tu número.';

    return orders.map((o: any) =>
      `📦 Pedido #${o.number}\n` +
      `Estado: ${this.translateStatus(o.status)}\n` +
      `Total: ${o.currency} ${o.total}\n` +
      `Fecha: ${new Date(o.dateCreated).toLocaleDateString('es-AR')}\n` +
      `Productos: ${o.lineItems?.map((i: any) => `${i.name} x${i.quantity}`).join(', ')}`
    ).join('\n\n');
  }

  formatProductResponse(products: any[]): string {
    if (!products.length) return 'No encontré productos con esa búsqueda.';

    return products.map((p: any) =>
      `🛍️ ${p.name}\n` +
      `Precio: $${p.price}${p.salePrice ? ` (antes $${p.regularPrice})` : ''}\n` +
      `${p.inStock ? '✅ En stock' : '❌ Sin stock'}\n` +
      (p.shortDescription ? `${p.shortDescription}` : '')
    ).join('\n\n');
  }

  private translateStatus(status: string): string {
    const map: Record<string, string> = {
      pending: '⏳ Pendiente de pago',
      processing: '🔄 En proceso',
      'on-hold': '⏸️ En espera',
      completed: '✅ Completado',
      cancelled: '❌ Cancelado',
      refunded: '↩️ Reembolsado',
      failed: '❌ Fallido',
      shipped: '🚚 Enviado',
    };
    return map[status] || status;
  }
}
