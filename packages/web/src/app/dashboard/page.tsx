'use client';

import { Suspense, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import {
  MessageSquare, Users, Clock, TrendingUp, ShoppingCart, Phone, Bot,
  AlertTriangle, Info, Settings, ArrowRight,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { SuperAdminPanel } from '@/components/superadmin/SuperAdminPanel';
import styles from './layout.module.css';

// ════════════════════════════════════════════
// TENANT DASHBOARD — Stats for tenant users
// ════════════════════════════════════════════

interface DashboardStats {
  conversations: { total: number; active: number; pendingHuman: number };
  leads: { total: number; newToday: number; newThisWeek: number };
  messages: { total: number; todayCount: number; avgResponseTime: number };
  sales?: { total: number; todayRevenue: number; pendingOrders: number };
}

function TenantDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [actions, setActions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [statsData, actionsData] = await Promise.all([
          api.getDashboardStats(),
          api.getDashboardActions().catch(() => ({ actions: [] })),
        ]);
        setStats(statsData);
        setActions(actionsData.actions);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    })();
  }, []);

  const actionIcon = (type: string) => {
    switch (type) {
      case 'urgent': return <AlertTriangle size={18} />;
      case 'warning': return <Clock size={18} />;
      case 'config': return <Settings size={18} />;
      default: return <Info size={18} />;
    }
  };

  const actionColor = (type: string) => {
    switch (type) {
      case 'urgent': return { bg: 'rgba(251, 113, 133, 0.08)', border: 'rgba(251, 113, 133, 0.2)', color: '#fb7185', accent: 'rgba(251, 113, 133, 0.15)' };
      case 'warning': return { bg: 'rgba(251, 191, 36, 0.08)', border: 'rgba(251, 191, 36, 0.2)', color: '#fbbf24', accent: 'rgba(251, 191, 36, 0.15)' };
      case 'config': return { bg: 'rgba(139, 92, 246, 0.08)', border: 'rgba(139, 92, 246, 0.2)', color: '#8b5cf6', accent: 'rgba(139, 92, 246, 0.15)' };
      default: return { bg: 'rgba(6, 182, 212, 0.08)', border: 'rgba(6, 182, 212, 0.2)', color: '#06b6d4', accent: 'rgba(6, 182, 212, 0.15)' };
    }
  };

  if (loading) {
    return (
      <div>
        <div className={styles.pageHeader}>
          <h1>Dashboard</h1>
          <p>Bienvenido, {user?.email}</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{
              padding: '24px 28px', background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)', height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{ color: 'var(--color-text-muted)' }}>Cargando...</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1>Dashboard</h1>
        <p>Bienvenido, {user?.email}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '24px', marginBottom: '32px' }}>
        <StatCard icon={<MessageSquare size={20} />} label="Conversaciones activas" value={stats?.conversations.active?.toString() || '0'} subtitle={`${stats?.conversations.total || 0} total`} color="#8b5cf6" glow="rgba(139, 92, 246, 0.15)" />
        <StatCard icon={<Users size={20} />} label="Leads nuevos hoy" value={stats?.leads.newToday?.toString() || '0'} subtitle={`${stats?.leads.newThisWeek || 0} esta semana`} color="#34d399" glow="rgba(52, 211, 153, 0.15)" />
        <StatCard icon={<Phone size={20} />} label="Atención humana" value={stats?.conversations.pendingHuman?.toString() || '0'} subtitle="Conversaciones pendientes" color="#fbbf24" glow="rgba(251, 191, 36, 0.15)" />
        <StatCard icon={<Bot size={20} />} label="Mensajes hoy" value={stats?.messages.todayCount?.toString() || '0'} subtitle={`${stats?.messages.total || 0} total`} color="#06b6d4" glow="rgba(6, 182, 212, 0.15)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '24px', marginBottom: '32px' }}>
        {stats?.sales && (
          <>
            <StatCard icon={<ShoppingCart size={20} />} label="Ventas hoy" value={`$${stats.sales.todayRevenue?.toLocaleString('es-AR') || '0'}`} subtitle={`${stats.sales.total || 0} órdenes total`} color="#10b981" glow="rgba(16, 185, 129, 0.15)" />
            <StatCard icon={<Clock size={20} />} label="Órdenes pendientes" value={stats.sales.pendingOrders?.toString() || '0'} subtitle="Esperando confirmación" color="#f59e0b" glow="rgba(245, 158, 11, 0.15)" />
          </>
        )}
        {stats?.messages.avgResponseTime ? (
          <StatCard icon={<TrendingUp size={20} />} label="Tiempo de respuesta" value={stats.messages.avgResponseTime < 60 ? `${Math.round(stats.messages.avgResponseTime)}s` : `${Math.round(stats.messages.avgResponseTime / 60)}min`} subtitle="Promedio de respuesta del bot" color="#8b5cf6" glow="rgba(139, 92, 246, 0.15)" />
        ) : null}
      </div>

      {actions.length > 0 && (
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={18} style={{ color: '#fbbf24' }} />
            Tareas pendientes
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {actions.map((action: any) => {
              const colors = actionColor(action.type);
              return (
                <div
                  key={action.id}
                  onClick={() => router.push(action.link)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '16px',
                    padding: '16px 20px',
                    background: colors.bg,
                    border: `1px solid ${colors.border}`,
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateX(4px)'; e.currentTarget.style.boxShadow = `0 4px 16px ${colors.accent}`; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateX(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <div style={{
                    width: '36px', height: '36px', borderRadius: 'var(--radius-sm)',
                    background: colors.accent, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', color: colors.color, flexShrink: 0,
                  }}>
                    {actionIcon(action.type)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--color-text)', marginBottom: '2px' }}>
                      {action.title}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                      {action.description}
                    </div>
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    fontSize: '12px', fontWeight: 600, color: colors.color,
                    whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
                    {action.linkLabel}
                    <ArrowRight size={14} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, subtitle, color, glow }: {
  icon?: React.ReactNode; label: string; value: string; subtitle?: string; color: string; glow: string;
}) {
  return (
    <div style={{
      padding: '24px 28px', background: 'var(--color-surface)', border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)', position: 'relative', overflow: 'hidden',
      transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)', cursor: 'default',
      boxShadow: `0 2px 8px rgba(0,0,0,0.3), 0 0 1px ${glow}`,
    }}
    onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 32px rgba(0,0,0,0.4), 0 0 20px ${glow}`; e.currentTarget.style.borderColor = `${color}30`; }}
    onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = `0 2px 8px rgba(0,0,0,0.3), 0 0 1px ${glow}`; e.currentTarget.style.borderColor = 'var(--color-border)'; }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: `linear-gradient(90deg, ${color}, ${color}80, transparent)` }} />
      <div style={{ position: 'absolute', top: '-40px', right: '-40px', width: '120px', height: '120px', background: `radial-gradient(circle, ${glow} 0%, transparent 70%)`, pointerEvents: 'none' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', position: 'relative' }}>
        {icon && <div style={{ color }}>{icon}</div>}
        <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', fontWeight: 500 }}>{label}</div>
      </div>
      <div style={{ fontSize: '32px', fontWeight: 800, color, letterSpacing: '-0.02em', position: 'relative', marginBottom: '4px' }}>{value}</div>
      {subtitle && <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', position: 'relative' }}>{subtitle}</div>}
    </div>
  );
}

function SuperAdminFallback() {
  return (
    <div>
      <h1 style={{ fontSize: '26px', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '24px' }}>Tenants</h1>
      <div style={{ textAlign: 'center', padding: '60px', color: 'var(--color-text-muted)' }}>Cargando...</div>
    </div>
  );
}

export default function DashboardPage() {
  const { isSuperAdmin } = useAuth();
  return isSuperAdmin ? (
    <Suspense fallback={<SuperAdminFallback />}>
      <SuperAdminPanel />
    </Suspense>
  ) : (
    <TenantDashboard />
  );
}
