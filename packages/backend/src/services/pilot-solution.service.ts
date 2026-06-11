import axios from 'axios';
import { env } from '../config/env';

export interface PilotLeadPayload {
  fname?: string;
  lname?: string;
  phone?: string;
  biz?: string | number;
  product?: string;
  notes?: string;
  carBrand?: string;
  carModel?: string;
}

export interface PilotCreateResult {
  pilotId: string;
  message: string;
  raw: any;
}

export class PilotSolutionService {
  static isConfigured(): boolean {
    return !!(env.PILOT_APPKEY && env.PILOT_API_URL);
  }

  static normalizePhone(phone: string): string {
    return phone.replace(/[\s\-+()]/g, '');
  }

  /**
   * Create lead in Pilot Solution (webhook welcome.php — action=create only).
   */
  static async createLead(payload: PilotLeadPayload): Promise<PilotCreateResult> {
    if (!env.PILOT_APPKEY || !env.PILOT_API_URL) {
      throw new Error('Pilot CRM no está configurado en el servidor');
    }

    const params = new URLSearchParams();
    params.set('action', 'create');
    params.set('appkey', env.PILOT_APPKEY);
    params.set('debug', env.PILOT_DEBUG || '0');

    if (payload.fname) params.set('pilot_firstname', payload.fname);
    if (payload.lname) params.set('pilot_lastname', payload.lname);
    if (payload.phone) params.set('pilot_cellphone', this.normalizePhone(payload.phone));

    const contactType = env.PILOT_CONTACT_TYPE_ID || '1';
    params.set('pilot_contact_type_id', contactType);

    const biz = payload.biz ?? env.PILOT_BUSINESS_TYPE_DEFAULT ?? '1';
    params.set('pilot_business_type_id', String(biz));

    if (payload.notes) params.set('pilot_notes', payload.notes);
    if (payload.product) params.set('pilot_product_of_interest', payload.product);
    if (payload.carBrand) params.set('pilot_car_brand', payload.carBrand);
    if (payload.carModel) params.set('pilot_car_modelo', payload.carModel);

    if (env.PILOT_SUBORIGIN_ID) params.set('pilot_suborigin_id', env.PILOT_SUBORIGIN_ID);
    if (env.PILOT_PROVIDER_SERVICE) params.set('pilot_provider_service', env.PILOT_PROVIDER_SERVICE);

    const res = await axios.post(env.PILOT_API_URL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 30000,
      validateStatus: () => true,
    });

    if (res.status !== 200) {
      throw new Error(`Pilot HTTP ${res.status}`);
    }

    const body = res.data;
    if (!body?.success) {
      const errMsg = typeof body?.data === 'string' ? body.data : body?.message || 'Error desconocido';
      throw new Error(`Pilot: ${errMsg}`);
    }

    const pilotId = body?.data?.id != null ? String(body.data.id) : '';
    if (!pilotId) {
      throw new Error('Pilot respondió OK pero sin ID de lead');
    }

    return {
      pilotId,
      message: body?.data?.message || body?.message || 'Lead creado en Pilot',
      raw: body,
    };
  }
}
