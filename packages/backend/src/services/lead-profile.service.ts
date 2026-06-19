import { prisma } from '../config/database';
import { ExtractedLeadData } from './lead-extraction.service';
import { fuzzyMatchPicklist, PicklistOption } from '../utils/fuzzy-match';
import { LeadRequestService } from './lead-request.service';
import crypto from 'crypto';

// Standard lead columns that map directly to DB fields (not customData)
const STANDARD_LEAD_KEYS = new Set([
  'firstName', 'lastName', 'fullName', 'email', 'dni',
  'offerInterest', 'modalityInterest', 'periodInterest', 'intentLevel',
]);

/** Pilot extraction aliases → Lead columns / customData */
const PILOT_KEY_MAP: Record<string, 'column' | 'custom'> = {
  fname: 'column',
  lname: 'column',
  product: 'column',
  biz: 'custom',
  has_trade_in: 'custom',
  notes: 'custom',
};

const PILOT_COLUMN_MAP: Record<string, string> = {
  fname: 'firstName',
  lname: 'lastName',
  product: 'offerInterest',
};

/** Filled automatically — not part of the conversational capture sequence */
const PILOT_AUTO_FIELDS = new Set(['phone', 'notes']);

const ZOHO_AUTO_FIELDS = new Set(['phone']);

/** Orden conversacional Zoho: primero programa confirmado, después identidad */
const ZOHO_CAPTURE_STEPS: Array<{
  localKey: string;
  label: string;
  description?: string;
  requiredForSync: boolean;
}> = [
  {
    localKey: 'offerInterest',
    label: 'Programa de interés',
    requiredForSync: true,
    description: 'Confirmá qué programa concreto le interesa (de la lista configurada). Si preguntó por uno, pedile confirmación antes de seguir.',
  },
  {
    localKey: 'full_name',
    label: 'Nombre y apellido',
    requiredForSync: true,
    description: 'Confirmá o pedí nombre y apellido completos.',
  },
  {
    localKey: 'email',
    label: 'Email',
    requiredForSync: true,
    description: 'Pedí un correo electrónico de contacto.',
  },
  {
    localKey: 'modalityInterest',
    label: 'Modalidad',
    requiredForSync: false,
    description: 'Preguntá presencial, a distancia u híbrida si aplica.',
  },
  {
    localKey: 'dni',
    label: 'DNI',
    requiredForSync: false,
    description: 'Pedí el número de documento si corresponde.',
  },
  {
    localKey: 'periodInterest',
    label: 'Período',
    requiredForSync: false,
    description: 'Preguntá año o período de inicio si aplica.',
  },
];

export class LeadProfileService {
  static getPilotFieldValue(lead: any, localKey: string): string | null {
    if (localKey === 'phone') return lead.phone || null;
    const col = PILOT_COLUMN_MAP[localKey];
    if (col) {
      const v = lead[col];
      return v != null && String(v).trim() !== '' ? String(v) : null;
    }
    const custom = (lead.customData as Record<string, any>) || {};
    const v = custom[localKey];
    return v != null && String(v).trim() !== '' ? String(v) : null;
  }

  static isPilotNameComplete(lead: any): boolean {
    return !!(
      this.getPilotFieldValue(lead, 'fname') &&
      this.getPilotFieldValue(lead, 'lname')
    );
  }

