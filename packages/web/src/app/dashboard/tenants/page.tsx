'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Building2, Plus, Pencil, Trash2 } from 'lucide-react';

export default function TenantsPage() {
  const { isSuperAdmin } = useAuth();
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', timezone: 'America/Argentina/Buenos_Aires' });

  useEffect(() => { loadTenants(); }, []);

  async function loadTenants() {
    setLoading(true);
    try {
      const data = await api.getTenants();
      setTenants(data.tenants);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editingId) {
        await api.updateTenant(editingId, form);
      } else {
        await api.createTenant(form);
      }
      setShowForm(false);
      setEditingId(null);
      setForm({ name: '', timezone: 'America/Argentina/Buenos_Aires' });
      await loadTenants();
    } catch (err: any) { alert(err.message); }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este tenant? Esta acción es irreversible.')) return;
    try {
      await api.deleteTenant(id);
      await loadTenants();
    } catch (err: any) { alert(err.message); }
  }

  async function handleToggleStatus(id: string, currentStatus: string) {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    try {
      await api.updateTenant(id, { status: newStatus });
      await loadTenants();
    } catch (err: any) { alert(err.message); }
  }

  function startEdit(tenant: any) {
    setEditingId(tenant.id);
    setForm({ name: tenant.name, timezone: tenant.timezone });
    setShowForm(true);
  }

  if (!isSuperAdmin) return <p style={{ color: 'var(--color-text-muted)' }}>Acceso denegado</p>;

  const statusColors: Record<string, string> = {
    active: '#34d399',
    inactive: 'var(--color-text-muted)',
    suspended: '#fb7185',
  };

  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text)', fontSize: '14px', outline: 'none', transition: 'all 0.15s' };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '6px', fontWeight: 600, letterSpacing: '0.01em' };
  const thStyle: React.CSSProperties = { textAlign: 'left', padding: '12px 16px', fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 600, borderBottom: '1px solid var(--color-border)', background: 'rgba(139, 92, 246, 0.03)' };
  const tdStyle: React.CSSProperties = { padding: '14px 16px', fontSize: '13.5px', borderBottom: '1px solid rgba(139, 92, 246, 0.05)' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 700, letterSpacing: '-0.02em', background: 'linear-gradient(135deg, var(--color-text), var(--color-text-secondary))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Tenants</h1>
        <button
          onClick={() => { setShowForm(!showForm); setEditingId(null); setForm({ name: '', timezone: 'America/Argentina/Buenos_Aires' }); }}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 18px', background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 600, boxShadow: '0 2px 8px rgba(139, 92, 246, 0.3)', transition: 'all 0.15s' }}
        >
          <Plus size={16} /> Nuevo tenant
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '24px', marginBottom: '20px', display: 'flex', gap: '14px', alignItems: 'flex-end', boxShadow: '0 2px 8px rgba(0,0,0,0.3), 0 0 1px rgba(139, 92, 246, 0.15)' }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Nombre</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Timezone</label>
            <input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} style={inputStyle} />
          </div>
          <button type="submit" style={{ padding: '10px 22px', background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 600, boxShadow: '0 2px 8px rgba(139, 92, 246, 0.25)', whiteSpace: 'nowrap' }}>
            {editingId ? 'Actualizar' : 'Crear'}
          </button>
        </form>
      )}

      {loading ? <p style={{ color: 'var(--color-text-muted)', padding: '40px', textAlign: 'center' }}>Cargando...</p> : tenants.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 40px', color: 'var(--color-text-muted)' }}>
          <Building2 size={36} style={{ marginBottom: '12px', opacity: 0.5 }} /><p>No hay tenants</p>
        </div>
      ) : (
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.3), 0 0 1px rgba(139, 92, 246, 0.15)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Nombre', 'Estado', 'Timezone', 'Usuarios', 'Channels', 'Leads', 'Acciones'].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id} style={{ transition: 'background 0.15s' }} onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(139, 92, 246, 0.04)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{t.name}</td>
                  <td style={tdStyle}>
                    <button onClick={() => handleToggleStatus(t.id, t.status)} style={{ background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', transition: 'opacity 0.15s' }}>
                      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: statusColors[t.status] || 'gray', boxShadow: t.status === 'active' ? '0 0 6px rgba(52, 211, 153, 0.4)' : 'none' }} />
                      <span style={{ fontSize: '13px', color: statusColors[t.status], textTransform: 'capitalize', fontWeight: 500 }}>{t.status}</span>
                    </button>
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{t.timezone}</td>
                  <td style={{ ...tdStyle, fontWeight: 500 }}>{t._count?.users ?? 0}</td>
                  <td style={{ ...tdStyle, fontWeight: 500 }}>{t._count?.channels ?? 0}</td>
                  <td style={{ ...tdStyle, fontWeight: 500 }}>{t._count?.leads ?? 0}</td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => startEdit(t)} style={{ background: 'rgba(139, 92, 246, 0.08)', border: 'none', color: '#a78bfa', cursor: 'pointer', padding: '6px', borderRadius: 'var(--radius-sm)', transition: 'all 0.15s', display: 'flex' }} onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(139, 92, 246, 0.15)'} onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(139, 92, 246, 0.08)'}><Pencil size={14} /></button>
                      <button onClick={() => handleDelete(t.id)} style={{ background: 'rgba(251, 113, 133, 0.08)', border: 'none', color: '#fb7185', cursor: 'pointer', padding: '6px', borderRadius: 'var(--radius-sm)', transition: 'all 0.15s', display: 'flex' }} onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(251, 113, 133, 0.15)'} onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(251, 113, 133, 0.08)'}><Trash2 size={14} /></button>
                    </div>
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
