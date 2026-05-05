import { prisma } from '../config/database';

/**
 * Manages LeadRequest lifecycle:
 *  - getOrCreateActive: returns the in-progress request for a lead, creating one if missing.
 *  - completeIfReady: flips status to completed when all required fields (scope='request') are filled.
 *  - getMostRecent: most recent request regardless of status.
 *  - hasActive: checks whether there's an in_progress request.
 *
 *  Standard Lead columns (firstName, lastName, email, dni) and any LeadFieldConfig
 *  with scope='lead' are persisted on the Lead row, NOT on the request.
 */

const STANDARD_LEAD_KEYS = new Set([
  'firstName', 'lastName', 'fullName', 'email', 'dni', 'name',
  'offerInterest', 'modalityInterest', 'periodInterest', 'intentLevel',
]);

export class LeadRequestService {
  /** Returns the in_progress request, creating one if none exists. */
  static async getOrCreateActive(leadId: string, tenantId: string) {
    const existing = await (prisma as any).leadRequest.findFirst({
      where: { leadId, status: 'in_progress' },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return existing;

    const created = await (prisma as any).leadRequest.create({
      data: {
        leadId,
        tenantId,
        status: 'in_progress',
        data: {},
      },
    });
    console.log(`🆕 Created LeadRequest ${created.id} for lead ${leadId}`);
    return created;
  }

  /** Returns the in_progress request, or null. Does NOT create one. */
  static async getActive(leadId: string) {
    return (prisma as any).leadRequest.findFirst({
      where: { leadId, status: 'in_progress' },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Returns all requests for a lead, newest first, including photos. */
  static async listByLead(leadId: string) {
    return (prisma as any).leadRequest.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
      include: {
        photos: { orderBy: { createdAt: 'asc' } },
      },
    });
  }

  /**
   * Check if every required request-scoped field has a value, and if so
   * flip the request to completed. Returns the (possibly updated) request.
   * Photo-type fields are considered "filled" when at least one matching
   * photo exists for that fieldKey on this request.
   */
  static async completeIfReady(requestId: string) {
    const request = await (prisma as any).leadRequest.findUnique({
      where: { id: requestId },
      include: { photos: true },
    });
    if (!request) return null;
    if (request.status !== 'in_progress') return request;

    const fields = await (prisma as any).leadFieldConfig.findMany({
      where: {
        tenantId: request.tenantId,
        isActive: true,
        isRequired: true,
      },
    });

    // Filter to request-scoped fields (lead-scoped lives on the Lead row).
    const reqFields = fields.filter((f: any) => (f.scope || 'request') === 'request');
    if (reqFields.length === 0) return request;

    const data = (request.data as Record<string, any>) || {};
    const photoFieldsPresent = new Set(
      (request.photos || []).map((p: any) => p.fieldKey).filter(Boolean)
    );

    const allFilled = reqFields.every((f: any) => {
      if (f.fieldType === 'photo' || f.fieldType === 'multi_photo') {
        return photoFieldsPresent.has(f.fieldKey);
      }
      const v = data[f.fieldKey];
      return v !== undefined && v !== null && String(v).trim() !== '';
    });

    if (!allFilled) return request;

    const updated = await (prisma as any).leadRequest.update({
      where: { id: requestId },
      data: {
        status: 'completed',
        completedAt: new Date(),
      },
    });
    console.log(`✅ LeadRequest ${requestId} marked completed`);
    return updated;
  }

  static isStandardLeadKey(key: string): boolean {
    return STANDARD_LEAD_KEYS.has(key);
  }
}
