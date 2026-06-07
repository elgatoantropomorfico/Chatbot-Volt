'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, X } from 'lucide-react';
import { api } from '@/lib/api';
import { FeedbackBanner } from './FeedbackBanner';
import { TenantCard } from './TenantCard';
import { TenantDetailModal } from './TenantDetailModal';
import type { Feedback, TenantSummary, TenantTab } from './types';

function parseTab(value: string | null): TenantTab {
  if (value === 'channels' || value === 'channel') return 'channels';
  if (value === 'users') return 'users';
  return 'general';
}

export function SuperAdminPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTenant, setSelectedTenant] = useState<TenantSummary | null>(null);
  const [activeTab, setActiveTab] = useState<TenantTab>('general');
  const [showNewTenant, setShowNewTenant] = useState(false);
  const [newTenantName, setNewTenantName] = useState('');
  const [creating, setCreating] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [deepLinkHandled, setDeepLinkHandled] = useState(false);

  const loadTenants = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getTenants();
      setTenants(data.tenants);
    } catch (err) {
      console.error(err);
      setFeedback({ type: 'err', text: 'Error al cargar tenants' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTenants(); }, [loadTenants]);

  const updateUrl = useCallback((tenantId?: string | null, tab?: TenantTab) => {
    const params = new URLSearchParams();
    if (tenantId) params.set('tenant', tenantId);
    if (tab && tab !== 'general') params.set('tab', tab);
    const qs = params.toString();
    router.replace(qs ? `/dashboard?${qs}` : '/dashboard', { scroll: false });
  }, [router]);

  const openTenantDetail = useCallback(async (tenant: TenantSummary, tab: TenantTab = 'general') => {
    try {
      const data = await api.getTenant(tenant.id);
      setSelectedTenant(data.tenant);
      setActiveTab(tab);
      updateUrl(tenant.id, tab);
    } catch (err) {
      console.error(err);
      setFeedback({ type: 'err', text: 'Error al cargar el tenant' });
    }
  }, [updateUrl]);

  const closeModal = useCallback(() => {
    setSelectedTenant(null);
    setActiveTab('general');
    updateUrl(null);
  }, [updateUrl]);

  const refreshSelectedTenant = useCallback(async () => {
    await loadTenants();
    if (!selectedTenant) return;
    const data = await api.getTenant(selectedTenant.id);
    setSelectedTenant(data.tenant);
  }, [loadTenants, selectedTenant]);

  const handleTabChange = useCallback((tab: TenantTab) => {
    setActiveTab(tab);
    if (selectedTenant) updateUrl(selectedTenant.id, tab);
  }, [selectedTenant, updateUrl]);

  const showFeedback = useCallback((msg: Feedback) => {
    setFeedback(msg);
    if (msg.type === 'ok') {
      setTimeout(() => setFeedback((prev) => (prev?.text === msg.text ? null : prev)), 4000);
    }
  }, []);

  // Deep link: ?tenant=id&tab=channels
  useEffect(() => {
    if (deepLinkHandled || loading) return;
    const tenantId = searchParams.get('tenant');
    if (!tenantId) {
      setDeepLinkHandled(true);
      return;
    }
    const tab = parseTab(searchParams.get('tab'));
    const tenant = tenants.find((t) => t.id === tenantId);
    if (tenant) {
      openTenantDetail(tenant, tab);
    }
    setDeepLinkHandled(true);
  }, [deepLinkHandled, loading, tenants, searchParams, openTenantDetail]);

  async function handleCreateTenant(e: React.FormEvent) {
    e.preventDefault();
    if (!newTenantName.trim()) return;
    setCreating(true);
    try {
      await api.createTenant({ name: newTenantName.trim() });
      setNewTenantName('');
      setShowNewTenant(false);
      await loadTenants();
      showFeedback({ type: 'ok', text: 'Tenant creado correctamente' });
    } catch (err: any) {
      showFeedback({ type: 'err', text: err.message || 'Error al crear tenant' });
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader count={0} onNew={() => {}} showButton={false} />
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--color-text-muted)' }}>Cargando...</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader count={tenants.length} onNew={() => setShowNewTenant(true)} showButton />

      {feedback && (
        <FeedbackBanner feedback={feedback} onDismiss={() => setFeedback(null)} />
      )}

      {showNewTenant && (
        <form onSubmit={handleCreateTenant} style={{
          display: 'flex', gap: '12px', marginBottom: '20px', padding: '16px',
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)', alignItems: 'flex-end',
        }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '6px', fontWeight: 600 }}>
              Nombre del tenant
            </label>
            <input
              value={newTenantName}
              onChange={(e) => setNewTenantName(e.target.value)}
              placeholder="Ej: Mi Tienda"
              autoFocus
              style={{
                width: '100%', padding: '10px 14px', background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
                color: 'var(--color-text)', fontSize: '14px', outline: 'none',
              }}
            />
          </div>
          <button type="submit" disabled={creating} style={{
            padding: '10px 20px', background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)',
            color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '13px',
            fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
            {creating ? 'Creando...' : 'Crear'}
          </button>
          <button type="button" onClick={() => { setShowNewTenant(false); setNewTenantName(''); }} style={{
            padding: '10px 14px', background: 'transparent', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)', color: 'var(--color-text-muted)', cursor: 'pointer',
          }}>
            <X size={16} />
          </button>
        </form>
      )}

      {tenants.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '60px 40px', color: 'var(--color-text-muted)',
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
        }}>
          <p style={{ fontSize: '15px', marginBottom: '8px' }}>No hay tenants registrados</p>
          <p style={{ fontSize: '13px' }}>Creá el primero para empezar a configurar cuentas.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
          {tenants.map((tenant) => (
            <TenantCard
              key={tenant.id}
              tenant={tenant}
              onOpen={(tab) => openTenantDetail(tenant, tab || 'general')}
            />
          ))}
        </div>
      )}

      {selectedTenant && (
        <TenantDetailModal
          tenant={selectedTenant}
          onClose={closeModal}
          onTenantDeleted={async () => {
            setSelectedTenant(null);
            updateUrl(null);
            await loadTenants();
          }}
          onRefresh={refreshSelectedTenant}
          activeTab={activeTab}
          setActiveTab={handleTabChange}
          onFeedback={showFeedback}
        />
      )}
    </div>
  );
}

function PageHeader({ count, onNew, showButton }: { count: number; onNew: () => void; showButton: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
      <div>
        <h1 style={{ fontSize: '26px', fontWeight: 700, letterSpacing: '-0.02em' }}>Tenants</h1>
        <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
          {count} cuenta{count !== 1 ? 's' : ''} registrada{count !== 1 ? 's' : ''}
        </p>
      </div>
      {showButton && (
        <button
          onClick={onNew}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 18px',
            background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)', color: 'white', border: 'none',
            borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(139, 92, 246, 0.3)',
          }}
        >
          <Plus size={16} /> Nuevo tenant
        </button>
      )}
    </div>
  );
}
