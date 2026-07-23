'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { getTenantDisplayName } from '@/lib/tenant';
import {
  Settings,
  UserCircle,
  Building2,
  Sun,
  Moon,
  Info,
  Pencil,
} from 'lucide-react';
import {
  TurneraConfigPanel,
  TURNERA_TABS,
  getTurneraTabs,
  type TurneraTab,
} from '../turnera/TurneraConfigPanel';
import { isCatalogConfigV2 } from '@/lib/catalog-config';
import styles from '../turnera/page.module.css';

type GeneralTab = 'cuenta' | 'negocio' | 'apariencia' | 'plataforma';
type ConfigTab = GeneralTab | TurneraTab;

const GENERAL_TABS: { id: GeneralTab; label: string; icon: typeof UserCircle }[] = [
  { id: 'cuenta', label: 'Tu cuenta', icon: UserCircle },
  { id: 'negocio', label: 'Negocio', icon: Building2 },
  { id: 'apariencia', label: 'Apariencia', icon: Sun },
  { id: 'plataforma', label: 'Plataforma', icon: Info },
];

const ALL_TURNERA_TAB_IDS = new Set<string>([
  ...TURNERA_TABS.map((t) => t.id),
  'disponibilidad',
  'promociones',
  'politicas',
]);

function isTurneraTab(tab: string): tab is TurneraTab {
  return ALL_TURNERA_TAB_IDS.has(tab);
}

function isGeneralTab(tab: string): tab is GeneralTab {
  return GENERAL_TABS.some((t) => t.id === tab);
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className={styles.wrapper}><div className={styles.emptyState}>Cargando...</div></div>}>
      <SettingsPageContent />
    </Suspense>
  );
}

