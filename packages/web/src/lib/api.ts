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
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
        ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
      },
    };

    if (body !== undefined) {
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
  async updateTenantDisplayName(displayName: string) {
    return this.fetch<{ tenant: { id: string; name: string; displayName: string | null; status: string } }>(
      '/tenants/me/display-name',
      { method: 'PATCH', body: { displayName } },
    );
  }
  async deleteTenant(id: string) { return this.fetch(`/tenants/${id}`, { method: 'DELETE' }); }

  // Channels
  async getChannels() { return this.fetch<{ channels: any[] }>('/channels'); }
  async createChannel(data: any) { return this.fetch<{ channel: any }>('/channels', { method: 'POST', body: data }); }
  async updateChannel(id: string, data: any) { return this.fetch<{ channel: any }>(`/channels/${id}`, { method: 'PATCH', body: data }); }
  async deleteChannel(id: string) { return this.fetch<{ message: string; conversationsRemoved?: number }>(`/channels/${id}`, { method: 'DELETE' }); }

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
  async deleteLeadNote(leadId: string, noteId: string) { return this.fetch<{ message: string }>(`/leads/${leadId}/notes/${noteId}`, { method: 'DELETE' }); }
  async deleteLead(id: string) { return this.fetch<{ message: string }>(`/leads/${id}`, { method: 'DELETE' }); }

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
  async dashboardSearch(q: string, limit = 12) {
    return this.fetch<{ results: Array<{
      type: 'conversation' | 'lead' | 'appointment' | 'sale';
      id: string;
      title: string;
      subtitle: string;
      badge?: string;
      href: string;
    }> }>(`/dashboard/search?q=${encodeURIComponent(q)}&limit=${limit}`);
  }

  // Offers
  async getOffers(tenantId?: string) {
    const qs = tenantId ? `?tenantId=${tenantId}` : '';
    return this.fetch<{ offers: any[] }>(`/offers${qs}`);
  }
  async createOffer(data: any) { return this.fetch<{ offer: any }>('/offers', { method: 'POST', body: data }); }
  async updateOffer(id: string, data: any) { return this.fetch<{ offer: any }>(`/offers/${id}`, { method: 'PATCH', body: data }); }
  async deleteOffer(id: string) { return this.fetch<{ message: string }>(`/offers/${id}`, { method: 'DELETE' }); }

  // Zoho Field Configs
  async getZohoFields(tenantId?: string) {
    const qs = tenantId ? `?tenantId=${tenantId}` : '';
    return this.fetch<{ fields: any[] }>(`/zoho-fields${qs}`);
  }
  async createZohoField(data: any) { return this.fetch<{ field: any }>('/zoho-fields', { method: 'POST', body: data }); }
  async updateZohoField(id: string, data: any) { return this.fetch<{ field: any }>(`/zoho-fields/${id}`, { method: 'PATCH', body: data }); }
  async deleteZohoField(id: string) { return this.fetch<{ message: string }>(`/zoho-fields/${id}`, { method: 'DELETE' }); }

  // Zoho Sync
  async syncLeadToZoho(leadId: string) { return this.fetch<{ message: string; zohoContactId: string }>(`/leads/${leadId}/sync-zoho`, { method: 'POST' }); }

  // Pilot Field Configs
  async getPilotFields(tenantId?: string) {
    const qs = tenantId ? `?tenantId=${tenantId}` : '';
    return this.fetch<{ fields: any[] }>(`/pilot-fields${qs}`);
  }
  async createPilotField(data: any) { return this.fetch<{ field: any }>('/pilot-fields', { method: 'POST', body: data }); }
  async updatePilotField(id: string, data: any) { return this.fetch<{ field: any }>(`/pilot-fields/${id}`, { method: 'PATCH', body: data }); }
  async deletePilotField(id: string) { return this.fetch<{ message: string }>(`/pilot-fields/${id}`, { method: 'DELETE' }); }

  // Pilot Sync
  async syncLeadToPilot(leadId: string) {
    return this.fetch<{ message: string; pilotContactId: string }>(`/leads/${leadId}/sync-pilot`, { method: 'POST' });
  }

  // Bot flow preview
  async getFlowPreview(tenantId: string) {
    return this.fetch<any>(`/bot-settings/${tenantId}/flow-preview`);
  }

  // Lead Field Configs
  async getLeadFieldConfigs(tenantId?: string) {
    const qs = tenantId ? `?tenantId=${tenantId}` : '';
    return this.fetch<{ fields: any[] }>(`/lead-fields${qs}`);
  }

  // Lead Photos
  async getLeadPhotos(leadId: string) { return this.fetch<{ photos: any[] }>(`/leads/${leadId}/photos`); }

  // Lead Requests (turnos / presupuestos / pedidos por lead)
  async getLeadRequests(leadId: string) {
    return this.fetch<{ requests: any[] }>(`/leads/${leadId}/requests`);
  }
  async createLeadRequest(leadId: string, data?: { label?: string }) {
    return this.fetch<{ request: any }>(`/leads/${leadId}/requests`, { method: 'POST', body: data || {} });
  }
  async updateLeadRequest(leadId: string, requestId: string, data: { status?: string; data?: Record<string, any>; label?: string | null }) {
    return this.fetch<{ request: any }>(`/leads/${leadId}/requests/${requestId}`, { method: 'PATCH', body: data });
  }
  async deleteLeadRequest(leadId: string, requestId: string) {
    return this.fetch<{ message: string }>(`/leads/${leadId}/requests/${requestId}`, { method: 'DELETE' });
  }

  // Sales
  async getSales(params?: Record<string, string>) {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.fetch<{ sales: any[]; total: number; page: number; totalPages: number }>(`/sales${qs}`);
  }
  async getSaleStats() { return this.fetch<{ stats: any }>('/sales/stats'); }
  async getSale(id: string) { return this.fetch<{ sale: any }>(`/sales/${id}`); }
  async updateSale(id: string, data: any) { return this.fetch<{ sale: any }>(`/sales/${id}`, { method: 'PATCH', body: data }); }
  async deleteSale(id: string) { return this.fetch<{ message: string }>(`/sales/${id}`, { method: 'DELETE' }); }

  // Booking / Turnera
  async getBookingSettings() { return this.fetch<{ settings: any }>('/booking/settings'); }
  async updateBookingSettings(data: any) { return this.fetch<{ settings: any }>('/booking/settings', { method: 'PATCH', body: data }); }
  async getBookingServices() { return this.fetch<{ services: any[] }>('/booking/services'); }
  async createBookingService(data: any) { return this.fetch<{ service: any }>('/booking/services', { method: 'POST', body: data }); }
  async updateBookingService(id: string, data: any) { return this.fetch<{ service: any }>(`/booking/services/${id}`, { method: 'PATCH', body: data }); }
  async deleteBookingService(id: string) { return this.fetch<{ message: string }>(`/booking/services/${id}`, { method: 'DELETE' }); }
  async getBookingSlots() { return this.fetch<{ slots: any[] }>('/booking/slots'); }
  async createBookingSlot(data: any) { return this.fetch<{ slot: any }>('/booking/slots', { method: 'POST', body: data }); }
  async updateBookingSlot(id: string, data: any) { return this.fetch<{ slot: any }>(`/booking/slots/${id}`, { method: 'PATCH', body: data }); }
  async deleteBookingSlot(id: string) { return this.fetch<{ message: string }>(`/booking/slots/${id}`, { method: 'DELETE' }); }
  async getBookingBlocks() { return this.fetch<{ blocks: any[] }>('/booking/blocks'); }
  async createBookingBlock(data: any) { return this.fetch<{ block: any }>('/booking/blocks', { method: 'POST', body: data }); }
  async deleteBookingBlock(id: string) { return this.fetch<{ message: string }>(`/booking/blocks/${id}`, { method: 'DELETE' }); }
  async getBookingPriceRules() { return this.fetch<{ rules: any[] }>('/booking/price-rules'); }
  async createBookingPriceRule(data: any) { return this.fetch<{ rule: any }>('/booking/price-rules', { method: 'POST', body: data }); }
  async updateBookingPriceRule(id: string, data: any) { return this.fetch<{ rule: any }>(`/booking/price-rules/${id}`, { method: 'PATCH', body: data }); }
  async deleteBookingPriceRule(id: string) { return this.fetch<{ message: string }>(`/booking/price-rules/${id}`, { method: 'DELETE' }); }
  async getAppointments(params?: Record<string, string>) {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.fetch<{ appointments: any[] }>(`/booking/appointments${qs}`);
  }
  async getAppointment(id: string) { return this.fetch<{ appointment: any }>(`/booking/appointments/${id}`); }
  async createAppointment(data: any) { return this.fetch<{ appointment: any }>('/booking/appointments', { method: 'POST', body: data }); }
  async updateAppointment(id: string, data: any) { return this.fetch<{ appointment: any }>(`/booking/appointments/${id}`, { method: 'PATCH', body: data }); }
  async deleteAppointment(id: string) { return this.fetch<{ message: string }>(`/booking/appointments/${id}`, { method: 'DELETE' }); }
}

export const api = new ApiClient();