  /** Ordered missing required fields for Pilot capture + sync readiness */
  static getPilotCaptureState(
    lead: any,
    fieldConfigs: Array<{
      localKey: string;
      label: string;
      description?: string | null;
      fieldType?: string;
      isRequired: boolean;
      isActive?: boolean;
      sortOrder: number;
    }>,
  ) {
    const missing: Array<{ localKey: string; label: string; description?: string | null }> = [];

    const sorted = [...fieldConfigs]
      .filter((f) => f.isActive !== false)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    let nameStepHandled = false;

    for (const fc of sorted) {
      if (PILOT_AUTO_FIELDS.has(fc.localKey)) continue;
      if (!fc.isRequired) continue;

      // Nombre y apellido se capturan juntos en un solo paso conversacional
      if (fc.localKey === 'fname' || fc.localKey === 'lname') {
        if (!nameStepHandled) {
          nameStepHandled = true;
          if (!this.isPilotNameComplete(lead)) {
            missing.push({
              localKey: 'full_name',
              label: 'Nombre y apellido',
              description: 'Pedí nombre y apellido juntos en una sola pregunta (ej: "¿Me decís tu nombre y apellido?").',
            });
          }
        }
        continue;
      }

      if (!this.getPilotFieldValue(lead, fc.localKey)) {
        missing.push({
          localKey: fc.localKey,
          label: fc.label,
          description: fc.description,
        });
      }
    }

    return {
      missing,
      next: missing[0] || null,
      isComplete: missing.length === 0,
    };
  }

  static isZohoNameComplete(lead: { firstName?: string | null; lastName?: string | null }): boolean {
    return !!(lead.firstName?.trim() && lead.lastName?.trim());
  }

  static getZohoFieldValue(lead: Record<string, any>, localKey: string): string | null {
    if (localKey === 'full_name') {
      return this.isZohoNameComplete(lead) ? `${lead.firstName} ${lead.lastName}`.trim() : null;
    }
    const v = lead[localKey];
    return v != null && String(v).trim() !== '' ? String(v) : null;
  }

  static getZohoCaptureState(
    lead: Record<string, any>,
    fieldConfigs: Array<{
      localKey: string;
      label: string;
      description?: string | null;
      isRequired?: boolean;
      isActive?: boolean;
      fixedValue?: string | null;
    }>,
  ) {
    const configured = new Set(
      fieldConfigs
        .filter((f) => f.isActive !== false && !f.fixedValue && !f.localKey.startsWith('_fixed_'))
        .map((f) => f.localKey),
    );

    const missing: Array<{ localKey: string; label: string; description?: string | null }> = [];

    for (const step of ZOHO_CAPTURE_STEPS) {
      if (step.localKey === 'full_name') {
        if (!configured.has('firstName') && !configured.has('lastName')) continue;
        if (!this.getZohoFieldValue(lead, 'full_name')) {
          missing.push({
            localKey: 'full_name',
            label: step.label,
            description: step.description,
          });
        }
        continue;
      }

      if (!configured.has(step.localKey)) continue;
      const fc = fieldConfigs.find((f) => f.localKey === step.localKey);

      if (!this.getZohoFieldValue(lead, step.localKey)) {
        missing.push({
          localKey: step.localKey,
          label: fc?.label || step.label,
          description: step.description || fc?.description,
        });
      }
    }

    const syncMissing = ZOHO_CAPTURE_STEPS.filter((s) => s.requiredForSync).filter((s) => {
      if (s.localKey === 'full_name') return !this.isZohoNameComplete(lead);
      return configured.has(s.localKey) && !this.getZohoFieldValue(lead, s.localKey);
    });

    return {
      missing,
      next: missing[0] || null,
      isComplete: syncMissing.length === 0,
    };
  }

  /** Solo extrae el dato del paso actual del flujo Zoho (evita saltar la confirmación de oferta) */
  static applyZohoExtractionGuards(
    lead: Record<string, any>,
    extracted: ExtractedLeadData,
    fieldConfigs: Array<{ localKey: string; label: string; description?: string | null; isRequired?: boolean }>,
  ): ExtractedLeadData {
    const result = { ...extracted };
    const capture = this.getZohoCaptureState(lead, fieldConfigs);
    const nextKey = capture.next?.localKey;
    const allowed = new Set<string>(['intentLevel']);

    if (nextKey === 'full_name') {
      allowed.add('firstName');
      allowed.add('lastName');
      allowed.add('fullName');
    } else if (nextKey) {
      allowed.add(nextKey);
    }

    for (const key of Object.keys(result)) {
      if (!allowed.has(key)) delete result[key];
    }
    return result;
  }

