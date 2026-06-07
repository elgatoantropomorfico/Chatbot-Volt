'use client';

import { X } from 'lucide-react';
import { modalOverlayStyle, modalStyle, tabStyle } from './styles';
import { TenantGeneralTab } from './TenantGeneralTab';
import { TenantChannelsTab } from './TenantChannelsTab';
import { TenantUsersTab } from './TenantUsersTab';
import type { Feedback, TenantSummary, TenantTab } from './types';

interface Props {
  tenant: TenantSummary;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onTenantDeleted: () => Promise<void>;
  activeTab: TenantTab;
  setActiveTab: (tab: TenantTab) => void;
  onFeedback: (feedback: Feedback) => void;
}

const TABS: { id: TenantTab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'channels', label: 'Canales WhatsApp' },
  { id: 'users', label: 'Usuarios' },
];

export function TenantDetailModal({
  tenant, onClose, onRefresh, onTenantDeleted, activeTab, setActiveTab, onFeedback,
}: Props) {
  const channelCount = tenant.channels?.length ?? tenant._count?.channels ?? 0;

  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '20px 24px', borderBottom: '1px solid var(--color-border)',
        }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '2px' }}>{tenant.name}</h2>
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
              ID: {tenant.id}
              {channelCount > 0 && ` · ${channelCount} canal${channelCount !== 1 ? 'es' : ''}`}
            </span>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer',
            padding: '6px', borderRadius: 'var(--radius-sm)',
          }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', paddingLeft: '12px' }}>
          {TABS.map((tab) => (
            <button key={tab.id} style={tabStyle(activeTab === tab.id)} onClick={() => setActiveTab(tab.id)}>
              {tab.label}
              {tab.id === 'channels' && channelCount > 0 && (
                <span style={{
                  marginLeft: '6px', fontSize: '10px', fontWeight: 600, padding: '1px 6px',
                  borderRadius: '8px', background: 'rgba(139, 92, 246, 0.15)', color: 'var(--color-primary)',
                }}>
                  {channelCount}
                </span>
              )}
            </button>
          ))}
        </div>

        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {activeTab === 'general' && (
            <TenantGeneralTab tenant={tenant} onRefresh={onRefresh} onDeleted={onTenantDeleted} onFeedback={onFeedback} />
          )}
          {activeTab === 'channels' && (
            <TenantChannelsTab tenant={tenant} onRefresh={onRefresh} onFeedback={onFeedback} />
          )}
          {activeTab === 'users' && (
            <TenantUsersTab tenant={tenant} onFeedback={onFeedback} />
          )}
        </div>
      </div>
    </div>
  );
}
