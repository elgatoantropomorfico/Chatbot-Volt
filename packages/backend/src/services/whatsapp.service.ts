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

  /**
   * Download media from WhatsApp Cloud API by media ID.
   * Two-step: first get the media URL, then download the binary.
   */
  static async downloadMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }> {
    // Step 1: Get media URL
    const metaRes = await axios.get(
      `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${mediaId}`,
      { headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` } },
    );
    const mediaUrl = metaRes.data.url;
    const mimeType = metaRes.data.mime_type || 'image/jpeg';

    // Step 2: Download the binary
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
