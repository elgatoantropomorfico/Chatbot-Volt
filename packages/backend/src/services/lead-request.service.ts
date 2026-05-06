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

  /**
   * Pick the LeadRequest that an incoming photo should be attached to.
   *
   * Strategy:
   *  1. If there's an in_progress request, use it.
   *  2. Otherwise, look at the most recent request (any status) within the
   *     last `recentMinutes` minutes that still has free slots in at least
   *     one photo field on this tenant — this lets a burst of photos that
   *     arrives just AFTER the request was marked completed pile onto the
   *     same request instead of spawning a new empty one on every photo.
   *  3. If nothing fits, create a fresh in_progress request.
   *
   * Returns `{ request, wasAlreadyCompleted }`. When `wasAlreadyCompleted`
   * is true the worker should skip its AI response (the closing message
   * was already sent on the first photo of the burst).
   */
  static async findOrCreatePhotoRequest(
    leadId: string,
    tenantId: string,
    photoFields: Array<{ fieldKey: string; fieldType: string; optionsJson: any }>,
    recentMinutes = 30
  ): Promise<{ request: any; wasAlreadyCompleted: boolean }> {
    // 1) Active in-progress request.
    const inProgress = await (prisma as any).leadRequest.findFirst({
      where: { leadId, status: 'in_progress' },
      orderBy: { createdAt: 'desc' },
    });
    if (inProgress) {
      return { request: inProgress, wasAlreadyCompleted: false };
    }

    // 2) Recently-completed request that still has slots for at least one
    //    photo field. Photos sent in a burst frequently arrive in separate
    //    WhatsApp messages; we want them in the same request.
    if (photoFields.length > 0) {
      const since = new Date(Date.now() - recentMinutes * 60 * 1000);
      const recent = await (prisma as any).leadRequest.findFirst({
        where: {
          leadId,
          updatedAt: { gte: since },
        },
        orderBy: { updatedAt: 'desc' },
        include: { photos: true },
      });
      if (recent) {
        const countByField = new Map<string, number>();
        for (const p of recent.photos || []) {
          if (!p.fieldKey) continue;
          countByField.set(p.fieldKey, (countByField.get(p.fieldKey) || 0) + 1);
        }
        const hasFreeSlot = photoFields.some((pf) => {
          const used = countByField.get(pf.fieldKey) || 0;
          if (pf.fieldType === 'photo') return used < 1;
          const max = (pf.optionsJson as any)?.maxPhotos || 10;
          return used < max;
        });
        if (hasFreeSlot) {
          return {
            request: recent,
            wasAlreadyCompleted: recent.status !== 'in_progress',
          };
        }
      }
    }

    // 3) Brand new request.
    const created = await (prisma as any).leadRequest.create({
      data: { leadId, tenantId, status: 'in_progress', data: {} },
    });
    console.log(`🆕 Created LeadRequest ${created.id} for lead ${leadId}`);
    return { request: created, wasAlreadyCompleted: false };
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
   *
   * Photo fields (`photo` and `multi_photo`) are considered "filled" once at
   * least one photo for that fieldKey exists on the request. For multi_photo,
   * the user decides upfront how many photos they want to send (1, 2, 3…) so
   * the request closes on the first photo of the burst — additional photos
   * within the cap are attached to the SAME (already completed) request by
   * the worker (see `findOrCreatePhotoRequest`), they don't keep it open.
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
