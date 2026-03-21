import axios from 'axios';

export interface ZohoConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accountsUrl?: string;
  apiUrl?: string;
  moduleApiName: string;
  dedupeField: string;
  fieldMapping: Record<string, string>;
  fixedValues?: Record<string, string>;
}

interface ZohoTokens {
  accessToken: string;
  expiresAt: number;
}

// In-memory token cache per tenant (keyed by clientId)
const tokenCache = new Map<string, ZohoTokens>();

export class ZohoService {
  private config: ZohoConfig;

  constructor(config: ZohoConfig) {
    this.config = {
      accountsUrl: 'https://accounts.zoho.com',
      apiUrl: 'https://www.zohoapis.com',
      ...config,
    };
  }

  /**
   * Gets a valid access token, renewing if expired
   */
  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    const cached = tokenCache.get(this.config.clientId);

    if (cached && cached.expiresAt > now + 60_000) {
      return cached.accessToken;
    }

    console.log('🔄 Renovando Zoho access token...');
    const response = await axios.post(
      `${this.config.accountsUrl}/oauth/v2/token`,
      null,
      {
        params: {
          refresh_token: this.config.refreshToken,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          grant_type: 'refresh_token',
        },
      }
    );

    if (response.data.error) {
      throw new Error(`Zoho token error: ${response.data.error}`);
    }

    const tokens: ZohoTokens = {
      accessToken: response.data.access_token,
      expiresAt: now + (response.data.expires_in || 3600) * 1000,
    };

    tokenCache.set(this.config.clientId, tokens);
    console.log('✅ Zoho access token renovado');
    return tokens.accessToken;
  }

  /**
   * Search contact by dedupe field (Mobile)
   */
  async searchContact(phoneNumber: string): Promise<any | null> {
    const accessToken = await this.getAccessToken();
    const field = this.config.dedupeField;

    try {
      const response = await axios.get(
        `${this.config.apiUrl}/crm/v2/${this.config.moduleApiName}/search`,
        {
          headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
          params: { criteria: `(${field}:equals:${phoneNumber})` },
        }
      );

      if (response.data?.data?.length > 0) {
        return response.data.data[0];
      }
      return null;
    } catch (err: any) {
      if (err.response?.status === 204 || err.response?.data?.code === 'NO_DATA') {
        return null;
      }
      throw err;
    }
  }

  /**
   * Create a contact in Zoho CRM
   */
  async createContact(leadData: Record<string, any>): Promise<string> {
    const accessToken = await this.getAccessToken();
    const payload = this.buildPayload(leadData);

    console.log('📤 Zoho CREATE payload:', JSON.stringify(payload));

    const response = await axios.post(
      `${this.config.apiUrl}/crm/v2/${this.config.moduleApiName}`,
      { data: [payload] },
      {
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const result = response.data?.data?.[0];
    if (result?.code === 'SUCCESS') {
      console.log(`✅ Zoho contact created: ${result.details.id}`);
      return result.details.id;
    }

    throw new Error(`Zoho create failed: ${JSON.stringify(response.data)}`);
  }

  /**
   * Update a contact in Zoho CRM
   */
  async updateContact(zohoContactId: string, leadData: Record<string, any>): Promise<void> {
    const accessToken = await this.getAccessToken();
    const payload = this.buildPayload(leadData);

    console.log('📤 Zoho UPDATE payload:', JSON.stringify(payload));

    const response = await axios.put(
      `${this.config.apiUrl}/crm/v2/${this.config.moduleApiName}/${zohoContactId}`,
      { data: [payload] },
      {
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const result = response.data?.data?.[0];
    if (result?.code === 'SUCCESS') {
      console.log(`✅ Zoho contact updated: ${zohoContactId}`);
      return;
    }

    throw new Error(`Zoho update failed: ${JSON.stringify(response.data)}`);
  }

  /**
   * Build Zoho payload from local lead data using field mapping
   */
  private buildPayload(leadData: Record<string, any>): Record<string, any> {
    const payload: Record<string, any> = {};

    for (const [localField, zohoField] of Object.entries(this.config.fieldMapping)) {
      if (leadData[localField] !== undefined && leadData[localField] !== null && leadData[localField] !== '') {
        payload[zohoField] = leadData[localField];
      }
    }

    if (this.config.fixedValues) {
      Object.assign(payload, this.config.fixedValues);
    }

    if (!payload['Fecha_de_contacto']) {
      payload['Fecha_de_contacto'] = new Date().toISOString().split('T')[0];
    }

    return payload;
  }
}
