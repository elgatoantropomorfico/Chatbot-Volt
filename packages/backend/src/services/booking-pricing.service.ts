import { prisma } from '../config/database';

export interface ResolvedPrice {
  listPrice: number;
  finalPrice: number;
  priceRuleId: string | null;
  discountLabel: string | null;
}

function toNumber(v: unknown): number {
  if (v == null) return 0;
  return typeof v === 'object' && v !== null && 'toNumber' in (v as object)
    ? (v as { toNumber: () => number }).toNumber()
    : Number(v);
}

export class BookingPricingService {
  /** All active price rules valid at a given instant (default: now). */
  static async getActivePriceRules(tenantId: string, at: Date = new Date()) {
    const rules = await prisma.bookingPriceRule.findMany({
      where: { tenantId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    return rules.filter((rule) => {
      if (rule.validFrom && at < rule.validFrom) return false;
      if (rule.validUntil && at > rule.validUntil) return false;
      return true;
    });
  }

  /** Active price rule for tenant at a given instant (default: now). */
  static async getActivePriceRule(tenantId: string, at: Date = new Date()) {
    const rules = await this.getActivePriceRules(tenantId, at);
    return rules[0] ?? null;
  }

  static resolveServiceListPrice(
    service: { price: unknown; usesBasePrice: boolean },
    settings: { basePrice: unknown },
  ): number {
    if (!service.usesBasePrice && service.price != null) {
      return toNumber(service.price);
    }
    return toNumber(settings.basePrice);
  }

  static applyRule(
    listPrice: number,
    rule: { id?: string; ruleType: string; value: unknown; label: string } | null,
  ): ResolvedPrice {
    if (!rule) {
      return { listPrice, finalPrice: listPrice, priceRuleId: null, discountLabel: null };
    }

    const value = toNumber(rule.value);
    let finalPrice = listPrice;

    if (rule.ruleType === 'percentage_discount') {
      finalPrice = Math.round(listPrice * (1 - value / 100));
    } else if (rule.ruleType === 'fixed_price') {
      finalPrice = value;
    } else if (rule.ruleType === 'label_only') {
      // 2x1 y similares: se cobra el precio de lista; la promo queda en la etiqueta
      finalPrice = listPrice;
    }

    return {
      listPrice,
      finalPrice,
      priceRuleId: rule.id ?? null,
      discountLabel: rule.label,
    };
  }

  /**
   * Resuelve precio de un servicio.
   * Si `priceRuleId` viene, usa esa promo (si sigue vigente).
   * Si no, aplica la primera promo activa (sortOrder).
   */
  static async resolvePrice(
    tenantId: string,
    serviceId: string,
    at: Date = new Date(),
    priceRuleId?: string | null,
  ): Promise<ResolvedPrice> {
    const [settings, byId, activeRules] = await Promise.all([
      prisma.bookingSettings.findUnique({ where: { tenantId } }),
      prisma.bookingService.findFirst({ where: { id: serviceId, tenantId } }),
      this.getActivePriceRules(tenantId, at),
    ]);

    // Fallback: a veces llegó el nombre del camino en lugar del id
    let service = byId;
    if (!service && serviceId) {
      service = await prisma.bookingService.findFirst({
        where: {
          tenantId,
          isActive: true,
          name: { equals: serviceId, mode: 'insensitive' },
        },
      });
    }

    if (!settings || !service) {
      throw new Error('Booking settings or service not found');
    }

    const listPrice = this.resolveServiceListPrice(service, settings);
    if (!listPrice) {
      throw new Error('No price configured for service');
    }

    let rule = null as (typeof activeRules)[number] | null;
    if (priceRuleId) {
      rule = activeRules.find((r) => r.id === priceRuleId) ?? null;
      if (!rule) {
        // Promo elegida ya no vigente: no aplicar otra automáticamente en checkout
        return { listPrice, finalPrice: listPrice, priceRuleId: null, discountLabel: null };
      }
    } else if (priceRuleId === undefined) {
      rule = activeRules[0] ?? null;
    }
    // priceRuleId === null → sin promo

    return this.applyRule(listPrice, rule);
  }

  static computePaymentAmount(
    finalPrice: number,
    paymentType: 'sena' | 'total',
    depositPercentage: number,
  ): number {
    if (paymentType === 'total') return finalPrice;
    return Math.round(finalPrice * (depositPercentage / 100));
  }

  /** Texto breve de promos (solo cuando preguntan por promociones, no en Ver precios). */
  static async formatActivePromosSummary(tenantId: string, basePrice?: number | null): Promise<string | null> {
    const rules = await this.getActivePriceRules(tenantId);
    if (!rules.length) return null;

    const fmt = (n: number) => `$${n.toLocaleString('es-AR')}`;
    const fmtDate = (d: Date) => d.toLocaleDateString('es-AR');
    const lines = rules.map((rule) => {
      const until = rule.validUntil ? ` (hasta ${fmtDate(rule.validUntil)})` : '';
      if (rule.ruleType === 'label_only') {
        return `• ${rule.label}${until}`;
      }
      if (basePrice) {
        const resolved = this.applyRule(basePrice, rule);
        if (rule.ruleType === 'percentage_discount') {
          return `• ${rule.label}: ${Number(rule.value)}% off → ${fmt(resolved.finalPrice)}${until}`;
        }
        return `• ${rule.label}: ${fmt(resolved.finalPrice)}${until}`;
      }
      if (rule.ruleType === 'percentage_discount') {
        return `• ${rule.label}: ${Number(rule.value)}% de descuento${until}`;
      }
      return `• ${rule.label}: ${fmt(Number(rule.value))}${until}`;
    });

    return `🎉 *Promos vigentes:*\n${lines.join('\n')}`;
  }

  /** Líneas de precio base + cada promo activa para un servicio. */
  static formatServicePriceLines(
    name: string,
    listPrice: number,
    durationMinutes: number,
    rules: Array<{ ruleType: string; value: unknown; label: string }>,
  ): string {
    const fmt = (n: number) => `$${n.toLocaleString('es-AR')}`;
    if (!listPrice) {
      return `• *${name}*: consultar (${durationMinutes} min)`;
    }

    const parts = [`• *${name}* (${durationMinutes} min)`, `  Base: ${fmt(listPrice)}`];
    for (const rule of rules) {
      const resolved = this.applyRule(listPrice, rule);
      if (rule.ruleType === 'label_only') {
        parts.push(`  ${rule.label}`);
      } else if (rule.ruleType === 'percentage_discount') {
        parts.push(`  ${rule.label}: ${fmt(resolved.finalPrice)} (${Number(rule.value)}% off)`);
      } else {
        parts.push(`  ${rule.label}: ${fmt(resolved.finalPrice)}`);
      }
    }
    return parts.join('\n');
  }

  /** Lista de precios por servicio: base + todas las promos (catalog v2 / Ver precios). */
  static async formatServicesPriceList(tenantId: string): Promise<string> {
    const [settings, services, rules] = await Promise.all([
      prisma.bookingSettings.findUnique({ where: { tenantId } }),
      prisma.bookingService.findMany({
        where: { tenantId, isActive: true },
        orderBy: { sortOrder: 'asc' },
      }),
      this.getActivePriceRules(tenantId),
    ]);
    if (!settings || !services.length) {
      return 'Consultá el precio al confirmar el servicio.';
    }

    const lines = services.map((svc) => {
      const listPrice = this.resolveServiceListPrice(svc, settings);
      const dur = svc.durationMinutes || settings.sessionDurationMinutes || 80;
      return this.formatServicePriceLines(svc.name, listPrice || 0, dur, rules);
    });
    return lines.join('\n\n');
  }
}
