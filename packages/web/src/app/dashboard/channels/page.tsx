'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Phone, Plus } from 'lucide-react';

export default function ChannelsPage() {
  const { isSuperAdmin } = useAuth();
  const [channels, setChannels] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ tenantId: '', phoneNumberId: '', wabaId: '', displayPhone: '' });

  useEffect(() => {
    loadChannels();
    if (isSuperAdmin) loadTenants();
  }, []);

  async function loadChannels() {
    setLoading(true);
    try { const data = await api.getChannels(); setChannels(data.channels); }
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
      await api.createChannel(form);
      setShowForm(false);
      setForm({ tenantId: '', phoneNumberId: '', wabaId: '', displayPhone: '' });
      await loadChannels();
    } catch (err: any) { alert(err.message); }
  }

  async function toggleActive(id: string, isActive: boolean) {
    try {
      await api.updateChannel(id, { isActive: !isActive });
      await loadChannels();
    } catch (err: any) { alert(err.message); }
  }

  const inputStyle = { width: '100%', padding: '8px 12px', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', fontSize: '14px' };
  const labelStyle = { display: 'block' as const, fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '4px' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Channels</h1>
        {isSuperAdmin && (
          <button onClick={() => setShowForm(!showForm)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 500 }}>
            <Plus size={16} /> Nuevo channel
          </button>
        )}
      </div>

      {showForm && isSuperAdmin && (
        <form onSubmit={handleSubmit} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '20px', marginBottom: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={labelStyle}>Tenant</label>
            <select value={form.tenantId} onChange={(e) => setForm({ ...form, tenantId: e.target.value })} required style={inputStyle}>
              <option value="">Seleccionar...</option>
              {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Phone Number ID</label>
            <input value={form.phoneNumberId} onChange={(e) => setForm({ ...form, phoneNumberId: e.target.value })} required style={inputStyle} placeholder="Ej: 123456789012345" />
          </div>
          <div>
            <label style={labelStyle}>WABA ID</label>
            <input value={form.wabaId} onChange={(e) => setForm({ ...form, wabaId: e.target.value })} required style={inputStyle} placeholder="Ej: 987654321098765" />
          </div>
          <div>
            <label style={labelStyle}>Teléfono visible</label>
            <input value={form.displayPhone} onChange={(e) => setForm({ ...form, displayPhone: e.target.value })} style={inputStyle} placeholder="Ej: +54 9 11 1234-5678" />
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <button type="submit" style={{ padding: '8px 20px', background: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 500 }}>Crear</button>
          </div>
        </form>
      )}

      {loading ? <p>Cargando...</p> : channels.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)' }}>
          <Phone size={32} /><p>No hay channels configurados</p>
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            {['Tenant', 'Phone Number ID', 'WABA ID', 'Display', 'Estado', 'Acciones'].map((h) => (
              <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: '12px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--color-border)' }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {channels.map((ch) => (
              <tr key={ch.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: '12px 14px', fontSize: '14px' }}>{ch.tenant?.name || ch.tenantId}</td>
                <td style={{ padding: '12px 14px', fontSize: '13px', fontFamily: 'var(--font-mono)' }}>{ch.phoneNumberId}</td>
                <td style={{ padding: '12px 14px', fontSize: '13px', fontFamily: 'var(--font-mono)' }}>{ch.wabaId}</td>
                <td style={{ padding: '12px 14px', fontSize: '13px' }}>{ch.displayPhone || '—'}</td>
                <td style={{ padding: '12px 14px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: ch.isActive ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: ch.isActive ? 'var(--color-success)' : 'var(--color-text-muted)' }} />
                    {ch.isActive ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td style={{ padding: '12px 14px' }}>
                  {isSuperAdmin && (
                    <button onClick={() => toggleActive(ch.id, ch.isActive)} style={{ padding: '4px 10px', background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)', fontSize: '12px', cursor: 'pointer' }}>
                      {ch.isActive ? 'Desactivar' : 'Activar'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