  /**
   * Merge extracted data onto existing lead.
   * Rule: never overwrite good data with weaker data.
   *
   * Persistence rules:
   *  - Standard lead columns (firstName, email, dni, ...) are stored on the Lead row.
   *  - LeadFieldConfig fields with scope='lead' are merged into lead.customData.
   *  - LeadFieldConfig fields with scope='request' (default) are merged into the
   *    active LeadRequest.data. If no in_progress request exists, one is created.
   */
  static async mergeExtractedData(leadId: string, extracted: ExtractedLeadData) {
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new Error('Lead not found');

    // Load picklist configs from both systems for normalization
    const zohoConfigs = await prisma.zohoFieldConfig.findMany({
      where: { tenantId: lead.tenantId, isActive: true },
    });
    const leadFieldConfigs = await prisma.leadFieldConfig.findMany({
      where: { tenantId: lead.tenantId, isActive: true },
    });

    const picklistMap = new Map<string, { options: PicklistOption[]; useSlug: boolean }>();
    for (const fc of zohoConfigs) {
      const opts = (fc.optionsJson as unknown as PicklistOption[]) || [];
      if ((fc.fieldType === 'picklist' || fc.fieldType === 'multi_select') && opts.length > 0) {
        picklistMap.set(fc.localKey, {
          options: opts,
          useSlug: fc.localKey === 'offerInterest' && opts.some(o => !!o.slug),
        });
      }
    }
    // Custom field picklists + scope map (lead | request)
    const customFieldKeys = new Set<string>();
    const customFieldScope = new Map<string, 'lead' | 'request'>();
    for (const fc of leadFieldConfigs) {
      customFieldKeys.add(fc.fieldKey);
      customFieldScope.set(fc.fieldKey, ((fc as any).scope || 'request') as 'lead' | 'request');
      const opts = (fc.optionsJson as unknown as PicklistOption[]) || [];
      if (fc.fieldType === 'picklist' && opts.length > 0) {
        picklistMap.set(fc.fieldKey, { options: opts, useSlug: false });
      }
    }

    // Normalize Pilot extraction keys (fname → firstName, etc.)
    if ((extracted as any).fname && !extracted.firstName) {
      extracted.firstName = (extracted as any).fname;
    }
    if ((extracted as any).lname && !extracted.lastName) {
      extracted.lastName = (extracted as any).lname;
    }
    if ((extracted as any).product && !extracted.offerInterest) {
      extracted.offerInterest = (extracted as any).product;
    }

    const pilotIntegration = await prisma.integration.findFirst({
      where: { tenantId: lead.tenantId, type: 'pilot_crm', status: 'active' },
    });
    const pilotConfigs = pilotIntegration
      ? await prisma.pilotFieldConfig.findMany({
          where: { tenantId: lead.tenantId, isActive: true },
        })
      : [];

    for (const fc of pilotConfigs) {
      const opts = (fc.optionsJson as unknown as PicklistOption[]) || [];
      if ((fc.fieldType === 'picklist' || fc.fieldType === 'select') && opts.length > 0) {
        picklistMap.set(fc.localKey, { options: opts, useSlug: false });
      }
    }

    const updates: Record<string, any> = {};
    const existingCustomData = ((lead as any).customData as Record<string, any>) || {};
    const customDataUpdates: Record<string, any> = {};
    // Per-request updates: applied to the active LeadRequest at the end.
    const requestDataUpdates: Record<string, any> = {};

    // Name fields: only update if not already set
    if (extracted.firstName && !lead.firstName) {
      updates.firstName = extracted.firstName;
    }
    if (extracted.lastName && !lead.lastName) {
      updates.lastName = extracted.lastName;
    }
    if (extracted.fullName && !lead.fullName) {
      updates.fullName = extracted.fullName;
      if (!lead.firstName && !updates.firstName && extracted.fullName.includes(' ')) {
        const parts = extracted.fullName.trim().split(/\s+/);
        updates.firstName = parts[0];
        updates.lastName = parts.slice(1).join(' ');
      }
    }

    // Contact data: only update if not already set
    if (extracted.email && !lead.email) {
      updates.email = extracted.email;
    }
    if (extracted.dni && !lead.dni) {
      updates.dni = extracted.dni;
    }

    // Interest fields: update if new value arrives, normalize picklists
    if (extracted.offerInterest && extracted.offerInterest !== lead.offerInterest) {
      const pl = picklistMap.get('offerInterest');
      updates.offerInterest = pl
        ? (fuzzyMatchPicklist(extracted.offerInterest, pl.options, pl.useSlug) || extracted.offerInterest)
        : extracted.offerInterest;
    }
    if (extracted.modalityInterest && extracted.modalityInterest !== lead.modalityInterest) {
      const pl = picklistMap.get('modalityInterest');
      updates.modalityInterest = pl
        ? (fuzzyMatchPicklist(extracted.modalityInterest, pl.options, pl.useSlug) || extracted.modalityInterest)
        : extracted.modalityInterest;
    }
    if (extracted.periodInterest && extracted.periodInterest !== lead.periodInterest) {
      updates.periodInterest = extracted.periodInterest;
    }

    // Intent level: always update
    if (extracted.intentLevel) {
      updates.intentLevel = extracted.intentLevel;
    }

    // Need active request up front so we can split scope='request' updates.
    // Lazily resolve only when we actually have something to write to it.
    let activeRequest: any = null;
    const ensureActiveRequest = async () => {
      if (!activeRequest) {
        activeRequest = await LeadRequestService.getOrCreateActive(leadId, lead.tenantId);
      }
      return activeRequest;
    };

    // Pilot custom fields (biz, has_trade_in, notes)
    if (pilotConfigs.length > 0) {
      for (const [key, value] of Object.entries(extracted)) {
        if (!value || STANDARD_LEAD_KEYS.has(key)) continue;
        if (PILOT_KEY_MAP[key] !== 'custom') continue;
        if (existingCustomData[key]) continue;
        const pl = picklistMap.get(key);
        customDataUpdates[key] = pl
          ? (fuzzyMatchPicklist(String(value), pl.options, pl.useSlug) || value)
          : value;
      }
    }

    // Custom fields from LeadFieldConfig → split by scope:
    //  - scope='lead'    → lead.customData
    //  - scope='request' → LeadRequest.data
    for (const [key, value] of Object.entries(extracted)) {
      if (!value || STANDARD_LEAD_KEYS.has(key)) continue;
      if (!customFieldKeys.has(key)) continue; // only store known custom fields

      const scope = customFieldScope.get(key) || 'request';
      const pl = picklistMap.get(key);
      const normalized = pl
        ? (fuzzyMatchPicklist(value, pl.options, false) || value)
        : value;

      if (scope === 'lead') {
        const existingVal = existingCustomData[key];
        if (existingVal) continue; // don't overwrite stable lead-level data
        customDataUpdates[key] = normalized;
      } else {
        // request-scoped: stage for the active request below
        requestDataUpdates[key] = normalized;
      }
    }

    // Merge customData if there are updates
    if (Object.keys(customDataUpdates).length > 0) {
      updates.customData = { ...existingCustomData, ...customDataUpdates };
    }

    // Persist request-scoped updates onto the active LeadRequest, then try to
    // auto-complete it if every required request-scoped field is filled.
    if (Object.keys(requestDataUpdates).length > 0) {
      const req = await ensureActiveRequest();
      const existingReqData = (req.data as Record<string, any>) || {};
      // Don't overwrite values already captured on this request.
      const merged: Record<string, any> = { ...existingReqData };
      for (const [k, v] of Object.entries(requestDataUpdates)) {
        if (merged[k] === undefined || merged[k] === null || merged[k] === '') {
          merged[k] = v;
        }
      }
      await (prisma as any).leadRequest.update({
        where: { id: req.id },
        data: { data: merged },
      });
      await LeadRequestService.completeIfReady(req.id);
      console.log(`📝 Updated LeadRequest ${req.id} with`, JSON.stringify(requestDataUpdates));
    }

    // Skip if nothing else changed on the Lead row
    if (Object.keys(updates).length === 0) {
      return lead;
    }

    // Compute sync hash for change detection
    const mergedData = { ...lead, ...updates };
    const zohoIntegration = await prisma.integration.findFirst({
      where: { tenantId: lead.tenantId, type: 'zoho_crm', status: 'active' },
    });
    if (zohoIntegration) {
      updates.zohoSyncHash = this.calculateSyncHash(mergedData);
    }
    if (pilotIntegration) {
      updates.pilotSyncHash = this.calculatePilotSyncHash(mergedData);
      if ((lead as any).pilotContactId && (lead as any).pilotSyncStatus === 'synced') {
        const prevHash = (lead as any).pilotSyncHash;
        const newHash = updates.pilotSyncHash;
        if (prevHash && newHash && prevHash !== newHash) {
          updates.pilotSyncStatus = 'needs_update';
        }
      }
    }

    // Update name field for backward compatibility
    if ((updates.firstName || lead.firstName) && (updates.lastName || lead.lastName)) {
      const fn = updates.firstName || lead.firstName;
      const ln = updates.lastName || lead.lastName;
      updates.name = `${fn} ${ln}`;
    }

    console.log(`📝 Merging lead ${leadId} updates:`, JSON.stringify(updates));

    const updatedLead = await prisma.lead.update({
      where: { id: leadId },
      data: updates,
    });

    return updatedLead;
  }

