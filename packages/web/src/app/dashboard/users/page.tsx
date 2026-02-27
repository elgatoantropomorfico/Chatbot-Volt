'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { UserCircle, Plus } from 'lucide-react';

export default function UsersPage() {
  const { user: currentUser, isSuperAdmin, isTenantAdmin } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', role: 'agent', tenantId: '' });

  useEffect(() => {
    loadUsers();
    if (isSuperAdmin) loadTenants();
  }, []);

  async function loadUsers() {
    setLoading(true);
    try { const data = await api.getUsers(); setUsers(data.users); }
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
      const payload = {
        ...form,
        tenantId: isTenantAdmin ? currentUser?.tenantId : form.tenantId,
      };
      await api.createUser(payload);
      setShowForm(false);
      setForm({ email: '', password: '', role: 'agent', tenantId: '' });
      await loadUsers();
    } catch (err: any) { alert(err.message); }
  }

  if (!isSuperAdmin && !isTenantAdmin) return <p style={{ color: 'var(--color-text-muted)' }}>Acceso denegado</p>;

  const inputStyle = { width: '100%', padding: '8px 12px', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', fontSize: '14px' };
  const labelStyle = { display: 'block' as const, fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '4px' };
  const roleLabels: Record<string, string> = { superadmin: 'Super Admin', tenant_admin: 'Admin', agent: 'Agente' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Usuarios</h1>
        <button onClick={() => setShowForm(!showForm)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 500 }}>
          <Plus size={16} /> Nuevo usuario
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '20px', marginBottom: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={labelStyle}>Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Contraseña</label>
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Rol</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} style={inputStyle}>
              <option value="agent">Agente</option>
              <option value="tenant_admin">Admin</option>
            </select>
          </div>
          {isSuperAdmin && (
            <div>
              <label style={labelStyle}>Tenant</label>
              <select value={form.tenantId} onChange={(e) => setForm({ ...form, tenantId: e.target.value })} required style={inputStyle}>
                <option value="">Seleccionar...</option>
                {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
          <div style={{ gridColumn: 'span 2' }}>
            <button type="submit" style={{ padding: '8px 20px', background: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 500 }}>Crear</button>
          </div>
        </form>
      )}

      {loading ? <p>Cargando...</p> : users.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)' }}>
          <UserCircle size={32} /><p>No hay usuarios</p>
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            {['Email', 'Rol', 'Tenant', 'Creado'].map((h) => (
              <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: '12px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--color-border)' }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: '12px 14px', fontSize: '14px' }}>{u.email}</td>
                <td style={{ padding: '12px 14px', fontSize: '13px' }}>
                  <span style={{ padding: '2px 8px', borderRadius: 'var(--radius-full)', fontSize: '11px', fontWeight: 600, background: u.role === 'superadmin' ? 'var(--color-danger-light)' : u.role === 'tenant_admin' ? 'var(--color-primary-light)' : 'var(--color-bg-tertiary)', color: u.role === 'superadmin' ? 'var(--color-danger)' : u.role === 'tenant_admin' ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}>
                    {roleLabels[u.role] || u.role}
                  </span>
                </td>
                <td style={{ padding: '12px 14px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>{u.tenantId || '—'}</td>
                <td style={{ padding: '12px 14px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>{new Date(u.createdAt).toLocaleDateString('es-AR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
