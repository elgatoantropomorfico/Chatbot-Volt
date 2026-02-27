'use client';

import { useAuth } from '@/context/AuthContext';
import styles from './layout.module.css';

export default function DashboardPage() {
  const { user, isSuperAdmin } = useAuth();

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1>Dashboard</h1>
        <p>Bienvenido, {user?.email}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
        <StatCard label="Conversaciones abiertas" value="—" color="#8b5cf6" glow="rgba(139, 92, 246, 0.15)" />
        <StatCard label="Leads nuevos" value="—" color="#34d399" glow="rgba(52, 211, 153, 0.15)" />
        <StatCard label="Atención humana" value="—" color="#fbbf24" glow="rgba(251, 191, 36, 0.15)" />
        {isSuperAdmin && <StatCard label="Tenants activos" value="—" color="#67e8f9" glow="rgba(103, 232, 249, 0.15)" />}
      </div>
    </div>
  );
}

function StatCard({ label, value, color, glow }: { label: string; value: string; color: string; glow: string }) {
  return (
    <div style={{
      padding: '24px 28px',
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      position: 'relative',
      overflow: 'hidden',
      transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
      cursor: 'default',
      boxShadow: `0 2px 8px rgba(0,0,0,0.3), 0 0 1px ${glow}`,
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.transform = 'translateY(-2px)';
      e.currentTarget.style.boxShadow = `0 8px 32px rgba(0,0,0,0.4), 0 0 20px ${glow}`;
      e.currentTarget.style.borderColor = `${color}30`;
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.transform = 'translateY(0)';
      e.currentTarget.style.boxShadow = `0 2px 8px rgba(0,0,0,0.3), 0 0 1px ${glow}`;
      e.currentTarget.style.borderColor = 'var(--color-border)';
    }}
    >
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
        background: `linear-gradient(90deg, ${color}, ${color}80, transparent)`,
      }} />
      <div style={{
        position: 'absolute', top: '-40px', right: '-40px', width: '120px', height: '120px',
        background: `radial-gradient(circle, ${glow} 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />
      <div style={{ fontSize: '32px', fontWeight: 800, color, letterSpacing: '-0.02em', position: 'relative' }}>{value}</div>
      <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '6px', fontWeight: 500, position: 'relative' }}>{label}</div>
    </div>
  );
}
