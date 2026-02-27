'use client';

import { useAuth } from '@/context/AuthContext';
import { Settings } from 'lucide-react';

export default function SettingsPage() {
  const { user, isSuperAdmin } = useAuth();

  const cardStyle: React.CSSProperties = {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-lg)',
    padding: '24px',
    marginBottom: '16px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3), 0 0 1px rgba(139, 92, 246, 0.15)',
    position: 'relative' as const,
    overflow: 'hidden' as const,
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '13px',
    padding: '8px 0',
    borderBottom: '1px solid rgba(139, 92, 246, 0.04)',
  };

  return (
    <div style={{ maxWidth: '900px' }}>
      <h1 style={{ fontSize: '26px', fontWeight: 700, marginBottom: '24px', letterSpacing: '-0.02em', background: 'linear-gradient(135deg, var(--color-text), var(--color-text-secondary))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Configuración</h1>

      <div style={cardStyle}>
        <div style={{ position: 'absolute' as const, top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, #8b5cf6, #e879f9, transparent)' }} />
        <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px', letterSpacing: '-0.01em' }}>Perfil</h3>
        <div style={{ display: 'flex', flexDirection: 'column' as const }}>
          <div style={rowStyle}>
            <span style={{ color: 'var(--color-text-muted)' }}>Email</span>
            <span style={{ fontWeight: 500 }}>{user?.email}</span>
          </div>
          <div style={rowStyle}>
            <span style={{ color: 'var(--color-text-muted)' }}>Rol</span>
            <span style={{ textTransform: 'capitalize' as const, fontWeight: 500 }}>{user?.role?.replace('_', ' ')}</span>
          </div>
          <div style={{ ...rowStyle, borderBottom: 'none' }}>
            <span style={{ color: 'var(--color-text-muted)' }}>Tenant</span>
            <span style={{ fontWeight: 500 }}>{user?.tenant?.name || (isSuperAdmin ? 'Global (SuperAdmin)' : '—')}</span>
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ position: 'absolute' as const, top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, #67e8f9, #8b5cf6, transparent)' }} />
        <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px', letterSpacing: '-0.01em' }}>Plataforma</h3>
        <div style={{ display: 'flex', flexDirection: 'column' as const }}>
          <div style={rowStyle}>
            <span style={{ color: 'var(--color-text-muted)' }}>Versión</span>
            <span style={{ fontWeight: 500, fontFamily: 'var(--font-mono)', fontSize: '12px' }}>0.1.0 (MVP 1)</span>
          </div>
          <div style={rowStyle}>
            <span style={{ color: 'var(--color-text-muted)' }}>WhatsApp API</span>
            <span style={{ fontWeight: 500, fontFamily: 'var(--font-mono)', fontSize: '12px' }}>v21.0</span>
          </div>
          <div style={{ ...rowStyle, borderBottom: 'none' }}>
            <span style={{ color: 'var(--color-text-muted)' }}>Motor IA</span>
            <span style={{ fontWeight: 500 }}>OpenAI</span>
          </div>
        </div>
      </div>
    </div>
  );
}
