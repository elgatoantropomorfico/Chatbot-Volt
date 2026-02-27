'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import {
  MessageSquare,
  Users,
  Settings,
  Building2,
  Phone,
  Bot,
  Plug,
  UserCircle,
  LogOut,
  LayoutDashboard,
} from 'lucide-react';
import styles from './layout.module.css';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['superadmin', 'tenant_admin', 'agent'] },
  { href: '/dashboard/inbox', label: 'Inbox', icon: MessageSquare, roles: ['superadmin', 'tenant_admin', 'agent'] },
  { href: '/dashboard/leads', label: 'Leads', icon: Users, roles: ['superadmin', 'tenant_admin', 'agent'] },
];

const adminItems = [
  { href: '/dashboard/tenants', label: 'Tenants', icon: Building2, roles: ['superadmin'] },
  { href: '/dashboard/channels', label: 'Channels', icon: Phone, roles: ['superadmin'] },
  { href: '/dashboard/users', label: 'Usuarios', icon: UserCircle, roles: ['superadmin', 'tenant_admin'] },
];

const configItems = [
  { href: '/dashboard/bot-settings', label: 'Bot / IA', icon: Bot, roles: ['superadmin', 'tenant_admin'] },
  { href: '/dashboard/integrations', label: 'Integraciones', icon: Plug, roles: ['superadmin', 'tenant_admin'] },
  { href: '/dashboard/settings', label: 'Configuración', icon: Settings, roles: ['superadmin', 'tenant_admin'] },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, isSuperAdmin } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  if (loading || !user) return null;

  const filterByRole = (items: typeof navItems) =>
    items.filter((item) => item.roles.includes(user.role));

  const roleLabel = {
    superadmin: 'Super Admin',
    tenant_admin: 'Admin',
    agent: 'Agente',
  }[user.role];

  return (
    <div className={styles.wrapper}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <h2>Volt</h2>
          <span>{isSuperAdmin ? 'Super Admin Panel' : user.tenant?.name || 'Panel'}</span>
        </div>

        <nav className={styles.nav}>
          {filterByRole(navItems).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navItem} ${pathname === item.href ? styles.navItemActive : ''}`}
            >
              <item.icon size={18} />
              {item.label}
            </Link>
          ))}

          {filterByRole(adminItems).length > 0 && (
            <>
              <div className={styles.navSection}>Administración</div>
              {filterByRole(adminItems).map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${styles.navItem} ${pathname === item.href ? styles.navItemActive : ''}`}
                >
                  <item.icon size={18} />
                  {item.label}
                </Link>
              ))}
            </>
          )}

          {filterByRole(configItems).length > 0 && (
            <>
              <div className={styles.navSection}>Configuración</div>
              {filterByRole(configItems).map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${styles.navItem} ${pathname === item.href ? styles.navItemActive : ''}`}
                >
                  <item.icon size={18} />
                  {item.label}
                </Link>
              ))}
            </>
          )}
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.userInfo}>
            <div className={styles.userAvatar}>
              {user.email[0].toUpperCase()}
            </div>
            <div className={styles.userDetails}>
              <p>{user.email}</p>
              <span>{roleLabel}</span>
            </div>
            <button className={styles.logoutBtn} onClick={logout} title="Cerrar sesión">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <main className={styles.main}>
        {children}
      </main>
    </div>
  );
}
