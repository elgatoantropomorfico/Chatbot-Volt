'use client';

import { useAuth } from '@/context/AuthContext';
import { Settings } from 'lucide-react';

export default function SettingsPage() {
  const { user, isSuperAdmin } = useAuth();

  return (
    <div style={{ maxWidth: '600px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '20px' }}>Configuración</h1>

      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '20px', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>Perfil</h3>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>Email</span>
            <span>{user?.email}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>Rol</span>
            <span style={{ textTransform: 'capitalize' as const }}>{user?.role?.replace('_', ' ')}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>Tenant</span>
            <span>{user?.tenant?.name || (isSuperAdmin ? 'Global (SuperAdmin)' : '—')}</span>
          </div>
        </div>
      </div>

      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '20px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>Plataforma</h3>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>Versión</span>
            <span>0.1.0 (MVP 1)</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>WhatsApp API</span>
            <span>v21.0</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>Motor IA</span>
            <span>OpenAI</span>
          </div>
        </div>
      </div>
    </div>
  );
}
