const API_BASE = '/api';

interface ApiOptions {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
}

class ApiClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.accessToken = localStorage.getItem('volt_access_token');
      this.refreshToken = localStorage.getItem('volt_refresh_token');
    }
  }

  setTokens(accessToken: string, refreshToken: string) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    localStorage.setItem('volt_access_token', accessToken);
    localStorage.setItem('volt_refresh_token', refreshToken);
  }

  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    localStorage.removeItem('volt_access_token');
    localStorage.removeItem('volt_refresh_token');
  }

  getAccessToken() {
    return this.accessToken;
  }

  private async refreshAccessToken(): Promise<boolean> {
    if (!this.refreshToken) return false;

    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });

      if (!res.ok) return false;

      const data = await res.json();
      this.setTokens(data.accessToken, data.refreshToken);
      return true;
    } catch {
      return false;
    }
  }

  async fetch<T = any>(path: string, options: ApiOptions = {}): Promise<T> {
    const { method = 'GET', body, headers = {} } = options;

    const fetchOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
        ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
      },
    };

    if (body) {
      fetchOptions.body = JSON.stringify(body);
    }

    let res = await fetch(`${API_BASE}${path}`, fetchOptions);

    // If 401, try to refresh token
    if (res.status === 401 && this.refreshToken) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        (fetchOptions.headers as Record<string, string>).Authorization = `Bearer ${this.accessToken}`;
        res = await fetch(`${API_BASE}${path}`, fetchOptions);
      }
    }

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `API Error: ${res.status}`);
    }

    return res.json();
  }

  // Auth
  async login(email: string, password: string) {
    const data = await this.fetch<{
      accessToken: string;
      refreshToken: string;
      user: any;
    }>('/auth/login', { method: 'POST', body: { email, password } });
    this.setTokens(data.accessToken, data.refreshToken);
    return data;
  }

  async logout() {
    try {
      await this.fetch('/auth/logout', {
        method: 'POST',
        body: { refreshToken: this.refreshToken },
      });
    } finally {
      this.clearTokens();
    }
  }

  async getMe() {
    return this.fetch<{ user: any }>('/users/me');
  }

  // Tenants
  async getTenants() { return this.fetch<{ tenants: any[] }>('/tenants'); }
  async getTenant(id: string) { return this.fetch<{ tenant: any }>(`/tenants/${id}`); }
  async createTenant(data: any) { return this.fetch<{ tenant: any }>('/tenants', { method: 'POST', body: data }); }
  async updateTenant(id: string, data: any) { return this.fetch<{ tenant: any }>(`/tenants/${id}`, { method: 'PATCH', body: data }); }
  async deleteTenant(id: string) { return this.fetch(`/tenants/${id}`, { method: 'DELETE' }); }

  // Channels
  async getChannels() { return this.fetch<{ channels: any[] }>('/channels'); }
  async createChannel(data: any) { return this.fetch<{ channel: any }>('/channels', { method: 'POST', body: data }); }
  async updateChannel(id: string, data: any) { return this.fetch<{ channel: any }>(`/channels/${id}`, { method: 'PATCH', body: data }); }

  // Users
  async getUsers() { return this.fetch<{ users: any[] }>('/users'); }
  async createUser(data: any) { return this.fetch<{ user: any }>('/users', { method: 'POST', body: data }); }
  async updateUser(id: string, data: any) { return this.fetch<{ user: any }>(`/users/${id}`, { method: 'PATCH', body: data }); }
  async updateProfile(data: { name?: string; password?: string }) { return this.fetch<{ user: any }>('/users/me', { method: 'PATCH', body: data }); }

  // Leads
  async getLeads(params?: Record<string, string>) {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.fetch<{ leads: any[]; total: number; page: number; totalPages: number }>(`/leads${qs}`);
  }
  async getLead(id: string) { return this.fetch<{ lead: any }>(`/leads/${id}`); }
  async updateLead(id: string, data: any) { return this.fetch<{ lead: any }>(`/leads/${id}`, { method: 'PATCH', body: data }); }
  async addLeadNote(id: string, content: string) { return this.fetch<{ note: any }>(`/leads/${id}/notes`, { method: 'POST', body: { content } }); }

  // Conversations
  async getConversations(params?: Record<string, string>) {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.fetch<{ conversations: any[]; total: number }>(`/conversations${qs}`);
  }
  async getConversation(id: string) { return this.fetch<{ conversation: any }>(`/conversations/${id}`); }
  async handoffConversation(id: string, reason?: string) { return this.fetch(`/conversations/${id}/handoff`, { method: 'POST', body: { reason } }); }
  async reactivateConversation(id: string) { return this.fetch(`/conversations/${id}/reactivate`, { method: 'POST' }); }
  async closeConversation(id: string) { return this.fetch(`/conversations/${id}/close`, { method: 'POST' }); }
  async archiveConversation(id: string) { return this.fetch(`/conversations/${id}/archive`, { method: 'POST', body: {} }); }
  async unarchiveConversation(id: string) { return this.fetch(`/conversations/${id}/unarchive`, { method: 'POST', body: {} }); }
  async sendAgentMessage(id: string, text: string) { return this.fetch<{ message: any; aiPaused: boolean }>(`/conversations/${id}/send`, { method: 'POST', body: { text } }); }
  async toggleAI(id: string, enabled: boolean) { return this.fetch<{ conversation: any; aiEnabled: boolean }>(`/conversations/${id}/toggle-ai`, { method: 'POST', body: { enabled } }); }
  async resetConversationContext(id: string) { return this.fetch(`/conversations/${id}/reset-context`, { method: 'POST', body: {} }); }
  async resetAllContexts(tenantId?: string) { return this.fetch(`/conversations/reset-all-contexts`, { method: 'POST', body: tenantId ? { tenantId } : {} }); }
  async pollMessages(id: string, since?: string) {
    const qs = since ? `?since=${encodeURIComponent(since)}` : '';
    return this.fetch<{ messages: any[]; status: string }>(`/conversations/${id}/messages${qs}`);
  }

  // Bot Settings
  async getBotSettings(tenantId: string) { return this.fetch<{ settings: any }>(`/bot-settings/${tenantId}`); }
  async updateBotSettings(tenantId: string, data: any) { return this.fetch<{ settings: any }>(`/bot-settings/${tenantId}`, { method: 'PATCH', body: data }); }
  async generateField(tenantId: string, data: { section: string; field: string; currentValue?: string; promptBuilderJson: any }) {
    return this.fetch<{ generated: string }>(`/bot-settings/${tenantId}/generate-field`, { method: 'POST', body: data });
  }

  // Integrations
  async getIntegrations() { return this.fetch<{ integrations: any[] }>('/integrations'); }
  async createIntegration(data: any) { return this.fetch<{ integration: any }>('/integrations', { method: 'POST', body: data }); }
  async updateIntegration(id: string, data: any) { return this.fetch<{ integration: any }>(`/integrations/${id}`, { method: 'PATCH', body: data }); }
  async deleteIntegration(id: string) { return this.fetch<{ message: string }>(`/integrations/${id}`, { method: 'DELETE' }); }

  // Dashboard
  async getDashboardStats() { return this.fetch<any>('/dashboard/stats'); }
  async getDashboardActions() { return this.fetch<{ actions: any[] }>('/dashboard/actions'); }

  // Offers
  async getOffers(tenantId?: string) {
    const qs = tenantId ? `?tenantId=${tenantId}` : '';
    return this.fetch<{ offers: any[] }>(`/offers${qs}`);
  }
  async createOffer(data: any) { return this.fetch<{ offer: any }>('/offers', { method: 'POST', body: data }); }
  async updateOffer(id: string, data: any) { return this.fetch<{ offer: any }>(`/offers/${id}`, { method: 'PATCH', body: data }); }
  async deleteOffer(id: string) { return this.fetch<{ message: string }>(`/offers/${id}`, { method: 'DELETE' }); }

  // Zoho Sync
  async syncLeadToZoho(leadId: string) { return this.fetch<{ message: string; zohoContactId: string }>(`/leads/${leadId}/sync-zoho`, { method: 'POST' }); }

  // Sales
  async getSales(params?: Record<string, string>) {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.fetch<{ sales: any[]; total: number; page: number; totalPages: number }>(`/sales${qs}`);
  }
  async getSaleStats() { return this.fetch<{ stats: any }>('/sales/stats'); }
  async getSale(id: string) { return this.fetch<{ sale: any }>(`/sales/${id}`); }
  async updateSale(id: string, data: any) { return this.fetch<{ sale: any }>(`/sales/${id}`, { method: 'PATCH', body: data }); }
  async deleteSale(id: string) { return this.fetch<{ message: string }>(`/sales/${id}`, { method: 'DELETE' }); }
}

export const api = new ApiClient();
