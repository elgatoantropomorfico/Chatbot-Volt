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

  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text)', fontSize: '14px', outline: 'none', transition: 'all 0.15s' };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '6px', fontWeight: 600, letterSpacing: '0.01em' };
  const thStyle: React.CSSProperties = { textAlign: 'left', padding: '12px 16px', fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 600, borderBottom: '1px solid var(--color-border)', background: 'rgba(139, 92, 246, 0.03)' };
  const tdStyle: React.CSSProperties = { padding: '14px 16px', fontSize: '13.5px', borderBottom: '1px solid rgba(139, 92, 246, 0.05)' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 700, letterSpacing: '-0.02em', background: 'linear-gradient(135deg, var(--color-text), var(--color-text-secondary))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Channels</h1>
        {isSuperAdmin && (
          <button onClick={() => setShowForm(!showForm)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 18px', background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 600, boxShadow: '0 2px 8px rgba(139, 92, 246, 0.3)', transition: 'all 0.15s' }}>
            <Plus size={16} /> Nuevo channel
          </button>
        )}
      </div>

      {showForm && isSuperAdmin && (
        <form onSubmit={handleSubmit} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '24px', marginBottom: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.3), 0 0 1px rgba(139, 92, 246, 0.15)' }}>
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
            <button type="submit" style={{ padding: '10px 22px', background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 600, boxShadow: '0 2px 8px rgba(139, 92, 246, 0.25)' }}>Crear</button>
          </div>
        </form>
      )}

      {loading ? <p style={{ color: 'var(--color-text-muted)', padding: '40px', textAlign: 'center' }}>Cargando...</p> : channels.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 40px', color: 'var(--color-text-muted)' }}>
          <Phone size={36} style={{ marginBottom: '12px', opacity: 0.5 }} /><p>No hay channels configurados</p>
        </div>
      ) : (
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.3), 0 0 1px rgba(139, 92, 246, 0.15)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              {['Tenant', 'Phone Number ID', 'WABA ID', 'Display', 'Estado', 'Acciones'].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {channels.map((ch) => (
                <tr key={ch.id} style={{ transition: 'background 0.15s' }} onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(139, 92, 246, 0.04)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{ch.tenant?.name || ch.tenantId}</td>
                  <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--color-text-muted)' }}>{ch.phoneNumberId}</td>
                  <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--color-text-muted)' }}>{ch.wabaId}</td>
                  <td style={tdStyle}>{ch.displayPhone || '—'}</td>
                  <td style={tdStyle}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: ch.isActive ? '#34d399' : 'var(--color-text-muted)', fontWeight: 500 }}>
                      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: ch.isActive ? '#34d399' : 'var(--color-text-muted)', boxShadow: ch.isActive ? '0 0 6px rgba(52, 211, 153, 0.4)' : 'none' }} />
                      {ch.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {isSuperAdmin && (
                      <button onClick={() => toggleActive(ch.id, ch.isActive)} style={{ padding: '5px 12px', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)', fontSize: '12px', cursor: 'pointer', fontWeight: 500, transition: 'all 0.15s' }}>
                        {ch.isActive ? 'Desactivar' : 'Activar'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
