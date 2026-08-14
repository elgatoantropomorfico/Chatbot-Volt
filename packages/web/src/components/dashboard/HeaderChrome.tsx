'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, AlertTriangle, Info, Settings, LogOut } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { getTenantDisplayName } from '@/lib/tenant';
import styles from './HeaderChrome.module.css';

const ROLE_LABELS: Record<string, string> = {
  superadmin: 'Super Admin',
  tenant_admin: 'Admin',
  agent: 'Agente',
};

function actionStyle(type: string) {
  switch (type) {
    case 'urgent': return { bg: 'rgba(251, 113, 133, 0.12)', color: '#fb7185' };
    case 'warning': return { bg: 'rgba(251, 191, 36, 0.12)', color: '#fbbf24' };
    case 'config': return { bg: 'rgba(139, 92, 246, 0.12)', color: '#8b5cf6' };
    default: return { bg: 'rgba(6, 182, 212, 0.12)', color: '#06b6d4' };
  }
}

function actionIcon(type: string) {
  switch (type) {
    case 'urgent': return <AlertTriangle size={15} />;
    case 'warning': return <Bell size={15} />;
    case 'config': return <Settings size={15} />;
    default: return <Info size={15} />;
  }
}

export function HeaderChrome({ variant }: { variant: 'header' | 'sidebar' }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [actions, setActions] = useState<any[]>([]);
  const [openMenu, setOpenMenu] = useState<'notif' | 'profile' | null>(null);
  const [panelContent, setPanelContent] = useState<'notif' | 'profile' | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user || user.role === 'superadmin') return;
    api.getDashboardActions()
      .then((data) => setActions(data.actions || []))
      .catch(() => setActions([]));
  }, [user]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpenMenu(null);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    if (openMenu) {
      setPanelContent(openMenu);
      return;
    }
    const t = window.setTimeout(() => setPanelContent(null), 280);
    return () => window.clearTimeout(t);
  }, [openMenu]);

  if (!user || user.role === 'superadmin') return null;

  const displayName = user.name || user.email?.split('@')[0] || 'Usuario';
  const roleLabel = ROLE_LABELS[user.role] || user.role;
  const tenantName = getTenantDisplayName(user.tenant) || 'Tu negocio';

  const notifList = (
    <>
      <div className={styles.panelHead}>
        <strong>Notificaciones</strong>
        <span>{actions.length} pendiente{actions.length !== 1 ? 's' : ''}</span>
      </div>
      {actions.length === 0 ? (
        <div className={styles.empty}>Todo al día</div>
      ) : (
        actions.map((action: any) => {
          const c = actionStyle(action.type);
          return (
            <button
              key={action.id}
              type="button"
              className={styles.notifItem}
              onClick={() => { setOpenMenu(null); router.push(action.link); }}
            >
              <span className={styles.notifIcon} style={{ background: c.bg, color: c.color }}>
                {actionIcon(action.type)}
              </span>
              <span className={styles.notifBody}>
                <strong>{action.title}</strong>
                <span>{action.description}</span>
              </span>
            </button>
          );
        })
      )}
    </>
  );

  const profileCard = (
    <div className={styles.profileBody}>
      <div className={styles.identity}>
        <div className={styles.avatar}>{displayName[0]?.toUpperCase()}</div>
        <div className={styles.identityText}>
          <strong>{displayName}</strong>
          <span>{user.email}</span>
        </div>
      </div>
      <div className={styles.meta}>
        <div>
          <span>Rol</span>
          <strong>{roleLabel}</strong>
        </div>
        <div>
          <span>Negocio</span>
          <strong>{tenantName}</strong>
        </div>
      </div>
      <button
        type="button"
        className={styles.action}
        onClick={() => { setOpenMenu(null); router.push('/dashboard/settings?tab=cuenta'); }}
      >
        <Settings size={15} />
        Mi cuenta
      </button>
      <button
        type="button"
        className={`${styles.action} ${styles.actionDanger}`}
        onClick={() => { setOpenMenu(null); logout(); }}
      >
        <LogOut size={15} />
        Cerrar sesión
      </button>
    </div>
  );

  return (
    <div className={`${styles.wrap} ${variant === 'sidebar' ? styles.wrapSidebar : styles.wrapHeader}`} ref={wrapRef}>
      <button
        type="button"
        className={`${styles.iconBtn} ${openMenu === 'notif' ? styles.iconBtnActive : ''}`}
        onClick={() => setOpenMenu((m) => (m === 'notif' ? null : 'notif'))}
        title="Notificaciones"
        aria-expanded={openMenu === 'notif'}
      >
        <Bell size={16} />
        {actions.length > 0 && <span className={styles.dot} />}
      </button>
      <button
        type="button"
        className={`${styles.avatarBtn} ${openMenu === 'profile' ? styles.iconBtnActive : ''}`}
        onClick={() => setOpenMenu((m) => (m === 'profile' ? null : 'profile'))}
        title="Perfil"
        aria-expanded={openMenu === 'profile'}
      >
        {displayName[0]?.toUpperCase()}
      </button>

      <button
        type="button"
        className={`${styles.backdrop} ${openMenu ? styles.backdropOpen : ''}`}
        aria-label="Cerrar panel"
        tabIndex={openMenu ? 0 : -1}
        onClick={() => setOpenMenu(null)}
      />
      <div className={`${styles.panel} ${openMenu ? styles.panelOpen : ''}`}>
        {panelContent === 'notif' ? notifList : panelContent === 'profile' ? profileCard : null}
      </div>
    </div>
  );
}
