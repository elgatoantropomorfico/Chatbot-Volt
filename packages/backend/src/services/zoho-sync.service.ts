import { prisma } from '../config/database';
import { ZohoService } from './zoho.service';
import { LeadProfileService } from './lead-profile.service';
import { fuzzyMatchPicklist, PicklistOption } from '../utils/fuzzy-match';

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

    // Load dynamic field configs from DB
    const fieldConfigs = await prisma.zohoFieldConfig.findMany({
      where: { tenantId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    // Build Zoho payload dynamically from field configs
    const payload: Record<string, any> = {};
    for (const fc of fieldConfigs) {
      const zohoField = fc.zohoField;
      const options = (fc.optionsJson as PicklistOption[]) || [];

      // Fixed value fields
      if (fc.fixedValue) {
        if (fc.fixedValue === '__TODAY__') {
          payload[zohoField] = new Date().toISOString().split('T')[0];
        } else {
          payload[zohoField] = fc.fixedValue;
        }
        continue;
      }

      // Read lead value by localKey
      const rawValue = (lead as any)[fc.localKey];
      if (rawValue === undefined || rawValue === null || rawValue === '') continue;

      // Normalize picklist values using options + aliases
      if ((fc.fieldType === 'picklist' || fc.fieldType === 'multi_select') && options.length > 0) {
        payload[zohoField] = fuzzyMatchPicklist(rawValue, options) || rawValue;
      } else {
        payload[zohoField] = rawValue;
      }
    }

    // Fallback: ensure Fecha_de_contacto always present
    if (!payload['Fecha_de_contacto']) {
      payload['Fecha_de_contacto'] = new Date().toISOString().split('T')[0];
    }

    try {
      // Search by phone (dedupe)
      const existingContact = await zohoService.searchContact(lead.phone);
      let action: 'created' | 'updated';
      let zohoContactId: string;

      if (existingContact) {
        // Update existing
        zohoContactId = existingContact.id;
        console.log(`🔄 Updating Zoho contact ${zohoContactId} for lead ${leadId}`);
        await zohoService.updateContact(zohoContactId, payload);
        action = 'updated';
      } else {
        // Create new
        console.log(`✨ Creating new Zoho contact for lead ${leadId}`);
        zohoContactId = await zohoService.createContact(payload);
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
