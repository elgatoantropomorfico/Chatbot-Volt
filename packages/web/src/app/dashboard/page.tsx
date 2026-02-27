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
        <StatCard label="Conversaciones abiertas" value="—" color="var(--color-primary)" />
        <StatCard label="Leads nuevos" value="—" color="var(--color-success)" />
        <StatCard label="Atención humana" value="—" color="var(--color-warning)" />
        {isSuperAdmin && <StatCard label="Tenants activos" value="—" color="var(--color-info)" />}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      padding: '20px 24px',
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ fontSize: '28px', fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>{label}</div>
    </div>
  );
}
