import { prisma } from '../config/database';
import { PilotSolutionService } from './pilot-solution.service';
import { LeadProfileService } from './lead-profile.service';

export class PilotSyncService {
  static async syncLeadToPilot(leadId: string, tenantId: string): Promise<{ action: 'created' | 'skipped'; pilotContactId: string }> {
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new Error('Lead not found');

    const integration = await prisma.integration.findFirst({
      where: { tenantId, type: 'pilot_crm', status: 'active' },
    });
    if (!integration) {
      throw new Error(`No hay integración Pilot CRM activa para el tenant`);
    }

    if (lead.pilotContactId) {
      return { action: 'skipped', pilotContactId: lead.pilotContactId };
    }

    const fieldConfigs = await prisma.pilotFieldConfig.findMany({
      where: { tenantId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    if (!LeadProfileService.isReadyForPilot(lead, fieldConfigs)) {
      const { missing } = LeadProfileService.getPilotCaptureState(lead, fieldConfigs);
      throw new Error(`Faltan campos obligatorios: ${missing.map((f) => f.label).join(', ')}`);
    }

    const notesParts: string[] = [];
    const payload: Record<string, string> = {};

    for (const fc of fieldConfigs) {
      let value = LeadProfileService.getPilotFieldValue(lead, fc.localKey);
      if (!value && fc.defaultValue) value = fc.defaultValue;

      if (fc.pilotField === 'pilot_notes' || fc.localKey === 'notes') {
        if (value) payload.notes = value;
        continue;
      }

      if (fc.includeInNotes && value) {
        notesParts.push(`${fc.label}: ${value}`);
      }

      if (!value || fc.pilotField === 'notes') continue;

      switch (fc.localKey) {
        case 'fname': payload.fname = value; break;
        case 'lname': payload.lname = value; break;
        case 'phone': payload.phone = value; break;
        case 'product': payload.product = value; break;
        case 'biz': payload.biz = value; break;
        default:
          if (fc.pilotField === 'pilot_product_of_interest') payload.product = value;
          break;
      }
    }

    if (!payload.notes && notesParts.length > 0) {
      payload.notes = notesParts.join(' | ');
    }
    if (!payload.notes) {
      const topic = lead.lastDetectedTopic || lead.offerInterest;
      payload.notes = topic
        ? `Consulta WhatsApp — interés: ${topic}`
        : 'Consulta vía WhatsApp Bot Le Rocher';
    }
    if (!payload.phone) payload.phone = lead.phone;
    if (!payload.fname && lead.firstName) payload.fname = lead.firstName;
    if (!payload.lname && lead.lastName) payload.lname = lead.lastName;
    if (!payload.product && lead.offerInterest) payload.product = lead.offerInterest;

    try {
      const result = await PilotSolutionService.createLead(payload);
      const syncHash = LeadProfileService.calculatePilotSyncHash(lead);

      await prisma.lead.update({
        where: { id: leadId },
        data: {
          pilotContactId: result.pilotId,
          pilotSyncStatus: 'synced',
          pilotLastSyncAt: new Date(),
          pilotLastError: null,
          pilotSyncHash: syncHash,
        },
      });

      console.log(`✅ Lead ${leadId} creado en Pilot (ID ${result.pilotId})`);
      return { action: 'created', pilotContactId: result.pilotId };
    } catch (err: any) {
      const errorMsg = (err.message || 'Unknown error').slice(0, 500);
      console.error(`❌ Pilot sync failed for lead ${leadId}:`, errorMsg);

      await prisma.lead.update({
        where: { id: leadId },
        data: { pilotSyncStatus: 'error', pilotLastError: errorMsg },
      });

      throw new Error(`Pilot sync failed: ${errorMsg}`);
    }
  }
}