  /**
   * Check if lead is ready for initial Zoho sync
   */
  static isReadyForZoho(lead: {
    phone: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    offerInterest?: string | null;
  }): boolean {
    return !!(
      lead.phone &&
      lead.firstName &&
      lead.lastName &&
      lead.email &&
      lead.offerInterest
    );
  }

  /**
   * Check if lead has new data since last Zoho sync
   */
  static hasNewDataSinceLastSync(lead: {
    zohoSyncHash?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    dni?: string | null;
    offerInterest?: string | null;
    modalityInterest?: string | null;
    periodInterest?: string | null;
  }): boolean {
    if (!lead.zohoSyncHash) return false;
    const currentHash = this.calculateSyncHash(lead);
    return currentHash !== lead.zohoSyncHash;
  }

  /**
   * Calculate MD5 hash of relevant lead fields for change detection
   */
  static isReadyForPilot(
    lead: { phone?: string | null },
    fieldConfigs: Array<{
      localKey: string;
      label: string;
      description?: string | null;
      isRequired: boolean;
      isActive?: boolean;
      sortOrder: number;
    }>,
  ): boolean {
    if (!lead.phone) return false;
    return this.getPilotCaptureState(lead, fieldConfigs).isComplete;
  }

  static calculatePilotSyncHash(lead: Record<string, any>): string {
    const custom = (lead.customData as Record<string, any>) || {};
    const relevantData = {
      firstName: lead.firstName || null,
      lastName: lead.lastName || null,
      phone: lead.phone || null,
      offerInterest: lead.offerInterest || null,
      biz: custom.biz || null,
      has_trade_in: custom.has_trade_in || null,
      notes: custom.notes || null,
    };

    return crypto
      .createHash('md5')
      .update(JSON.stringify(relevantData))
      .digest('hex');
  }

  static calculateSyncHash(lead: Record<string, any>): string {
    const relevantData = {
      firstName: lead.firstName || null,
      lastName: lead.lastName || null,
      email: lead.email || null,
      dni: lead.dni || null,
      offerInterest: lead.offerInterest || null,
      modalityInterest: lead.modalityInterest || null,
      periodInterest: lead.periodInterest || null,
    };

    return crypto
      .createHash('md5')
      .update(JSON.stringify(relevantData))
      .digest('hex');
  }
}
