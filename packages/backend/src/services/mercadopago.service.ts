import { prisma } from '../config/database';

export interface MercadoPagoConfig {
  accessToken: string;
  publicKey?: string;
}

export interface CreatePreferenceParams {
  tenantId: string;
  appointmentId: string;
  title: string;
  amount: number;
  currency?: string;
  expirationMinutes?: number;
}

export class MercadoPagoService {
  static async getConfig(tenantId: string): Promise<MercadoPagoConfig | null> {
    const integration = await prisma.integration.findFirst({
      where: { tenantId, type: 'mercadopago', status: 'active' },
    });
    if (!integration) return null;
    try {
      const config = JSON.parse(integration.configEncrypted) as MercadoPagoConfig;
      if (!config.accessToken) return null;
      return config;
    } catch {
      return null;
    }
  }

  static isConfigured(tenantId: string): Promise<boolean> {
    return this.getConfig(tenantId).then((c) => !!c?.accessToken);
  }

  /** Create MP checkout preference — amount comes from appointment record in DB. */
  static async createPreference(params: CreatePreferenceParams): Promise<{
    preferenceId: string;
    initPoint: string;
  }> {
    const config = await this.getConfig(params.tenantId);
    if (!config?.accessToken) {
      throw new Error('Mercado Pago no configurado para este tenant');
    }

    const expiresAt = new Date(Date.now() + (params.expirationMinutes ?? 15) * 60 * 1000);

    const body = {
      items: [{
        id: params.appointmentId,
        title: params.title,
        quantity: 1,
        unit_price: params.amount,
        currency_id: params.currency ?? 'ARS',
      }],
      external_reference: params.appointmentId,
      expiration_date_to: expiresAt.toISOString(),
      auto_return: 'approved',
    };

    const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Mercado Pago preference error: ${errText.slice(0, 300)}`);
    }

    const data = await res.json() as { id: string; init_point: string; sandbox_init_point?: string };
    return {
      preferenceId: data.id,
      initPoint: data.init_point || data.sandbox_init_point || '',
    };
  }

  static async getPayment(tenantId: string, paymentId: string) {
    const config = await this.getConfig(tenantId);
    if (!config?.accessToken) throw new Error('Mercado Pago not configured');

    const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${config.accessToken}` },
    });
    if (!res.ok) throw new Error('Failed to fetch MP payment');
    return res.json();
  }
}
