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
  exitShopOnCheckout?: boolean;
  checkoutMode?: 'wa_human' | 'mercadopago';
  checkoutPhone?: string;
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

// Track conversations where last search returned no results (next message = retry)
const pendingRetrySearch = new Set<string>();

// Shopping mode per conversation: true = WooCommerce intercepts, false/absent = OpenAI handles
const shoppingMode = new Map<string, boolean>();

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
      exitShopOnCheckout: this.config.exitShopOnCheckout !== false,
      checkoutMode: this.config.checkoutMode || 'wa_human',
      checkoutPhone: this.config.checkoutPhone || '',
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
      return `No encontré resultados para "${query}". Probá con el nombre exacto del producto.\n\n_Escribí *"salir"* para volver al modo conversación._`;
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

    const cartHint = this.settings.enableCart
      ? '\n\n� *Escribí el número* para agregar al carrito. Ej: *3* · Para cantidad: *3 x2*'
      : '';
    const exitHint = '\n\n_Escribí *"salir"* para volver al modo conversación._';

    return `${header}\n\n${list}${cartHint}${exitHint}`;
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
           `💡 Escribí *"Finalizar compra"* para cerrar el pedido o *"Vaciar carrito"* para vaciarlo.`;
  }

  // ───── CHECKOUT ─────

  static generateCheckout(conversationId: string, customerName: string, customerPhone: string, checkoutPhone: string): string {
    const cart = conversationCarts.get(conversationId) || [];
    if (!cart.length) return '🛒 Tu carrito está vacío. Agregá productos antes de finalizar la compra.';

    let total = 0;
    const itemLines = cart.map((item, i) => {
      const subtotal = parseFloat(item.price) * item.quantity;
      total += subtotal;
      return `${i + 1}. ${item.name} x${item.quantity} - $${subtotal.toLocaleString('es-AR')}`;
    }).join('\n');

    // Build the pre-filled message for wa.me
    const message = [
      `🛒 *Nuevo pedido desde Volt Bot*`,
      ``,
      `👤 Cliente: ${customerName || 'Sin nombre'}`,
      `📱 Tel: ${customerPhone}`,
      ``,
      `📦 *Productos:*`,
      itemLines,
      ``,
      `💰 *Total: $${total.toLocaleString('es-AR')}*`,
      ``,
      `Generado automáticamente por Volt ChatBot`,
    ].join('\n');

    const encodedMessage = encodeURIComponent(message);
    // Clean phone: remove + and spaces
    const cleanPhone = checkoutPhone.replace(/[\s+\-()]/g, '');
    const waLink = `https://wa.me/${cleanPhone}?text=${encodedMessage}`;

    // Clear the cart after checkout
    conversationCarts.delete(conversationId);

    // Build the response to send to the customer
    const cartSummary = cart.map((item, i) => {
      const subtotal = parseFloat(item.price) * item.quantity;
      return `${i + 1}. *${item.name}* x${item.quantity} — $${subtotal.toLocaleString('es-AR')}`;
    }).join('\n');

    return `✅ *¡Pedido listo!*\n\n` +
           `📦 *Resumen:*\n${cartSummary}\n\n` +
           `━━━━━━━━━━━━━━━\n` +
           `💰 *Total: $${total.toLocaleString('es-AR')}*\n\n` +
           `Para confirmar tu compra, hacé click en el siguiente enlace y enviá el mensaje pre-armado:\n\n` +
           `👉 ${waLink}\n\n` +
           `¡Gracias por tu compra! Un asesor te va a responder a la brevedad.`;
  }

  // ───── SHOPPING MODE ─────

  static isShoppingMode(conversationId: string): boolean {
    return shoppingMode.get(conversationId) === true;
  }

  static enterShoppingMode(conversationId: string) {
    shoppingMode.set(conversationId, true);
    console.log(`🛍️ Shopping mode ON for ${conversationId}`);
  }

  static exitShoppingMode(conversationId: string) {
    shoppingMode.delete(conversationId);
    pendingRetrySearch.delete(conversationId);
    console.log(`💬 Shopping mode OFF for ${conversationId}`);
  }

  /**
   * Check if the message is an explicit exit from shopping mode.
   * Returns a friendly exit message, or null if not an exit trigger.
   */
  static detectExit(text: string): string | null {
    const lower = text.toLowerCase().trim();
    if (/(?:salir|salgo|exit)\s*(?:del?\s*)?(?:modo\s*)?(?:compra|tienda|catálogo|catalogo|shopping)/i.test(lower) ||
        /(?:modo\s*)?(?:conversaci[oó]n|chat|normal)/i.test(lower) ||
        /(?:no\s+quiero\s+(?:comprar|buscar|ver\s+productos))/i.test(lower) ||
        /(?:volver|volvamos)\s*(?:al?\s*)?(?:chat|conversaci[oó]n|inicio|men[uú])/i.test(lower) ||
        /^\s*salir\s*$/i.test(lower)) {
      return '💬 ¡Listo! Saliste del modo compra. Ahora podés hacerme cualquier consulta y te respondo normalmente.\n\n_Para volver a buscar productos, escribí *"quiero comprar"* o *"buscar [producto]"*._';
    }
    return null;
  }

  /**
   * Check if the message is an explicit entry to shopping mode (without a specific product search).
   * Returns a welcome message, or null if not an entry trigger.
   */
  static detectEntry(text: string): string | null {
    const lower = text.toLowerCase().trim();
    if (/^\s*(?:quiero\s+comprar|modo\s+compra|ver\s+(?:productos|catálogo|catalogo)|catálogo|catalogo)\s*$/i.test(lower) ||
        /^\s*(?:buscar\s+productos?|ver\s+tienda|tienda)\s*$/i.test(lower) ||
        /(?:puedo|se\s+puede|c[oó]mo\s+(?:puedo|hago\s+para))\s+comprar(?:\s+(?:ac[aá]|por\s+ac[aá]|algo|por\s+(?:ac[aá]|aqui|aqu[ií])))?[?!.]?\s*$/i.test(lower) ||
        /(?:c[oó]mo|donde|dónde)\s+(?:compro|puedo\s+comprar)/i.test(lower)) {
      return '🛍️ *¡Modo compra activado!*\n\nEscribí el nombre de lo que buscás y te muestro opciones del catálogo.\n\n_Para salir del modo compra, escribí *"salir"*._';
    }
    return null;
  }

  // ───── INTENT DETECTION ─────

  /**
   * Detects WooCommerce intent. Only matches product_search patterns when in shopping mode
   * or when the message is a strong explicit search. Cart/order intents always match.
   */
  static detectIntent(text: string, conversationId?: string): { intent: string; query: string; quantity?: number; itemNumber?: number } | null {
    const lower = text.toLowerCase().trim();
    const inShopMode = conversationId ? WooService.isShoppingMode(conversationId) : false;

    // Cart: checkout / finalize — always active
    if (/(?:finalizar|cerrar|confirmar|completar)\s*(?:la\s+)?(?:compra|pedido|orden|carrito|el\s+carrito)/i.test(lower) ||
        /(?:quiero|listo|listos?)\s*(?:para)?\s*(?:comprar|pagar|checkout)/i.test(lower) ||
        /^\s*(?:comprar|pagar|checkout|finalizar|confirmar|terminar)\s*$/i.test(lower) ||
        /(?:dale|si|sí)[,!.]?\s*(?:comprar|compro|lo quiero|los quiero|quiero (?:comprar|pagar))/i.test(lower) ||
        /(?:quiero|deseo|voy a)\s+(?:pagar|llevar)/i.test(lower) ||
        /(?:cerrar|finalizar|terminar)\s*(?:el\s+)?(?:pedido|carrito|compra|orden)/i.test(lower) ||
        /^\s*(?:lo|los|la|las)\s+(?:quiero|llevo|compro)\s*$/i.test(lower) ||
        /^\s*(?:listo|lista|dale|ok|confirmo|confirmar)\s*$/i.test(lower)) {
      return { intent: 'cart_checkout', query: '' };
    }

    // Cart: clear — always active
    if (/(?:vaciar|limpiar|borrar|eliminar)\s*(?:el\s+)?(?:carrito|carro|cart)/i.test(lower)) {
      return { intent: 'cart_clear', query: '' };
    }

    // Cart: view — always active
    if (/(?:ver|mostrar|mi)\s*(?:el\s+)?(?:carrito|carro|cart)/i.test(lower)) {
      return { intent: 'cart_view', query: '' };
    }

    // Cart: quick add by number — only in shopping mode (e.g. "3", "el 3", "3 x2", "3 - 2 unidades", "dame el 1")
    if (inShopMode) {
      // "3", "el 3", "dame el 3", "el 3 por favor"
      const quickMatch = lower.match(/^\s*(?:(?:dame|quiero|manda|el|la|los|las)\s+)*(?:el\s+)?(\d{1,2})(?:\s+(?:por\s+favor|porfa|pls|please))?\s*[.!]?\s*$/);
      if (quickMatch) {
        return { intent: 'cart_add', query: '', quantity: 1, itemNumber: parseInt(quickMatch[1]) };
      }
      // "3 - 2", "3 x2", "3 x 2", "3 2 unidades", "1 - 3 unidades"
      const qtyMatch = lower.match(/^\s*(\d{1,2})\s*[-xX×·]\s*(\d{1,2})(?:\s*(?:unidades?|u))?\s*$/);
      if (qtyMatch) {
        return { intent: 'cart_add', query: '', quantity: parseInt(qtyMatch[2]), itemNumber: parseInt(qtyMatch[1]) };
      }
      // "3, 2 unidades" / "3 - 2 unidades"
      const qtyMatch2 = lower.match(/^\s*(\d{1,2})\s*[,\-]\s*(\d{1,2})\s+(?:unidades?|u)\s*$/);
      if (qtyMatch2) {
        return { intent: 'cart_add', query: '', quantity: parseInt(qtyMatch2[2]), itemNumber: parseInt(qtyMatch2[1]) };
      }
    }

    // Cart: add by number (verbose) — always active (only works if there were previous search results)
    const addMatch = lower.match(/(?:agregar|añadir|sumar|quiero)\s+(?:(\d+)\s+(?:unidades?|items?)\s+(?:del?|al)\s+(?:n[uú]mero\s+)?(\d+)|(?:el\s+)?(\d+)(?:\s+al\s+carrito)?)/);
    if (addMatch) {
      if (addMatch[1] && addMatch[2]) {
        return { intent: 'cart_add', query: '', quantity: parseInt(addMatch[1]), itemNumber: parseInt(addMatch[2]) };
      } else if (addMatch[3]) {
        return { intent: 'cart_add', query: '', quantity: 1, itemNumber: parseInt(addMatch[3]) };
      }
    }

    // Cart: add by name — always active
    const addNameMatch = lower.match(/(?:agregar|añadir)\s+(.+?)\s+al\s+carrito/);
    if (addNameMatch) {
      return { intent: 'cart_add_by_name', query: addNameMatch[1] };
    }

    // Order lookup — always active
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

    // ── Strong explicit search patterns: these auto-activate shopping mode ──
    const strongPatterns = [
      /(?:buscar|busco|buscando)\s+.{2,}/,
      /(?:estoy|ando)\s+buscando\s+.{2,}/,
      /(?:producto|artículo|articulo).*(?:buscar|busco|buscando|precio|cuesta)/,
      /cu[aá]nto (?:cuesta|sale|vale)\s+.{2,}/,
      /(?:tenés|tenes|tienen)\s+.{3,}/,
      /(?:quiero|necesito|me interesa)\s+(?:comprar|ver|un|una|el|la|los|las)\s+.{2,}/,
      /(?:puedo|se\s+puede)\s+comprar\s+.{3,}/,
    ];
    for (const pattern of strongPatterns) {
      if (pattern.test(lower)) {
        if (conversationId) WooService.enterShoppingMode(conversationId);
        const cleanedQuery = WooService.extractProductQuery(text);
        return { intent: 'product_search', query: cleanedQuery };
      }
    }

    // ── Weaker patterns: only match when ALREADY in shopping mode ──
    if (inShopMode) {
      const weakPatterns = [
        /(?:hay|precio|cuesta|vale)\s+.{2,}/,
        /(?:quiero|necesito|me interesa)\s+(?:ver|un|una|el|la|los|las)\s+.{2,}/,
        /(?:stock|disponib|entrega inmediata)/i,
        /(?:venden|ofrecen|manejan|trabajan con)\s+.{2,}/,
        /(?:libros?|ejemplar)\s+(?:de|del|sobre)\s+.{2,}/,
        /(?:consegu[ií]r?|conseguir)\s+.{2,}/,
        /(?:libro|ejemplar|título|titulo)\s+.{2,}/,
      ];
      for (const pattern of weakPatterns) {
        if (pattern.test(lower)) {
          const cleanedQuery = WooService.extractProductQuery(text);
          return { intent: 'product_search', query: cleanedQuery };
        }
      }

      // In shopping mode, treat any unmatched text as a product search (the user is browsing)
      if (lower.length >= 3 && lower.length <= 80) {
        return { intent: 'product_search', query: text.replace(/[?!¿¡.,]+$/g, '').trim() };
      }
    }

    return null;
  }

  static markNoResults(conversationId: string) {
    pendingRetrySearch.add(conversationId);
  }

  static consumeRetrySearch(conversationId: string): boolean {
    if (pendingRetrySearch.has(conversationId)) {
      pendingRetrySearch.delete(conversationId);
      return true;
    }
    return false;
  }

  static extractProductQuery(text: string): string {
    let q = text.trim();
    const prefixes = [
      /^(?:hola[,!.]?\s*)/i,
      /^(?:estoy|ando)\s+buscando\s+/i,
      /^(?:tienen|tenes|tenés|hay|busco|buscar|buscando|quiero|necesito|me interesa)\s+/i,
      /^(?:cuánto|cuanto)\s+(?:cuesta|sale|vale)\s+/i,
      /^(?:venden|ofrecen|manejan)\s+/i,
      /^(?:libros?\s+(?:de|del|sobre))\s+/i,
      /^(?:quiero|necesito|me interesa)\s+(?:comprar|ver|saber|un|una|el|la|los|las)\s+/i,
      /^(?:puedo|se\s+puede)\s+comprar\s+(?:un|una|el|la|los|las)?\s*/i,
      /^(?:el|la|los|las|un|una)\s+/i,
      /^(?:libro)\s+/i,
    ];
    for (const prefix of prefixes) {
      q = q.replace(prefix, '');
    }
    q = q.replace(/\s+(?:por\s+)?(?:ac[aá]|aqu[ií])\s*$/i, '');
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
