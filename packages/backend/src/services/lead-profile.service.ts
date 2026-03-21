import { prisma } from '../config/database';
import { ExtractedLeadData } from './lead-extraction.service';
import crypto from 'crypto';

interface FieldOption {
  value: string;
  aliases?: string[];
  slug?: string;
}

/**
 * Normalize a raw value against picklist options + aliases.
 * Returns the matched value/slug, or the raw value if no match.
 */
function normalizeToPicklist(raw: string, options: FieldOption[], useSlug: boolean): string {
  const key = raw.trim().toLowerCase();
  for (const opt of options) {
    if (opt.value.toLowerCase() === key) return useSlug && opt.slug ? opt.slug : opt.value;
    if (opt.slug && opt.slug.toLowerCase() === key) return useSlug ? opt.slug : opt.value;
    if (opt.aliases?.some((a) => a.toLowerCase() === key)) return useSlug && opt.slug ? opt.slug : opt.value;
  }
  return raw; // no match, pass through
}

export class LeadProfileService {
  /**
   * Merge extracted data onto existing lead.
   * Rule: never overwrite good data with weaker data.
   * Normalizes picklist values against ZohoFieldConfig before saving.
   */
  static async mergeExtractedData(leadId: string, extracted: ExtractedLeadData) {
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new Error('Lead not found');

    // Load picklist field configs for normalization
    const fieldConfigs = await prisma.zohoFieldConfig.findMany({
      where: { tenantId: lead.tenantId, isActive: true },
    });
    const picklistMap = new Map<string, { options: FieldOption[]; useSlug: boolean }>();
    for (const fc of fieldConfigs) {
      const opts = (fc.optionsJson as FieldOption[]) || [];
      if ((fc.fieldType === 'picklist' || fc.fieldType === 'multi_select') && opts.length > 0) {
        picklistMap.set(fc.localKey, {
          options: opts,
          useSlug: fc.localKey === 'offerInterest' && opts.some(o => !!o.slug),
        });
      }
    }

    const updates: Record<string, any> = {};

    // Name fields: only update if not already set
    if (extracted.firstName && !lead.firstName) {
      updates.firstName = extracted.firstName;
    }
    if (extracted.lastName && !lead.lastName) {
      updates.lastName = extracted.lastName;
    }
    if (extracted.fullName && !lead.fullName) {
      updates.fullName = extracted.fullName;
      // Try to split fullName into first/last if not already set
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
        ? normalizeToPicklist(extracted.offerInterest, pl.options, pl.useSlug)
        : extracted.offerInterest;
    }
    if (extracted.modalityInterest && extracted.modalityInterest !== lead.modalityInterest) {
      const pl = picklistMap.get('modalityInterest');
      updates.modalityInterest = pl
        ? normalizeToPicklist(extracted.modalityInterest, pl.options, pl.useSlug)
        : extracted.modalityInterest;
    }
    if (extracted.periodInterest && extracted.periodInterest !== lead.periodInterest) {
      updates.periodInterest = extracted.periodInterest;
    }

    // Intent level: always update
    if (extracted.intentLevel) {
      updates.intentLevel = extracted.intentLevel;
    }

    // Skip if nothing changed
    if (Object.keys(updates).length === 0) {
      return lead;
    }

    // Compute sync hash for change detection
    const mergedData = { ...lead, ...updates };
    updates.zohoSyncHash = this.calculateSyncHash(mergedData);

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
    offerInterest?: string | null;
  }): boolean {
    return !!(
      lead.phone &&
      lead.firstName &&
      lead.lastName &&
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
