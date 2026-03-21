import { prisma } from '../config/database';
import { ZohoService } from './zoho.service';
import { LeadProfileService } from './lead-profile.service';

// Normalize extracted modality values to Zoho picklist values
const MODALITY_MAP: Record<string, string> = {
  'presencial': 'Presencial',
  'a distancia': 'A Distancia',
  'distancia': 'A Distancia',
  'virtual': 'A Distancia',
  'online': 'A Distancia',
  'hibrida': 'Híbrido',
  'híbrida': 'Híbrido',
  'hibrido': 'Híbrido',
  'híbrido': 'Híbrido',
  'semipresencial': 'Híbrido',
};

function normalizeModality(raw: string | null | undefined, configMap?: Record<string, string>): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  // Config-level override takes priority
  if (configMap && configMap[key]) return configMap[key];
  return MODALITY_MAP[key] || raw;
}

export class ZohoSyncService {
  /**
   * Sync a lead to Zoho CRM (create or update)
   * Called automatically on first readiness, or manually from panel.
   */
  static async syncLeadToZoho(leadId: string, tenantId: string): Promise<{ action: 'created' | 'updated'; zohoContactId: string }> {
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new Error('Lead not found');

    // Load Zoho integration for this tenant
    const integration = await prisma.integration.findFirst({
      where: { tenantId, type: 'zoho_crm', status: 'active' },
    });

    if (!integration) {
      throw new Error(`No active Zoho integration for tenant ${tenantId}`);
    }

    const config = JSON.parse(integration.configEncrypted);
    const zohoService = new ZohoService(config);

    // Resolve offer slug to Zoho picklist value
    let zohoOfferValue = lead.offerInterest;
    if (lead.offerInterest) {
      const offer = await prisma.tenantOffer.findFirst({
        where: { tenantId, slug: lead.offerInterest, isActive: true },
      });
      if (offer) {
        zohoOfferValue = offer.zohoPicklistValue;
      }
    }

    // Normalize modality to Zoho picklist value
    const zohoModality = normalizeModality(lead.modalityInterest, config.modalityMap);

    // Build data for Zoho
    const leadData: Record<string, any> = {
      firstName: lead.firstName,
      lastName: lead.lastName,
      phone: lead.phone,
      email: lead.email,
      dni: lead.dni,
      offerInterest: zohoOfferValue,
      modalityInterest: zohoModality,
      periodInterest: lead.periodInterest,
    };

    try {
      // Search by phone (dedupe)
      const existingContact = await zohoService.searchContact(lead.phone);
      let action: 'created' | 'updated';
      let zohoContactId: string;

      if (existingContact) {
        // Update existing
        zohoContactId = existingContact.id;
        console.log(`🔄 Updating Zoho contact ${zohoContactId} for lead ${leadId}`);
        await zohoService.updateContact(zohoContactId, leadData);
        action = 'updated';
      } else {
        // Create new
        console.log(`✨ Creating new Zoho contact for lead ${leadId}`);
        zohoContactId = await zohoService.createContact(leadData);
        action = 'created';
      }

      // Update lead with sync status
      const syncHash = LeadProfileService.calculateSyncHash(lead);
      await prisma.lead.update({
        where: { id: leadId },
        data: {
          zohoContactId,
          zohoSyncStatus: 'synced',
          zohoLastSyncAt: new Date(),
          zohoLastError: null,
          zohoSyncHash: syncHash,
        },
      });

      console.log(`✅ Lead ${leadId} ${action} in Zoho (${zohoContactId})`);
      return { action, zohoContactId };
    } catch (err: any) {
      const errorMsg = err.response?.data
        ? JSON.stringify(err.response.data)
        : err.message || 'Unknown error';

      console.error(`❌ Zoho sync failed for lead ${leadId}:`, errorMsg);

      await prisma.lead.update({
        where: { id: leadId },
        data: {
          zohoSyncStatus: 'error',
          zohoLastError: errorMsg.slice(0, 500),
        },
      });

      throw new Error(`Zoho sync failed: ${errorMsg}`);
    }
  }
}
