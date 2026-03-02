'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { Settings, Pencil, Check, X } from 'lucide-react';

export default function SettingsPage() {
  const { user, isSuperAdmin, refreshUser } = useAuth();
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: '', password: '', confirmPassword: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  function startEditProfile() {
    setEditingProfile(true);
    setProfileForm({ name: user?.name || '', password: '', confirmPassword: '' });
    setMessage(null);
  }

  function cancelEditProfile() {
    setEditingProfile(false);
    setProfileForm({ name: '', password: '', confirmPassword: '' });
    setMessage(null);
  }

  async function saveProfile() {
    if (profileForm.password && profileForm.password !== profileForm.confirmPassword) {
      setMessage({ type: 'error', text: 'Las contraseñas no coinciden' });
      return;
    }
    if (profileForm.password && profileForm.password.length < 6) {
      setMessage({ type: 'error', text: 'La contraseña debe tener al menos 6 caracteres' });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const data: any = {};
      if (profileForm.name.trim()) data.name = profileForm.name.trim();
      if (profileForm.password.trim()) data.password = profileForm.password.trim();
      if (Object.keys(data).length === 0) {
        cancelEditProfile();
        return;
      }
      await api.updateProfile(data);
      await refreshUser();
      setEditingProfile(false);
      setMessage({ type: 'success', text: 'Perfil actualizado correctamente' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error al actualizar' });
    } finally {
      setSaving(false);
    }
  }

  const cardStyle: React.CSSProperties = {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-lg)',
    padding: '24px',
    marginBottom: '16px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3), 0 0 1px rgba(139, 92, 246, 0.15)',
    position: 'relative' as const,
    overflow: 'hidden' as const,
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '13px',
    padding: '8px 0',
    borderBottom: '1px solid rgba(139, 92, 246, 0.04)',
  };

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px',
    background: 'var(--color-bg-secondary)',
    border: '1px solid var(--color-border-light)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--color-text)',
    fontSize: '13px',
    outline: 'none',
    width: '240px',
  };

  const btnStyle: React.CSSProperties = {
    padding: '7px 16px',
    borderRadius: 'var(--radius-sm)',
    fontSize: '12px',
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.15s',
  };

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '26px', fontWeight: 700, marginBottom: '24px', letterSpacing: '-0.02em', background: 'linear-gradient(135deg, var(--color-text), var(--color-text-secondary))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Configuración</h1>

      {message && (
        <div style={{
          padding: '10px 16px', borderRadius: 'var(--radius-sm)', marginBottom: '16px', fontSize: '13px', fontWeight: 500,
          background: message.type === 'success' ? 'rgba(52, 211, 153, 0.1)' : 'rgba(251, 113, 133, 0.1)',
          border: `1px solid ${message.type === 'success' ? 'rgba(52, 211, 153, 0.3)' : 'rgba(251, 113, 133, 0.3)'}`,
          color: message.type === 'success' ? 'var(--color-success)' : 'var(--color-danger)',
        }}>
          {message.text}
        </div>
      )}

      <div style={cardStyle}>
        <div style={{ position: 'absolute' as const, top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, #8b5cf6, #e879f9, transparent)' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '-0.01em' }}>Perfil</h3>
          {!editingProfile && (
            <button onClick={startEditProfile} style={{ ...btnStyle, background: 'var(--color-primary-light)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Pencil size={13} /> Editar
            </button>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' as const }}>
          <div style={rowStyle}>
            <span style={{ color: 'var(--color-text-muted)' }}>Nombre</span>
            {editingProfile ? (
              <input type="text" value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} placeholder="Tu nombre" style={inputStyle} />
            ) : (
              <span style={{ fontWeight: 500 }}>{user?.name || <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Sin nombre</span>}</span>
            )}
          </div>
          <div style={rowStyle}>
            <span style={{ color: 'var(--color-text-muted)' }}>Email</span>
            <span style={{ fontWeight: 500 }}>{user?.email}</span>
          </div>
          {editingProfile && (
            <>
              <div style={rowStyle}>
                <span style={{ color: 'var(--color-text-muted)' }}>Nueva contraseña</span>
                <input type="password" value={profileForm.password} onChange={(e) => setProfileForm({ ...profileForm, password: e.target.value })} placeholder="Dejar vacío para no cambiar" style={inputStyle} />
              </div>
              <div style={rowStyle}>
                <span style={{ color: 'var(--color-text-muted)' }}>Confirmar contraseña</span>
                <input type="password" value={profileForm.confirmPassword} onChange={(e) => setProfileForm({ ...profileForm, confirmPassword: e.target.value })} placeholder="Repetir contraseña" style={inputStyle} />
              </div>
            </>
          )}
          <div style={rowStyle}>
            <span style={{ color: 'var(--color-text-muted)' }}>Rol</span>
            <span style={{ textTransform: 'capitalize' as const, fontWeight: 500 }}>{user?.role?.replace('_', ' ')}</span>
          </div>
          <div style={{ ...rowStyle, borderBottom: 'none' }}>
            <span style={{ color: 'var(--color-text-muted)' }}>Tenant</span>
            <span style={{ fontWeight: 500 }}>{user?.tenant?.name || (isSuperAdmin ? 'Global (SuperAdmin)' : '—')}</span>
          </div>
        </div>
        {editingProfile && (
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' }}>
            <button onClick={cancelEditProfile} style={{ ...btnStyle, background: 'var(--color-bg-secondary)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
              Cancelar
            </button>
            <button onClick={saveProfile} disabled={saving} style={{ ...btnStyle, background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)', color: '#fff', boxShadow: '0 2px 8px rgba(139, 92, 246, 0.25)' }}>
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        )}
      </div>

      <div style={cardStyle}>
        <div style={{ position: 'absolute' as const, top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, #67e8f9, #8b5cf6, transparent)' }} />
        <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px', letterSpacing: '-0.01em' }}>Plataforma</h3>
        <div style={{ display: 'flex', flexDirection: 'column' as const }}>
          <div style={rowStyle}>
            <span style={{ color: 'var(--color-text-muted)' }}>Versión</span>
            <span style={{ fontWeight: 500, fontFamily: 'var(--font-mono)', fontSize: '12px' }}>0.1.0 (MVP 1)</span>
          </div>
          <div style={rowStyle}>
            <span style={{ color: 'var(--color-text-muted)' }}>WhatsApp API</span>
            <span style={{ fontWeight: 500, fontFamily: 'var(--font-mono)', fontSize: '12px' }}>v21.0</span>
          </div>
          <div style={{ ...rowStyle, borderBottom: 'none' }}>
            <span style={{ color: 'var(--color-text-muted)' }}>Motor IA</span>
            <span style={{ fontWeight: 500 }}>OpenAI</span>
          </div>
        </div>
      </div>
    </div>
  );
}
