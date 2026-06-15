'use client';

import { useEffect, useRef, useState } from 'react';
import { Building2, ChevronRight, MoreVertical, Phone, Users, Settings } from 'lucide-react';
import type { TenantSummary, TenantTab } from './types';

interface Props {
  tenant: TenantSummary;
  onOpen: (tab?: TenantTab) => void;
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Activo',
  inactive: 'Inactivo',
  suspended: 'Suspendido',
};

export function TenantCard({ tenant, onOpen }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const channelCount = tenant._count?.channels ?? 0;
  const isActive = tenant.status === 'active';

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  return (
    <div
      onClick={() => onOpen('general')}
      style={{
        padding: '20px', background: 'var(--color-surface)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)', cursor: 'pointer', transition: 'all 0.2s',
        position: 'relative', overflow: 'hidden',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.4)';
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-border)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
        background: isActive
          ? 'linear-gradient(90deg, #34d399, #10b981, transparent)'
          : 'linear-gradient(90deg, #f59e0b, #fbbf24, transparent)',
      }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <Building2 size={18} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
            <span style={{ fontSize: '15px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {tenant.name}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 500,
              padding: '2px 8px', borderRadius: '10px',
              background: isActive ? 'rgba(52, 211, 153, 0.1)' : 'rgba(245, 158, 11, 0.1)',
              color: isActive ? '#34d399' : '#f59e0b',
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor' }} />
              {STATUS_LABELS[tenant.status] || tenant.status}
            </span>
            {channelCount === 0 && (
              <span style={{
                fontSize: '11px', fontWeight: 500, padding: '2px 8px', borderRadius: '10px',
                background: 'rgba(245, 158, 11, 0.08)', color: '#f59e0b',
              }}>
                Sin canal
              </span>
            )}
            {channelCount > 0 && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 500,
                padding: '2px 8px', borderRadius: '10px',
                background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6',
              }}>
                <Phone size={10} />
                {channelCount} canal{channelCount !== 1 ? 'es' : ''}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
              style={{
                background: 'transparent', border: 'none', color: 'var(--color-text-muted)',
                cursor: 'pointer', padding: '6px', borderRadius: 'var(--radius-sm)',
              }}
              title="Acciones rápidas"
            >
              <MoreVertical size={18} />
            </button>
            {menuOpen && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: '4px', zIndex: 10,
                background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                minWidth: '160px', overflow: 'hidden',
              }}>
                {[
                  { label: 'Configuración', tab: 'general' as TenantTab, icon: Settings },
                  { label: 'Canales WhatsApp', tab: 'channels' as TenantTab, icon: Phone },
                  { label: 'Usuarios', tab: 'users' as TenantTab, icon: Users },
                ].map((item) => (
                  <button
                    key={item.tab}
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onOpen(item.tab); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
                      padding: '10px 14px', background: 'transparent', border: 'none',
                      color: 'var(--color-text)', fontSize: '13px', cursor: 'pointer', textAlign: 'left',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(139, 92, 246, 0.08)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <item.icon size={14} style={{ color: 'var(--color-text-muted)' }} />
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <ChevronRight size={18} style={{ color: 'var(--color-text-muted)' }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--color-text-muted)' }}>
        <span><strong>{tenant._count?.users || 0}</strong> usuarios</span>
        <span><strong>{channelCount}</strong> canales</span>
        <span><strong>{tenant._count?.leads || 0}</strong> clientes</span>
      </div>
    </div>
  );
}
