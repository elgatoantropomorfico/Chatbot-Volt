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

  static async sendTextMessage({ phoneNumberId, to, text }: SendMessageParams): Promise<string | null> {
    try {
      const response = await axios.post(
        this.getApiUrl(phoneNumberId),
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
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
