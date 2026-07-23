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
    }

    return {
      listPrice,
      finalPrice,
      priceRuleId: rule.id ?? null,
      discountLabel: rule.label,
    };
  }

  static async resolvePrice(
    tenantId: string,
    serviceId: string,
    at: Date = new Date(),
  ): Promise<ResolvedPrice> {
    const [settings, byId, rule] = await Promise.all([
      prisma.bookingSettings.findUnique({ where: { tenantId } }),
      prisma.bookingService.findFirst({ where: { id: serviceId, tenantId } }),
      this.getActivePriceRule(tenantId, at),
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

    const resolved = this.applyRule(listPrice, rule);
    return {
      ...resolved,
      priceRuleId: rule?.id ?? null,
    };
  }

  static computePaymentAmount(
    finalPrice: number,
    paymentType: 'sena' | 'total',
    depositPercentage: number,
  ): number {
    if (paymentType === 'total') return finalPrice;
    return Math.round(finalPrice * (depositPercentage / 100));
  }

  /** Texto breve para mostrar promos activas (menú "Ver precios", etc.). */
  static async formatActivePromosSummary(tenantId: string, basePrice?: number | null): Promise<string | null> {
    const rules = await this.getActivePriceRules(tenantId);
    if (!rules.length) return null;

    const fmt = (n: number) => `$${n.toLocaleString('es-AR')}`;
    const fmtDate = (d: Date) => d.toLocaleDateString('es-AR');
    const lines = rules.map((rule) => {
      const until = rule.validUntil ? ` (hasta ${fmtDate(rule.validUntil)})` : '';
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

  /** Lista de precios por servicio activo (catalog v2 / Ver precios). */
  static async formatServicesPriceList(tenantId: string): Promise<string> {
    const [settings, services, rule] = await Promise.all([
      prisma.bookingSettings.findUnique({ where: { tenantId } }),
      prisma.bookingService.findMany({
        where: { tenantId, isActive: true },
        orderBy: { sortOrder: 'asc' },
      }),
      this.getActivePriceRule(tenantId),
    ]);
    if (!settings || !services.length) {
      return 'Consultá el precio al confirmar el servicio.';
    }

    const fmt = (n: number) => `$${n.toLocaleString('es-AR')}`;
    const lines = services.map((svc) => {
      const listPrice = this.resolveServiceListPrice(svc, settings);
      const resolved = this.applyRule(listPrice || 0, rule);
      const dur = svc.durationMinutes || settings.sessionDurationMinutes || 80;
      let line = `• *${svc.name}*: ${listPrice ? fmt(resolved.finalPrice) : 'consultar'} (${dur} min)`;
      if (resolved.discountLabel && listPrice) line += ` — ${resolved.discountLabel}`;
      return line;
    });
    return lines.join('\n');
  }
}