function SettingsPageContent() {
  const { user, isSuperAdmin, isTenantAdmin, refreshUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<ConfigTab>('cuenta');
  const [showBooking, setShowBooking] = useState(false);
  const [catalogV2, setCatalogV2] = useState(false);
  const [turneraStatus, setTurneraStatus] = useState({ msg: '', saving: false });

  const [editingProfile, setEditingProfile] = useState(false);
  const [editingBusiness, setEditingBusiness] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: '', password: '', confirmPassword: '' });
  const [businessName, setBusinessName] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const tenantLabel = getTenantDisplayName(user?.tenant);

  useEffect(() => {
    const requested = searchParams.get('tab');
    if (!requested) return;
    if (isGeneralTab(requested)) {
      setTab(requested);
      return;
    }
    if (isTurneraTab(requested)) {
      setTab(requested);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!user || user.role === 'superadmin') return;
    api.getBookingSettings()
      .then(({ settings }) => {
        if (settings?.bookingEnabled) setShowBooking(true);
        setCatalogV2(isCatalogConfigV2(settings));
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!showBooking && isTurneraTab(tab)) setTab('cuenta');
  }, [showBooking, tab]);

  const handleTurneraStatus = useCallback((status: { msg: string; saving: boolean }) => {
    setTurneraStatus(status);
  }, []);

  const turneraTabs = useMemo(() => getTurneraTabs(catalogV2), [catalogV2]);

  const activeMeta = useMemo(() => {
    const general = GENERAL_TABS.find((t) => t.id === tab);
    if (general) return { label: general.label, icon: general.icon, group: 'General' };
    const turnera = turneraTabs.find((t) => t.id === tab);
    if (turnera) {
      return {
        label: turnera.label,
        icon: turnera.icon,
        group: turnera.group === 'catalogo' ? 'Catálogo' : 'Turnera',
      };
    }
    return { label: 'Configuración', icon: Settings, group: 'General' };
  }, [tab, turneraTabs]);

  const ActiveIcon = activeMeta.icon;
  const isTurneraActive = isTurneraTab(tab);

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

  function renderGeneralContent() {
    if (message && !isTurneraActive) {
      // shown above content
    }

    switch (tab) {
      case 'cuenta':
        return (
          <>
            <h2 className={styles.sectionTitle}>Tu cuenta</h2>
            <p className={styles.sectionHint}>
              Tu nombre personal como usuario del panel (no es el nombre del negocio).
            </p>
            <div className={styles.toggleRow}>
              <span style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>Tu nombre</span>
              {editingProfile ? (
                <input
                  className={styles.formInput}
                  type="text"
                  value={profileForm.name}
                  onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                  placeholder="Tu nombre"
                  style={{ maxWidth: 280 }}
                />
              ) : (
                <span style={{ fontWeight: 500, fontSize: '13px' }}>
                  {user?.name || <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Sin nombre</span>}
                </span>
              )}
            </div>
            <div className={styles.toggleRow}>
              <span style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>Email</span>
              <span style={{ fontWeight: 500, fontSize: '13px' }}>{user?.email}</span>
            </div>
            {editingProfile && (
              <>
                <div className={styles.toggleRow}>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>Nueva contraseña</span>
                  <input
                    className={styles.formInput}
                    type="password"
                    value={profileForm.password}
                    onChange={(e) => setProfileForm({ ...profileForm, password: e.target.value })}
                    placeholder="Dejar vacío para no cambiar"
                    style={{ maxWidth: 280 }}
                  />
                </div>
                <div className={styles.toggleRow}>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>Confirmar contraseña</span>
                  <input
                    className={styles.formInput}
                    type="password"
                    value={profileForm.confirmPassword}
                    onChange={(e) => setProfileForm({ ...profileForm, confirmPassword: e.target.value })}
                    placeholder="Repetir contraseña"
                    style={{ maxWidth: 280 }}
                  />
                </div>
              </>
            )}
            <div className={styles.toggleRow}>
              <span style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>Rol</span>
              <span style={{ textTransform: 'capitalize', fontWeight: 500, fontSize: '13px' }}>
                {user?.role?.replace('_', ' ')}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              {!editingProfile ? (
                <button type="button" className={styles.addBtn} onClick={startEditProfile}>
                  <Pencil size={14} /> Editar cuenta
                </button>
              ) : (
                <>
                  <button type="button" className={styles.cancelBtn} onClick={cancelEditProfile}>Cancelar</button>
                  <button type="button" className={styles.saveBtn} onClick={saveProfile} disabled={saving}>
                    {saving ? 'Guardando...' : 'Guardar cuenta'}
                  </button>
                </>
              )}
            </div>
          </>
        );

      case 'negocio':
        if (isSuperAdmin || !user?.tenant) {
          return (
            <div className={styles.emptyState}>
              <p>La configuración del negocio aplica a tenants operativos.</p>
            </div>
          );
        }
        return (
          <>
            <h2 className={styles.sectionTitle}>Nombre del negocio</h2>
            <p className={styles.sectionHint}>
              Es el nombre que ves en el dashboard, sidebar y saludos. Solo afecta a tu tenant.
            </p>
            <div className={styles.toggleRow}>
              <span style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>Nombre visible</span>
              {editingBusiness ? (
                <input
                  className={styles.formInput}
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Ej: Le Rocher"
                  style={{ maxWidth: 280 }}
                />
              ) : (
                <span style={{ fontWeight: 600, fontSize: '13px' }}>
                  {tenantLabel || <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Sin configurar</span>}
                </span>
              )}
            </div>
            {isTenantAdmin && (
              <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
                {!editingBusiness ? (
                  <button type="button" className={styles.addBtn} onClick={startEditBusiness}>
                    <Pencil size={14} /> Editar negocio
                  </button>
                ) : (
                  <>
                    <button type="button" className={styles.cancelBtn} onClick={cancelEditBusiness}>Cancelar</button>
                    <button type="button" className={styles.saveBtn} onClick={saveBusinessName} disabled={saving}>
                      {saving ? 'Guardando...' : 'Guardar negocio'}
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        );

      case 'apariencia':
        return (
          <>
            <h2 className={styles.sectionTitle}>Apariencia</h2>
            <p className={styles.sectionHint}>
              Elegí cómo se ve el panel. El modo claro mantiene la misma línea visual con fondos claros.
            </p>
            <div className={styles.toggleRow}>
              <span style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>Tema del panel</span>
              <div className="volt-theme-switch" role="group" aria-label="Tema del panel">
                <button
                  type="button"
                  className={`volt-theme-option ${theme === 'dark' ? 'volt-theme-option-active' : ''}`}
                  onClick={() => setTheme('dark')}
                >
                  <Moon size={14} /> Oscuro
                </button>
                <button
                  type="button"
                  className={`volt-theme-option ${theme === 'light' ? 'volt-theme-option-active' : ''}`}
                  onClick={() => setTheme('light')}
                >
                  <Sun size={14} /> Claro
                </button>
              </div>
            </div>
          </>
        );

      case 'plataforma':
        return (
          <>
            <h2 className={styles.sectionTitle}>Plataforma</h2>
            <p className={styles.sectionHint}>Información técnica del entorno Volt.</p>
            <div className={styles.toggleRow}>
              <span style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>Versión</span>
              <span style={{ fontWeight: 500, fontFamily: 'var(--font-mono)', fontSize: '12px' }}>0.1.0 (MVP 1)</span>
            </div>
            <div className={styles.toggleRow}>
              <span style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>WhatsApp API</span>
              <span style={{ fontWeight: 500, fontFamily: 'var(--font-mono)', fontSize: '12px' }}>v21.0</span>
            </div>
            <div className={styles.toggleRow}>
              <span style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>Motor IA</span>
              <span style={{ fontWeight: 500, fontSize: '13px' }}>OpenAI</span>
            </div>
          </>
        );

      default:
        return null;
    }
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.mobileHeader}>
        <h1>Configuración</h1>
      </div>

      <div className={styles.shell}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarGroupTitle}>General</div>
          {GENERAL_TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                className={`${styles.tabBtn} ${tab === t.id ? styles.tabBtnActive : ''}`}
                onClick={() => setTab(t.id)}
              >
                <Icon size={15} />
                {t.label}
              </button>
            );
          })}

          {showBooking && (
            <>
              <div className={styles.sidebarGroupTitle}>Turnera</div>
              {turneraTabs.filter((t) => t.group === 'turnera').map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`${styles.tabBtn} ${tab === t.id ? styles.tabBtnActive : ''}`}
                    onClick={() => setTab(t.id)}
                  >
                    <Icon size={15} />
                    {t.label}
                  </button>
                );
              })}
              {catalogV2 && (
                <>
                  <div className={styles.sidebarGroupTitle}>Catálogo</div>
                  {turneraTabs.filter((t) => t.group === 'catalogo').map((t) => {
                    const Icon = t.icon;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        className={`${styles.tabBtn} ${tab === t.id ? styles.tabBtnActive : ''}`}
                        onClick={() => setTab(t.id)}
                      >
                        <Icon size={15} />
                        {t.label}
                      </button>
                    );
                  })}
                </>
              )}
            </>
          )}
        </aside>

        <div className={styles.content}>
          <div className={styles.contentHeader}>
            <h1>
              <ActiveIcon size={18} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 8, color: '#a78bfa' }} />
              {activeMeta.label}
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-muted)', marginLeft: 10 }}>
                {activeMeta.group}
              </span>
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {isTurneraActive ? (
                <>
                  {turneraStatus.msg && <span className={styles.saveMsg}>{turneraStatus.msg}</span>}
                  {turneraStatus.saving && <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Guardando...</span>}
                </>
              ) : (
                saving && <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Guardando...</span>
              )}
            </div>
          </div>
          <div className={styles.contentBody}>
            {message && !isTurneraActive && (
              <div className={`${styles.generalMessage} ${message.type === 'success' ? styles.generalMessageSuccess : styles.generalMessageError}`}>
                {message.text}
              </div>
            )}
            {isTurneraActive ? (
              <TurneraConfigPanel tab={tab} onStatusChange={handleTurneraStatus} />
            ) : (
              renderGeneralContent()
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
