'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { getTenantDisplayName } from '@/lib/tenant';
import { Pencil } from 'lucide-react';

export default function SettingsPage() {
  const { user, isSuperAdmin, isTenantAdmin, refreshUser } = useAuth();
  const [editingProfile, setEditingProfile] = useState(false);
  const [editingBusiness, setEditingBusiness] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: '', password: '', confirmPassword: '' });
  const [businessName, setBusinessName] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const tenantLabel = getTenantDisplayName(user?.tenant);

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

  function startEditBusiness() {
    setEditingBusiness(true);
    setBusinessName(user?.tenant?.displayName?.trim() || user?.tenant?.name || '');
    setMessage(null);
  }

  function cancelEditBusiness() {
    setEditingBusiness(false);
    setBusinessName('');
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

  async function saveBusinessName() {
    if (!businessName.trim()) {
      setMessage({ type: 'error', text: 'El nombre del negocio no puede estar vacío' });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      await api.updateTenantDisplayName(businessName.trim());
      await refreshUser();
      setEditingBusiness(false);
      setMessage({ type: 'success', text: 'Nombre del negocio actualizado' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error al actualizar el negocio' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="volt-config-wrapper-stack">
      <div className="volt-page-header">
        <div>
          <h1 className="volt-page-title">Configuración</h1>
          <p className="volt-page-sub">Administrá tu cuenta y el nombre visible de tu negocio.</p>
        </div>
      </div>

      {message && (
        <div
          className="volt-panel"
          style={{
            padding: '12px 18px',
            fontSize: '13px',
            fontWeight: 500,
            background: message.type === 'success' ? 'rgba(61, 214, 140, 0.08)' : 'rgba(251, 113, 133, 0.08)',
            borderColor: message.type === 'success' ? 'rgba(61, 214, 140, 0.25)' : 'rgba(251, 113, 133, 0.25)',
            color: message.type === 'success' ? 'var(--color-success)' : 'var(--color-danger)',
          }}
        >
          {message.text}
        </div>
      )}

      {!isSuperAdmin && user?.tenant && (
        <div className="volt-panel volt-panel-accent-violet">
          <div className="volt-panel-body volt-config-page">
            <div className="volt-page-header" style={{ marginBottom: 0 }}>
              <div>
                <h3 className="volt-panel-title">Nombre del negocio</h3>
                <p className="volt-panel-desc">
                  Es el nombre que ves en el dashboard, sidebar y saludos. Solo afecta a tu tenant.
                </p>
              </div>
              {isTenantAdmin && !editingBusiness && (
                <button type="button" className="volt-btn-ghost" onClick={startEditBusiness}>
                  <Pencil size={13} /> Editar
                </button>
              )}
            </div>
            <div className="volt-toggle-row">
              <span style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>Nombre visible</span>
              {editingBusiness ? (
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Ej: Le Rocher"
                  style={{ maxWidth: 260 }}
                />
              ) : (
                <span style={{ fontWeight: 600, fontSize: '13px' }}>
                  {tenantLabel || <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Sin configurar</span>}
                </span>
              )}
            </div>
            {editingBusiness && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' }}>
                <button type="button" className="volt-btn-ghost" onClick={cancelEditBusiness}>Cancelar</button>
                <button type="button" className="volt-btn-primary" onClick={saveBusinessName} disabled={saving}>
                  {saving ? 'Guardando...' : 'Guardar negocio'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="volt-panel volt-panel-accent-violet">
        <div className="volt-panel-body volt-config-page">
          <div className="volt-page-header" style={{ marginBottom: 0 }}>
            <div>
              <h3 className="volt-panel-title">Tu cuenta</h3>
              <p className="volt-panel-desc">
                Tu nombre personal como usuario del panel (no es el nombre del negocio).
              </p>
            </div>
            {!editingProfile && (
              <button type="button" className="volt-btn-ghost" onClick={startEditProfile}>
                <Pencil size={13} /> Editar
              </button>
            )}
          </div>
          <div className="volt-toggle-row">
            <span style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>Tu nombre</span>
            {editingProfile ? (
              <input
                type="text"
                value={profileForm.name}
                onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                placeholder="Tu nombre"
                style={{ maxWidth: 260 }}
              />
            ) : (
              <span style={{ fontWeight: 500, fontSize: '13px' }}>
                {user?.name || <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Sin nombre</span>}
              </span>
            )}
          </div>
          <div className="volt-toggle-row">
            <span style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>Email</span>
            <span style={{ fontWeight: 500, fontSize: '13px' }}>{user?.email}</span>
          </div>
          {editingProfile && (
            <>
              <div className="volt-toggle-row">
                <span style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>Nueva contraseña</span>
                <input
                  type="password"
                  value={profileForm.password}
                  onChange={(e) => setProfileForm({ ...profileForm, password: e.target.value })}
                  placeholder="Dejar vacío para no cambiar"
                  style={{ maxWidth: 260 }}
                />
              </div>
              <div className="volt-toggle-row">
                <span style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>Confirmar contraseña</span>
                <input
                  type="password"
                  value={profileForm.confirmPassword}
                  onChange={(e) => setProfileForm({ ...profileForm, confirmPassword: e.target.value })}
                  placeholder="Repetir contraseña"
                  style={{ maxWidth: 260 }}
                />
              </div>
            </>
          )}
          <div className="volt-toggle-row">
            <span style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>Rol</span>
            <span style={{ textTransform: 'capitalize', fontWeight: 500, fontSize: '13px' }}>
              {user?.role?.replace('_', ' ')}
            </span>
          </div>
          {editingProfile && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' }}>
              <button type="button" className="volt-btn-ghost" onClick={cancelEditProfile}>Cancelar</button>
              <button type="button" className="volt-btn-primary" onClick={saveProfile} disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar cuenta'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="volt-panel volt-panel-accent-cyan">
        <div className="volt-panel-body volt-config-page">
          <h3 className="volt-panel-title">Plataforma</h3>
          <div className="volt-toggle-row">
            <span style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>Versión</span>
            <span style={{ fontWeight: 500, fontFamily: 'var(--font-mono)', fontSize: '12px' }}>0.1.0 (MVP 1)</span>
          </div>
          <div className="volt-toggle-row">
            <span style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>WhatsApp API</span>
            <span style={{ fontWeight: 500, fontFamily: 'var(--font-mono)', fontSize: '12px' }}>v21.0</span>
          </div>
          <div className="volt-toggle-row">
            <span style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>Motor IA</span>
            <span style={{ fontWeight: 500, fontSize: '13px' }}>OpenAI</span>
          </div>
        </div>
      </div>
    </div>
  );
}
