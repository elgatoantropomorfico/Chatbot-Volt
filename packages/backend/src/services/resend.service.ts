import axios from 'axios';
import { prisma } from '../config/database';

export interface ResendConfig {
  apiKey: string;
  fromEmail: string;
  fromName?: string;
}

export class ResendService {
  static async getConfig(tenantId: string): Promise<ResendConfig | null> {
    const integration = await prisma.integration.findFirst({
      where: { tenantId, type: 'resend', status: 'active' },
    });
    if (!integration) return null;
    try {
      const config = JSON.parse(integration.configEncrypted) as ResendConfig;
      if (!config.apiKey || !config.fromEmail) return null;
      return config;
    } catch {
      return null;
    }
  }

  static async sendEmail(params: {
    tenantId: string;
    to: string | string[];
    subject: string;
    html: string;
    replyTo?: string;
  }): Promise<void> {
    const config = await this.getConfig(params.tenantId);
    if (!config) throw new Error('Resend no configurado para este tenant');

    const from = config.fromName
      ? `${config.fromName} <${config.fromEmail}>`
      : config.fromEmail;

    const to = Array.isArray(params.to) ? params.to : [params.to];

    try {
      await axios.post(
        'https://api.resend.com/emails',
        {
          from,
          to,
          subject: params.subject,
          html: params.html,
          ...(params.replyTo ? { reply_to: params.replyTo } : {}),
        },
        {
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        },
      );
    } catch (err: any) {
      const detail = err.response?.data?.message || err.response?.data?.error || err.message;
      throw new Error(`Resend API: ${detail}`);
    }
  }
}