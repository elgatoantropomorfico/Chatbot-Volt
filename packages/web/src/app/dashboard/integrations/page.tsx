'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Plug, Plus } from 'lucide-react';

export default function IntegrationsPage() {
  const { user, isSuperAdmin, isTenantAdmin } = useAuth();
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ tenantId: '', type: 'woocommerce', baseUrl: '', consumerKey: '', consumerSecret: '' });

  useEffect(() => {
    loadIntegrations();
    if (isSuperAdmin) loadTenants();
  }, []);

  async function loadIntegrations() {
    setLoading(true);
    try { const data = await api.getIntegrations(); setIntegrations(data.integrations); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  async function loadTenants() {
    try { const data = await api.getTenants(); setTenants(data.tenants); }
    catch (err) { console.error(err); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.createIntegration({
        tenantId: isTenantAdmin ? user?.tenantId : form.tenantId,
        type: form.type,
        config: { baseUrl: form.baseUrl, consumerKey: form.consumerKey, consumerSecret: form.consumerSecret },
      });
      setShowForm(false);
      setForm({ tenantId: '', type: 'woocommerce', baseUrl: '', consumerKey: '', consumerSecret: '' });
      await loadIntegrations();
    } catch (err: any) { alert(err.message); }
  }

  async function toggleStatus(id: string, currentStatus: string) {
    try {
      await api.updateIntegration(id, { status: currentStatus === 'active' ? 'inactive' : 'active' });
      await loadIntegrations();
    } catch (err: any) { alert(err.message); }
  }

  if (!isSuperAdmin && !isTenantAdmin) return <p style={{ color: 'var(--color-text-muted)' }}>Acceso denegado</p>;

  const inputStyle = { width: '100%', padding: '8px 12px', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', fontSize: '14px' };
  const labelStyle = { display: 'block' as const, fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '4px' };

  const typeLabels: Record<string, string> = { woocommerce: 'WooCommerce' };
  const statusColors: Record<string, string> = { active: 'var(--color-success)', inactive: 'var(--color-text-muted)', error: 'var(--color-danger)' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Integraciones</h1>
        <button onClick={() => setShowForm(!showForm)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 500 }}>
          <Plus size={16} /> Nueva integración
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '20px', marginBottom: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {isSuperAdmin && (
            <div>
              <label style={labelStyle}>Tenant</label>
              <select value={form.tenantId} onChange={(e) => setForm({ ...form, tenantId: e.target.value })} required style={inputStyle}>
                <option value="">Seleccionar...</option>
                {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label style={labelStyle}>Tipo</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} style={inputStyle}>
              <option value="woocommerce">WooCommerce</option>
            </select>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={labelStyle}>URL de la tienda</label>
            <input value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} required placeholder="https://tu-tienda.com" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Consumer Key</label>
            <input value={form.consumerKey} onChange={(e) => setForm({ ...form, consumerKey: e.target.value })} required placeholder="ck_..." style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Consumer Secret</label>
            <input type="password" value={form.consumerSecret} onChange={(e) => setForm({ ...form, consumerSecret: e.target.value })} required placeholder="cs_..." style={inputStyle} />
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <button type="submit" style={{ padding: '8px 20px', background: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 500 }}>Crear</button>
          </div>
        </form>
      )}

      {loading ? <p>Cargando...</p> : integrations.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)' }}>
          <Plug size={32} /><p>No hay integraciones configuradas</p>
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            {['Tipo', 'Tenant', 'Estado', 'Creado', 'Acciones'].map((h) => (
              <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: '12px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--color-border)' }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {integrations.map((i) => (
              <tr key={i.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: '12px 14px', fontSize: '14px', fontWeight: 500 }}>{typeLabels[i.type] || i.type}</td>
                <td style={{ padding: '12px 14px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>{i.tenantId}</td>
                <td style={{ padding: '12px 14px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: statusColors[i.status] }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: statusColors[i.status] }} />
                    {i.status}
                  </span>
                </td>
                <td style={{ padding: '12px 14px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>{new Date(i.createdAt).toLocaleDateString('es-AR')}</td>
                <td style={{ padding: '12px 14px' }}>
                  <button onClick={() => toggleStatus(i.id, i.status)} style={{ padding: '4px 10px', background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)', fontSize: '12px', cursor: 'pointer' }}>
                    {i.status === 'active' ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
