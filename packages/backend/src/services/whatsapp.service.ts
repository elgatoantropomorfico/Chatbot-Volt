import axios from 'axios';
import { env } from '../config/env';

interface SendMessageParams {
  phoneNumberId: string;
  to: string;
  text: string;
}

export class WhatsAppService {
  private static getApiUrl(phoneNumberId: string) {
    return `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${phoneNumberId}/messages`;
  }

  // Argentine numbers: webhook sends 549XXXXXXXXXX but API expects 54XXXXXXXXXX
  private static normalizePhoneNumber(phone: string): string {
    if (phone.startsWith('549') && phone.length === 13) {
      const normalized = '54' + phone.slice(3);
      console.log(`📱 Normalized AR number: ${phone} → ${normalized}`);
      return normalized;
    }
    return phone;
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
          text: { preview_url: false, body: text },
        },
        {
          headers: {
            Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const messageId = response.data?.messages?.[0]?.id || null;
      console.log(`✅ WhatsApp message sent to ${to}, id: ${messageId}`);
      return messageId;
    } catch (err: any) {
      console.error('❌ WhatsApp send error:', err.response?.data || err.message);
      throw new Error(`Failed to send WhatsApp message: ${err.message}`);
    }
  }
}
