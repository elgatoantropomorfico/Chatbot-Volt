'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { UserCircle, Plus, Pencil, X, Check } from 'lucide-react';

export default function UsersPage() {
  const { user: currentUser, isSuperAdmin, isTenantAdmin } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', name: '', role: 'agent', tenantId: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', password: '' });
  const [saving, setSaving] = useState(false);

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
      setForm({ email: '', password: '', name: '', role: 'agent', tenantId: '' });
      await loadUsers();
    } catch (err: any) { alert(err.message); }
  }

  function startEdit(u: any) {
    setEditingId(u.id);
    setEditForm({ name: u.name || '', password: '' });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm({ name: '', password: '' });
  }

  async function saveEdit(userId: string) {
    setSaving(true);
    try {
      const data: any = {};
      if (editForm.name.trim()) data.name = editForm.name.trim();
      if (editForm.password.trim()) data.password = editForm.password.trim();
      if (Object.keys(data).length === 0) { cancelEdit(); setSaving(false); return; }
      await api.updateUser(userId, data);
      await loadUsers();
      cancelEdit();
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  }

  if (!isSuperAdmin && !isTenantAdmin) return <p style={{ color: 'var(--color-text-muted)' }}>Acceso denegado</p>;

  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text)', fontSize: '14px', outline: 'none', transition: 'all 0.15s' };
  const inlineInputStyle: React.CSSProperties = { padding: '6px 10px', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-light)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', fontSize: '13px', outline: 'none', width: '100%' };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '6px', fontWeight: 600, letterSpacing: '0.01em' };
  const roleLabels: Record<string, string> = { superadmin: 'Super Admin', tenant_admin: 'Admin', agent: 'Agente' };
  const thStyle: React.CSSProperties = { textAlign: 'left', padding: '12px 16px', fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 600, borderBottom: '1px solid var(--color-border)', background: 'rgba(139, 92, 246, 0.03)' };
  const tdStyle: React.CSSProperties = { padding: '14px 16px', fontSize: '13.5px', borderBottom: '1px solid rgba(139, 92, 246, 0.05)' };
  const iconBtnStyle: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: 'var(--radius-sm)', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 700, letterSpacing: '-0.02em', background: 'linear-gradient(135deg, var(--color-text), var(--color-text-secondary))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Usuarios</h1>
        <button onClick={() => setShowForm(!showForm)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 18px', background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 600, boxShadow: '0 2px 8px rgba(139, 92, 246, 0.3)', transition: 'all 0.15s' }}>
          <Plus size={16} /> Nuevo usuario
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '24px', marginBottom: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.3), 0 0 1px rgba(139, 92, 246, 0.15)' }}>
          <div>
            <label style={labelStyle}>Nombre</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre del usuario" style={inputStyle} />
          </div>
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
            <button type="submit" style={{ padding: '10px 22px', background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 600, boxShadow: '0 2px 8px rgba(139, 92, 246, 0.25)' }}>Crear</button>
          </div>
        </form>
      )}

      {loading ? <p style={{ color: 'var(--color-text-muted)', padding: '40px', textAlign: 'center' }}>Cargando...</p> : users.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 40px', color: 'var(--color-text-muted)' }}>
          <UserCircle size={36} style={{ marginBottom: '12px', opacity: 0.5 }} /><p>No hay usuarios</p>
        </div>
      ) : (
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.3), 0 0 1px rgba(139, 92, 246, 0.15)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              {['Nombre', 'Email', 'Rol', ...(isSuperAdmin ? ['Tenant'] : []), 'Acciones'].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ transition: 'background 0.15s' }} onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(139, 92, 246, 0.04)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                  {editingId === u.id ? (
                    <>
                      <td style={tdStyle}>
                        <input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="Nombre" style={inlineInputStyle} />
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 500, color: 'var(--color-text-muted)', fontSize: '13px' }}>{u.email}</td>
                      <td style={tdStyle}>
                        <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-full)', fontSize: '10.5px', fontWeight: 600, letterSpacing: '0.3px', background: u.role === 'superadmin' ? 'rgba(251, 113, 133, 0.12)' : u.role === 'tenant_admin' ? 'rgba(139, 92, 246, 0.12)' : 'rgba(110, 100, 148, 0.1)', color: u.role === 'superadmin' ? '#fb7185' : u.role === 'tenant_admin' ? '#a78bfa' : 'var(--color-text-muted)' }}>
                          {roleLabels[u.role] || u.role}
                        </span>
                      </td>
                      {isSuperAdmin && <td style={{ ...tdStyle, color: 'var(--color-text-muted)' }}>{u.tenantId || '—'}</td>}
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <input type="password" value={editForm.password} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} placeholder="Nueva contraseña (opcional)" style={inlineInputStyle} />
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => saveEdit(u.id)} disabled={saving} style={{ ...iconBtnStyle, color: 'var(--color-success)' }} title="Guardar">
                              <Check size={16} />
                            </button>
                            <button onClick={cancelEdit} style={{ ...iconBtnStyle, color: 'var(--color-danger)' }} title="Cancelar">
                              <X size={16} />
                            </button>
                          </div>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={{ ...tdStyle, fontWeight: 500 }}>{u.name || <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Sin nombre</span>}</td>
                      <td style={{ ...tdStyle, color: 'var(--color-text-secondary)' }}>{u.email}</td>
                      <td style={tdStyle}>
                        <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-full)', fontSize: '10.5px', fontWeight: 600, letterSpacing: '0.3px', background: u.role === 'superadmin' ? 'rgba(251, 113, 133, 0.12)' : u.role === 'tenant_admin' ? 'rgba(139, 92, 246, 0.12)' : 'rgba(110, 100, 148, 0.1)', color: u.role === 'superadmin' ? '#fb7185' : u.role === 'tenant_admin' ? '#a78bfa' : 'var(--color-text-muted)' }}>
                          {roleLabels[u.role] || u.role}
                        </span>
                      </td>
                      {isSuperAdmin && <td style={{ ...tdStyle, color: 'var(--color-text-muted)' }}>{u.tenantId || '—'}</td>}
                      <td style={tdStyle}>
                        <button onClick={() => startEdit(u)} style={{ ...iconBtnStyle, color: 'var(--color-primary)' }} title="Editar">
                          <Pencil size={15} />
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
