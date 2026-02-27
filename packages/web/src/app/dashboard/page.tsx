'use client';

import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { useState, useEffect } from 'react';
import { MessageSquare, Users, Clock, TrendingUp, ShoppingCart, Phone, Bot, AlertTriangle } from 'lucide-react';
import styles from './layout.module.css';

interface DashboardStats {
  conversations: {
    total: number;
    active: number;
    pendingHuman: number;
  };
  leads: {
    total: number;
    newToday: number;
    newThisWeek: number;
  };
  messages: {
    total: number;
    todayCount: number;
    avgResponseTime: number;
  };
  sales?: {
    total: number;
    todayRevenue: number;
    pendingOrders: number;
  };
  tenants?: {
    total: number;
    active: number;
  };
}

export default function DashboardPage() {
  const { user, isSuperAdmin } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    try {
      const data = await api.getDashboardStats();
      setStats(data);
    } catch (error) {
      console.error('Failed to load dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div>
        <div className={styles.pageHeader}>
          <h1>Dashboard</h1>
          <p>Bienvenido, {user?.email}</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{
              padding: '24px 28px', background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)', height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center'
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '32px' }}>
        <StatCard 
          icon={<MessageSquare size={20} />}
          label="Conversaciones activas" 
          value={stats?.conversations.active?.toString() || '0'} 
          subtitle={`${stats?.conversations.total || 0} total`}
          color="#8b5cf6" 
          glow="rgba(139, 92, 246, 0.15)" 
        />
        <StatCard 
          icon={<Users size={20} />}
          label="Leads nuevos hoy" 
          value={stats?.leads.newToday?.toString() || '0'} 
          subtitle={`${stats?.leads.newThisWeek || 0} esta semana`}
          color="#34d399" 
          glow="rgba(52, 211, 153, 0.15)" 
        />
        <StatCard 
          icon={<Phone size={20} />}
          label="Atención humana" 
          value={stats?.conversations.pendingHuman?.toString() || '0'} 
          subtitle="Conversaciones pendientes"
          color="#fbbf24" 
          glow="rgba(251, 191, 36, 0.15)" 
        />
        <StatCard 
          icon={<Bot size={20} />}
          label="Mensajes hoy" 
          value={stats?.messages.todayCount?.toString() || '0'} 
          subtitle={`${stats?.messages.total || 0} total`}
          color="#06b6d4" 
          glow="rgba(6, 182, 212, 0.15)" 
        />
        {stats?.sales && (
          <>
            <StatCard 
              icon={<ShoppingCart size={20} />}
              label="Ventas hoy" 
              value={`$${stats.sales.todayRevenue?.toLocaleString('es-AR') || '0'}`} 
              subtitle={`${stats.sales.total || 0} órdenes total`}
              color="#10b981" 
              glow="rgba(16, 185, 129, 0.15)" 
            />
            <StatCard 
              icon={<Clock size={20} />}
              label="Órdenes pendientes" 
              value={stats.sales.pendingOrders?.toString() || '0'} 
              subtitle="Esperando confirmación"
              color="#f59e0b" 
              glow="rgba(245, 158, 11, 0.15)" 
            />
          </>
        )}
        {isSuperAdmin && stats?.tenants && (
          <StatCard 
            icon={<TrendingUp size={20} />}
            label="Tenants activos" 
            value={stats.tenants.active?.toString() || '0'} 
            subtitle={`${stats.tenants.total || 0} total`}
            color="#67e8f9" 
            glow="rgba(103, 232, 249, 0.15)" 
          />
        )}
      </div>

      {stats?.messages.avgResponseTime && (
        <div style={{ 
          padding: '20px 24px', background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)', marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <TrendingUp size={16} style={{ color: 'var(--color-primary)' }} />
            <span style={{ fontSize: '14px', fontWeight: 600 }}>Tiempo de respuesta promedio</span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-primary)' }}>
            {stats.messages.avgResponseTime < 60 
              ? `${Math.round(stats.messages.avgResponseTime)}s`
              : `${Math.round(stats.messages.avgResponseTime / 60)}min`
            }
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            Tiempo promedio entre mensaje del cliente y respuesta del bot
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, subtitle, color, glow }: { 
  icon?: React.ReactNode; 
  label: string; 
  value: string; 
  subtitle?: string;
  color: string; 
  glow: string; 
}) {
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', position: 'relative' }}>
        {icon && <div style={{ color }}>{icon}</div>}
        <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', fontWeight: 500 }}>{label}</div>
      </div>
      <div style={{ fontSize: '32px', fontWeight: 800, color, letterSpacing: '-0.02em', position: 'relative', marginBottom: '4px' }}>{value}</div>
      {subtitle && <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', position: 'relative' }}>{subtitle}</div>}
    </div>
  );
}
