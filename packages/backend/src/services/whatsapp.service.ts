import axios from 'axios';
import { env } from '../config/env';

interface SendMessageParams {
  phoneNumberId: string;
  to: string;
  text: string;
}

export interface WaButton {
  id: string;
  title: string;
}

export interface WaListRow {
  id: string;
  title: string;
  description?: string;
}

export interface SendInteractiveParams {
  phoneNumberId: string;
  to: string;
  body: string;
  type: 'button' | 'list';
  buttons?: WaButton[];
  listButtonText?: string;
  listRows?: WaListRow[];
  listSectionTitle?: string;
}

export class WhatsAppService {
  private static getApiUrl(phoneNumberId: string) {
    return `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${phoneNumberId}/messages`;
  }

  private static get headers() {
    return {
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    };
  }

  private static normalizePhoneNumber(phone: string): string {
    if (phone.startsWith('549') && phone.length === 13) {
      const normalized = '54' + phone.slice(3);
      console.log(`📱 Normalized AR number: ${phone} → ${normalized}`);
      return normalized;
    }
    return phone;
  }

  /** Business line in E164 digits (no +) — for wa.me return links after checkout. */
  static async getBusinessPhoneE164(phoneNumberId: string): Promise<string | null> {
    if (!env.WHATSAPP_ACCESS_TOKEN) return null;
    try {
      const response = await axios.get(
        `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${phoneNumberId}`,
        {
          params: { fields: 'display_phone_number' },
          headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` },
        },
      );
      const raw = response.data?.display_phone_number as string | undefined;
      if (!raw) return null;
      return raw.replace(/\D/g, '');
    } catch (err: any) {
      console.warn('⚠️ Could not fetch WA business phone:', err.response?.data || err.message);
      return null;
    }
  }

  static async downloadMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const metaRes = await axios.get(
      `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${mediaId}`,
      { headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` } },
    );
    const mediaUrl = metaRes.data.url;
    const mimeType = metaRes.data.mime_type || 'image/jpeg';

    const fileRes = await axios.get(mediaUrl, {
      headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` },
      responseType: 'arraybuffer',
    });

    console.log(`📥 Downloaded media ${mediaId}: ${fileRes.data.byteLength} bytes, ${mimeType}`);
    return { buffer: Buffer.from(fileRes.data), mimeType };
  }

  static async sendTextMessage({ phoneNumberId, to, text }: SendMessageParams): Promise<string | null> {
    const normalizedTo = this.normalizePhoneNumber(to);
    try {
      const response = await axios.post(
        this.getApiUrl(phoneNumberId),
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: normalizedTo,
          type: 'text',
          text: { preview_url: true, body: text },
        },
        { headers: this.headers },
      );

      const messageId = response.data?.messages?.[0]?.id || null;
      console.log(`✅ WhatsApp message sent to ${to}, id: ${messageId}`);
      return messageId;
    } catch (err: any) {
      console.error('❌ WhatsApp send error:', err.response?.data || err.message);
      throw new Error(`Failed to send WhatsApp message: ${err.message}`);
    }
  }

  static async sendInteractive(params: SendInteractiveParams): Promise<string | null> {
    const normalizedTo = this.normalizePhoneNumber(params.to);
    let interactive: Record<string, unknown>;

    if (params.type === 'button' && params.buttons?.length) {
      interactive = {
        type: 'button',
        body: { text: params.body },
        action: {
          buttons: params.buttons.slice(0, 3).map((b) => ({
            type: 'reply',
            reply: { id: b.id, title: b.title.slice(0, 20) },
          })),
        },
      };
    } else if (params.type === 'list' && params.listRows?.length) {
      interactive = {
        type: 'list',
        body: { text: params.body },
        action: {
          button: (params.listButtonText || 'Ver opciones').slice(0, 20),
          sections: [{
            title: (params.listSectionTitle || 'Opciones').slice(0, 24),
            rows: params.listRows.slice(0, 10).map((r) => ({
              id: r.id,
              title: r.title.slice(0, 24),
              description: (r.description || '').slice(0, 72),
            })),
          }],
        },
      };
    } else {
      return this.sendTextMessage({ phoneNumberId: params.phoneNumberId, to: params.to, text: params.body });
    }

    try {
      const response = await axios.post(
        this.getApiUrl(params.phoneNumberId),
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: normalizedTo,
          type: 'interactive',
          interactive,
        },
        { headers: this.headers },
      );
      const messageId = response.data?.messages?.[0]?.id || null;
      console.log(`✅ WhatsApp interactive sent to ${params.to}, id: ${messageId}`);
      return messageId;
    } catch (err: any) {
      console.error('❌ WhatsApp interactive error:', err.response?.data || err.message);
      return this.sendTextMessage({ phoneNumberId: params.phoneNumberId, to: params.to, text: params.body });
    }
  }
}
