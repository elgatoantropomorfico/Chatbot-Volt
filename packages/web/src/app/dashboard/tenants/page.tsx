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
    active: 'var(--color-success)',
    inactive: 'var(--color-text-muted)',
    suspended: 'var(--color-danger)',
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Tenants</h1>
        <button
          onClick={() => { setShowForm(!showForm); setEditingId(null); setForm({ name: '', timezone: 'America/Argentina/Buenos_Aires' }); }}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 500 }}
        >
          <Plus size={16} /> Nuevo tenant
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '20px', marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>Nombre</label>
            <input
              value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required
              style={{ width: '100%', padding: '8px 12px', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', fontSize: '14px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>Timezone</label>
            <input
              value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              style={{ padding: '8px 12px', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', fontSize: '14px' }}
            />
          </div>
          <button type="submit" style={{ padding: '8px 20px', background: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 500 }}>
            {editingId ? 'Actualizar' : 'Crear'}
          </button>
        </form>
      )}

      {loading ? <p>Cargando...</p> : tenants.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)' }}>
          <Building2 size={32} /><p>No hay tenants</p>
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Nombre', 'Estado', 'Timezone', 'Usuarios', 'Channels', 'Leads', 'Acciones'].map((h) => (
                <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: '12px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--color-border)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: '12px 14px', fontSize: '14px', fontWeight: 500 }}>{t.name}</td>
                <td style={{ padding: '12px 14px' }}>
                  <button onClick={() => handleToggleStatus(t.id, t.status)} style={{ background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: statusColors[t.status] || 'gray' }} />
                    <span style={{ fontSize: '13px', color: statusColors[t.status], textTransform: 'capitalize' }}>{t.status}</span>
                  </button>
                </td>
                <td style={{ padding: '12px 14px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>{t.timezone}</td>
                <td style={{ padding: '12px 14px', fontSize: '13px' }}>{t._count?.users ?? 0}</td>
                <td style={{ padding: '12px 14px', fontSize: '13px' }}>{t._count?.channels ?? 0}</td>
                <td style={{ padding: '12px 14px', fontSize: '13px' }}>{t._count?.leads ?? 0}</td>
                <td style={{ padding: '12px 14px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => startEdit(t)} style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer' }}><Pencil size={15} /></button>
                    <button onClick={() => handleDelete(t.id)} style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer' }}><Trash2 size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
