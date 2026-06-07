export type TenantTab = 'general' | 'channels' | 'users';

export interface TenantSummary {
  id: string;
  name: string;
  status: string;
  timezone?: string;
  _count?: {
    users?: number;
    channels?: number;
    leads?: number;
    conversations?: number;
    integrations?: number;
  };
  channels?: Channel[];
}

export interface Channel {
  id: string;
  tenantId: string;
  phoneNumberId: string;
  wabaId: string;
  displayPhone?: string | null;
  isActive: boolean;
}

export type FeedbackType = 'ok' | 'err' | 'info';

export interface Feedback {
  type: FeedbackType;
  text: string;
}
