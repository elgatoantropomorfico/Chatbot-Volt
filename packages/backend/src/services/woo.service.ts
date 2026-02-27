import axios from 'axios';
import { prisma } from '../config/database';

interface WooConfig {
  baseUrl: string;
  consumerKey: string;
  consumerSecret: string;
  maxSearchResults?: number;
  enableProductSearch?: boolean;
  enableOrderLookup?: boolean;
  enableCart?: boolean;
}

interface WooProduct {
  id: number;
  name: string;
  price: string;
  regularPrice: string;
  salePrice: string;
  stockStatus: string;
  stockQuantity: number | null;
  inStock: boolean;
  permalink: string;
  shortDescription: string;
}

interface CartItem {
  productId: number;
  name: string;
  price: string;
  quantity: number;
}

// In-memory carts per conversation (will reset on worker restart)
const conversationCarts = new Map<string, CartItem[]>();

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
      timeout: 15000,
    });
  }

  get settings() {
    return {
      maxSearchResults: this.config.maxSearchResults || 10,
      enableProductSearch: this.config.enableProductSearch !== false,
      enableOrderLookup: this.config.enableOrderLookup !== false,
      enableCart: this.config.enableCart !== false,
    };
  }

  static async forTenant(tenantId: string): Promise<WooService | null> {
    const integration = await prisma.integration.findFirst({
      where: { tenantId, type: 'woocommerce', status: 'active' },
    });

    if (!integration) return null;

    const config = JSON.parse(integration.configEncrypted) as WooConfig;
    return new WooService(config);
  }

  // ───── PRODUCT SEARCH ─────

  async searchProducts(query: string): Promise<WooProduct[]> {
    const maxResults = this.settings.maxSearchResults;
    try {
      console.log(`🔍 WooCommerce search: "${query}" (max ${maxResults})`);
      const { data } = await this.client.get('/products', {
        params: {
          search: query,
          per_page: maxResults,
          status: 'publish',
        },
      });

      const products: WooProduct[] = data.map((p: any) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        regularPrice: p.regular_price,
        salePrice: p.sale_price,
        stockStatus: p.stock_status,
        stockQuantity: p.stock_quantity,
        inStock: p.stock_status === 'instock',
        permalink: p.permalink,
        shortDescription: (p.short_description || '').replace(/<[^>]*>/g, '').substring(0, 150).trim(),
      }));

      console.log(`🔍 WooCommerce found ${products.length} products for "${query}"`);
      return products;
    } catch (err: any) {
      console.error('WooCommerce product search error:', err.message);
      return [];
    }
  }

  formatProductResponse(products: WooProduct[], query: string): string {
    if (!products.length) {
      return `No encontré resultados para "${query}". Probá con otro nombre o palabra clave.`;
    }

    const header = products.length === 1
      ? `Encontré 1 resultado para "${query}":`
      : `Encontré ${products.length} resultados para "${query}":`;

    const list = products.map((p, i) => {
      const num = i + 1;
      const priceStr = this.formatPrice(p.price);
      const offerStr = p.salePrice && p.salePrice !== p.regularPrice
        ? ` (antes ${this.formatPrice(p.regularPrice)})`
        : '';
      const stockStr = p.inStock
        ? (p.stockQuantity !== null ? `En stock (${p.stockQuantity} disponibles)` : 'En stock')
        : 'Sin stock';
      const stockIcon = p.inStock ? '✅' : '❌';

      return `*${num}. ${p.name}*\n` +
             `   💰 ${priceStr}${offerStr}\n` +
             `   ${stockIcon} ${stockStr}`;
    }).join('\n\n');

    const footer = this.settings.enableCart
      ? '\n\n💡 Para agregar al carrito escribí: *"Agregar [número] al carrito"* o *"Agregar 2 unidades del [número]"*'
      : '';

    return `${header}\n\n${list}${footer}`;
  }

  // ───── ORDER LOOKUP ─────

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

  formatOrderResponse(orders: any[]): string {
    if (!orders.length) return 'No encontré pedidos asociados a tu número.';

    return orders.map((o: any) =>
      `📦 *Pedido #${o.number}*\n` +
      `   Estado: ${this.translateStatus(o.status)}\n` +
      `   Total: ${this.formatPrice(o.total)}\n` +
      `   Fecha: ${new Date(o.dateCreated).toLocaleDateString('es-AR')}\n` +
      `   Productos: ${o.lineItems?.map((i: any) => `${i.name} x${i.quantity}`).join(', ')}`
    ).join('\n\n');
  }

  // ───── CART SYSTEM ─────

  static getCart(conversationId: string): CartItem[] {
    return conversationCarts.get(conversationId) || [];
  }

  static addToCart(conversationId: string, product: WooProduct, quantity: number = 1): CartItem[] {
    const cart = conversationCarts.get(conversationId) || [];
    const existing = cart.find(item => item.productId === product.id);

    if (existing) {
      existing.quantity += quantity;
    } else {
      cart.push({
        productId: product.id,
        name: product.name,
        price: product.price,
        quantity,
      });
    }

    conversationCarts.set(conversationId, cart);
    return cart;
  }

  static removeFromCart(conversationId: string, productId: number): CartItem[] {
    const cart = (conversationCarts.get(conversationId) || []).filter(item => item.productId !== productId);
    conversationCarts.set(conversationId, cart);
    return cart;
  }

  static clearCart(conversationId: string): void {
    conversationCarts.delete(conversationId);
  }

  static formatCart(conversationId: string): string {
    const cart = conversationCarts.get(conversationId) || [];
    if (!cart.length) return '🛒 Tu carrito está vacío.';

    let total = 0;
    const items = cart.map((item, i) => {
      const subtotal = parseFloat(item.price) * item.quantity;
      total += subtotal;
      return `${i + 1}. *${item.name}*\n   ${item.quantity} x $${parseInt(item.price).toLocaleString('es-AR')} = $${subtotal.toLocaleString('es-AR')}`;
    }).join('\n\n');

    return `🛒 *Tu carrito:*\n\n${items}\n\n` +
           `━━━━━━━━━━━━━━━\n` +
           `*Total: $${total.toLocaleString('es-AR')}*\n\n` +
           `💡 Escribí *"Vaciar carrito"* para vaciarlo o seguí buscando productos.`;
  }

  // ───── INTENT DETECTION (moved here from OpenAI service) ─────

  static detectIntent(text: string): { intent: string; query: string; quantity?: number; itemNumber?: number } | null {
    const lower = text.toLowerCase().trim();

    // Cart: clear
    if (/(?:vaciar|limpiar|borrar|eliminar)\s*(?:el\s+)?(?:carrito|carro|cart)/i.test(lower)) {
      return { intent: 'cart_clear', query: '' };
    }

    // Cart: view
    if (/(?:ver|mostrar|mi)\s*(?:el\s+)?(?:carrito|carro|cart)/i.test(lower)) {
      return { intent: 'cart_view', query: '' };
    }

    // Cart: add by number from last search - "agregar 2" or "agregar el 3" or "agregar 2 unidades del 1"
    const addMatch = lower.match(/(?:agregar|añadir|sumar|quiero)\s+(?:(\d+)\s+(?:unidades?|items?)\s+(?:del?|al)\s+(?:n[uú]mero\s+)?(\d+)|(?:el\s+)?(\d+)(?:\s+al\s+carrito)?)/);
    if (addMatch) {
      if (addMatch[1] && addMatch[2]) {
        return { intent: 'cart_add', query: '', quantity: parseInt(addMatch[1]), itemNumber: parseInt(addMatch[2]) };
      } else if (addMatch[3]) {
        return { intent: 'cart_add', query: '', quantity: 1, itemNumber: parseInt(addMatch[3]) };
      }
    }

    // Also match: "agregar [product name] al carrito"
    const addNameMatch = lower.match(/(?:agregar|añadir)\s+(.+?)\s+al\s+carrito/);
    if (addNameMatch) {
      return { intent: 'cart_add_by_name', query: addNameMatch[1] };
    }

    // Order lookup
    const orderPatterns = [
      /(?:estado|rastrear|seguir|tracking|dónde está|donde esta).*(?:pedido|orden|compra|envío|envio)/,
      /(?:pedido|orden|compra).*(?:número|numero|nro|#)\s*(\w+)/,
      /mi (?:pedido|orden|compra)/,
    ];
    for (const pattern of orderPatterns) {
      if (pattern.test(lower)) {
        return { intent: 'order_lookup', query: text };
      }
    }

    // Product search
    const productPatterns = [
      /(?:buscar|busco|tenés|tenes|tienen|hay|precio|cuesta|vale)\s+.{2,}/,
      /(?:producto|artículo|articulo).*(?:buscar|busco|precio|cuesta)/,
      /cu[aá]nto (?:cuesta|sale|vale)/,
      /(?:quiero|necesito|me interesa)\s+(?:comprar|ver|saber|un|una|el|la|los|las)\s+.{2,}/,
      /(?:stock|disponib|entrega inmediata)/i,
      /(?:venden|ofrecen|manejan|trabajan con)\s+.{2,}/,
      /(?:libros?|ejemplar) (?:de|del|sobre)\s+.{2,}/,
      /(?:tienen|tenes|tenés)\s+.{2,}/,
    ];
    for (const pattern of productPatterns) {
      if (pattern.test(lower)) {
        const cleanedQuery = WooService.extractProductQuery(text);
        return { intent: 'product_search', query: cleanedQuery };
      }
    }

    return null;
  }

  static extractProductQuery(text: string): string {
    let q = text.trim();
    const prefixes = [
      /^(?:hola[,!.]?\s*)/i,
      /^(?:tienen|tenes|tenés|hay|busco|buscar|quiero|necesito|me interesa)\s+/i,
      /^(?:cuánto|cuanto)\s+(?:cuesta|sale|vale)\s+/i,
      /^(?:venden|ofrecen|manejan)\s+/i,
      /^(?:libros?\s+(?:de|del|sobre))\s+/i,
      /^(?:quiero|necesito|me interesa)\s+(?:comprar|ver|saber|un|una|el|la|los|las)\s+/i,
      /^(?:el|la|los|las|un|una)\s+/i,
    ];
    for (const prefix of prefixes) {
      q = q.replace(prefix, '');
    }
    q = q.replace(/[?!¿¡.,]+$/g, '').trim();
    return q || text;
  }

  // ───── HELPERS ─────

  private formatPrice(price: string): string {
    const num = parseInt(price);
    if (isNaN(num)) return `$${price}`;
    return `$${num.toLocaleString('es-AR')}`;
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
