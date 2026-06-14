import { prisma } from '../config/database';
import { env } from '../config/env';
import { BookingPricingService } from './booking-pricing.service';
import { BookingNotificationService } from './booking-notification.service';
import crypto from 'crypto';

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
  receiptToken?: string;
}

const DEFAULT_API_PUBLIC_URL = 'https://chatbot-volt-production.up.railway.app';

export class MercadoPagoService {
  static getApiPublicUrl(): string {
    return (env.API_PUBLIC_URL || DEFAULT_API_PUBLIC_URL).replace(/\/$/, '');
  }

  /** Webhook URL embedded in each preference — no MP Developers panel needed. */
  static buildNotificationUrl(tenantId: string): string {
    return `${this.getApiPublicUrl()}/api/webhooks/mercadopago/${tenantId}`;
  }

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
    notificationUrl: string;
  }> {
    const config = await this.getConfig(params.tenantId);
    if (!config?.accessToken) {
      throw new Error('Mercado Pago no configurado para este tenant');
    }

    const expiresAt = new Date(Date.now() + (params.expirationMinutes ?? 15) * 60 * 1000);
    const notificationUrl = this.buildNotificationUrl(params.tenantId);
    const baseUrl = this.getApiPublicUrl();
    const receiptPath = params.receiptToken
      ? `${baseUrl}/api/booking/receipt/${params.receiptToken}`
      : `${baseUrl}/health`;

    const body = {
      items: [{
        id: params.appointmentId,
        title: params.title,
        quantity: 1,
        unit_price: params.amount,
        currency_id: params.currency ?? 'ARS',
      }],
      external_reference: params.appointmentId,
      notification_url: notificationUrl,
      back_urls: {
        success: receiptPath,
        failure: receiptPath,
        pending: receiptPath,
      },
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
      notificationUrl,
    };
  }

  static async getPayment(tenantId: string, paymentId: string) {
    const config = await this.getConfig(tenantId);
    if (!config?.accessToken) throw new Error('Mercado Pago not configured');

    const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${config.accessToken}` },
    });
    if (!res.ok) throw new Error('Failed to fetch MP payment');
    return res.json() as Promise<{
      id: number;
      status: string;
      external_reference?: string;
      transaction_amount?: number;
    }>;
  }

  /**
   * Process MP notification: always verify payment via API, never trust webhook body.
   * Idempotent — repeated notifications for an already confirmed appointment are ignored.
   */
  static async processPaymentNotification(tenantId: string, paymentId: string): Promise<void> {
    const payment = await this.getPayment(tenantId, paymentId);
    const appointmentId = payment?.external_reference;
    const status = payment?.status;

    if (!appointmentId) return;

    const appointment = await prisma.appointment.findFirst({
      where: { id: appointmentId, tenantId },
      include: { service: true },
    });
    if (!appointment) return;

    // Idempotent: already confirmed — do not re-notify
    if (appointment.status === 'confirmado') return;

    if (status !== 'approved') {
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { mpPaymentId: String(paymentId), mpStatus: status },
      });
      return;
    }

    const settings = await prisma.bookingSettings.findUnique({
      where: { tenantId },
    });
    const depositPct = settings?.depositPercentage ?? 50;
    const paymentType = (appointment.paymentType === 'total' ? 'total' : 'sena') as 'sena' | 'total';
    const expectedAmount = BookingPricingService.computePaymentAmount(
      Number(appointment.finalPrice),
      paymentType,
      depositPct,
    );
    const paid = Number(payment.transaction_amount || 0);

    if (Math.abs(paid - expectedAmount) > 1) {
      console.warn(
        `⚠️ MP amount mismatch for appointment ${appointment.id}: expected ${expectedAmount}, got ${paid}`,
      );
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { mpPaymentId: String(paymentId), mpStatus: `amount_mismatch:${status}` },
      });
      return;
    }

    const balance = Math.max(0, Number(appointment.finalPrice) - paid);

    await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        status: 'confirmado',
        mpPaymentId: String(paymentId),
        mpStatus: status,
        amountPaid: paid,
        balanceDue: balance,
        confirmedAt: new Date(),
        receiptToken: appointment.receiptToken || crypto.randomBytes(16).toString('hex'),
      },
    });

    await BookingNotificationService.sendPaymentConfirmation(appointment.id);
  }
}
