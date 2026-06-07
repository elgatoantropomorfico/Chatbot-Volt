'use client';

import { useEffect, useState } from 'react';
import { Plus, Pencil, X, Check, UserCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { primaryBtnStyle, inputStyle, labelStyle, iconBtnStyle, inlineInputStyle } from './styles';
import type { Feedback, TenantSummary } from './types';

interface Props {
  tenant: TenantSummary;
  onFeedback: (feedback: Feedback) => void;
}

export function TenantUsersTab({ tenant, onFeedback }: Props) {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewUser, setShowNewUser] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'tenant_admin' });
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', password: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadUsers(); }, [tenant.id]);

  async function loadUsers() {
    setLoading(true);
    try {
      const data = await api.getUsers();
      setUsers(data.users.filter((u: any) => u.tenantId === tenant.id));
    } catch (err) {
      console.error(err);
      onFeedback({ type: 'err', text: 'Error al cargar usuarios' });
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    if (!form.email || !form.password) return;
    setCreating(true);
    try {
      await api.createUser({ ...form, tenantId: tenant.id });
      setForm({ name: '', email: '', password: '', role: 'tenant_admin' });
      setShowNewUser(false);
      await loadUsers();
      onFeedback({ type: 'ok', text: 'Usuario creado correctamente' });
    } catch (err: any) {
      onFeedback({ type: 'err', text: err.message || 'Error al crear usuario' });
    } finally {
      setCreating(false);
    }
  }

  function startEdit(u: any) {
    setEditingId(u.id);
    setEditForm({ name: u.name || '', email: u.email || '', password: '' });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm({ name: '', email: '', password: '' });
  }

  async function saveEdit(userId: string, originalEmail: string) {
    setSaving(true);
    try {
      const data: any = {};
      if (editForm.name.trim()) data.name = editForm.name.trim();
      if (editForm.email.trim() && editForm.email.trim() !== originalEmail) data.email = editForm.email.trim();
      if (editForm.password.trim()) data.password = editForm.password.trim();
      if (Object.keys(data).length === 0) { cancelEdit(); setSaving(false); return; }
      await api.updateUser(userId, data);
      await loadUsers();
      cancelEdit();
      onFeedback({ type: 'ok', text: 'Usuario actualizado' });
    } catch (err: any) {
      onFeedback({ type: 'err', text: err.message || 'Error al actualizar usuario' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)' }}>Cargando usuarios...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{users.length} usuario{users.length !== 1 ? 's' : ''}</span>
        <button onClick={() => setShowNewUser(!showNewUser)} style={{
          display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', fontSize: '12px',
          background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)', color: 'white', border: 'none',
          borderRadius: 'var(--radius-sm)', fontWeight: 600, cursor: 'pointer',
        }}>
          <Plus size={14} /> Nuevo usuario
        </button>
      </div>

      {showNewUser && (
        <form onSubmit={handleCreateUser} style={{
          padding: '16px', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-sm)',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px',
        }}>
          <div>
            <label style={labelStyle}>Nombre</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} type="text" style={inputStyle} placeholder="Nombre del usuario" />
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} type="email" required style={inputStyle} placeholder="email@ejemplo.com" />
          </div>
          <div>
            <label style={labelStyle}>Contraseña</label>
            <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} type="password" required style={inputStyle} placeholder="min. 6 caracteres" />
          </div>
          <div>
            <label style={labelStyle}>Rol</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} style={inputStyle}>
              <option value="tenant_admin">Admin</option>
              <option value="agent">Agente</option>
            </select>
          </div>
          <div style={{ gridColumn: 'span 2', display: 'flex', gap: '8px' }}>
            <button type="submit" disabled={creating} style={{ ...primaryBtnStyle, padding: '10px 18px', fontSize: '12px' }}>
              {creating ? 'Creando...' : 'Crear'}
            </button>
            <button type="button" onClick={() => setShowNewUser(false)} style={{
              padding: '10px 14px', background: 'transparent', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--color-text-muted)', cursor: 'pointer',
            }}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {users.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '30px', color: 'var(--color-text-muted)', fontSize: '13px' }}>
          No hay usuarios. Creá uno para que pueda acceder al panel del tenant.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {users.map((u) => (
            <div key={u.id} style={{
              padding: '12px 16px', background: 'var(--color-bg-secondary)',
              borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)',
            }}>
              {editingId === u.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ ...labelStyle, marginBottom: '4px' }}>Nombre</label>
                      <input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="Nombre" style={inlineInputStyle} />
                    </div>
                    <div>
                      <label style={{ ...labelStyle, marginBottom: '4px' }}>Email</label>
                      <input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} placeholder="email@ejemplo.com" style={inlineInputStyle} />
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={{ ...labelStyle, marginBottom: '4px' }}>Nueva contraseña</label>
                      <input type="password" value={editForm.password} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} placeholder="Dejar vacío para no cambiar" style={inlineInputStyle} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{u.role === 'tenant_admin' ? 'Admin' : 'Agente'}</span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => saveEdit(u.id, u.email)} disabled={saving} style={{ ...iconBtnStyle, color: 'var(--color-success)' }} title="Guardar">
                        <Check size={16} />
                      </button>
                      <button onClick={cancelEdit} style={{ ...iconBtnStyle, color: 'var(--color-danger)' }} title="Cancelar">
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <UserCircle size={18} style={{ color: 'var(--color-text-muted)' }} />
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 500 }}>
                        {u.name || <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Sin nombre</span>}
                        <span style={{ color: 'var(--color-text-muted)', fontWeight: 400, marginLeft: '8px', fontSize: '12px' }}>{u.email}</span>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                        {u.role === 'tenant_admin' ? 'Admin' : 'Agente'}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => startEdit(u)} style={{ ...iconBtnStyle, color: 'var(--color-primary)' }} title="Editar nombre / contraseña">
                    <Pencil size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
