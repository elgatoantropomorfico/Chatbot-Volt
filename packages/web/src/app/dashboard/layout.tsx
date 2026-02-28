'use client';

import { useEffect, useState } from 'react';
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
  Menu,
  X,
  DollarSign,
} from 'lucide-react';
import { api } from '@/lib/api';
import styles from './layout.module.css';

// Super admin: only tenant management
const superAdminItems = [
  { href: '/dashboard', label: 'Tenants', icon: Building2 },
];

// Tenant users navigation
const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['tenant_admin', 'agent'] },
  { href: '/dashboard/inbox', label: 'Inbox', icon: MessageSquare, roles: ['tenant_admin', 'agent'] },
  { href: '/dashboard/leads', label: 'Leads', icon: Users, roles: ['tenant_admin', 'agent'] },
];

const adminItems = [
  { href: '/dashboard/users', label: 'Usuarios', icon: UserCircle, roles: ['tenant_admin'] },
];

const configItems = [
  { href: '/dashboard/bot-settings', label: 'Bot / IA', icon: Bot, roles: ['tenant_admin'] },
  { href: '/dashboard/integrations', label: 'Integraciones', icon: Plug, roles: ['tenant_admin'] },
  { href: '/dashboard/settings', label: 'Configuración', icon: Settings, roles: ['tenant_admin'] },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, isSuperAdmin } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showSales, setShowSales] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Check if WooCommerce + cart is enabled to show Sales nav item
  useEffect(() => {
    if (!user || user.role === 'superadmin') return;
    (async () => {
      try {
        const { integrations } = await api.getIntegrations();
        const woo = integrations.find((i: any) => i.type === 'woocommerce' && i.status === 'active');
        if (woo) {
          const config = JSON.parse(woo.configEncrypted || '{}');
          setShowSales(config.enableCart !== false);
        }
      } catch {}
    })();
  }, [user]);

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
      {/* Mobile Header */}
      <div className={styles.mobileHeader}>
        <button className={styles.hamburgerBtn} onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
          {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
        <h2 className={styles.mobileTitle}>Volt</h2>
      </div>

      {/* Backdrop */}
      {mobileMenuOpen && (
        <div className={styles.backdrop} onClick={() => setMobileMenuOpen(false)} />
      )}

      <aside className={`${styles.sidebar} ${mobileMenuOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.sidebarHeader}>
          <h2>Volt</h2>
          <span>{isSuperAdmin ? 'Super Admin Panel' : user.tenant?.name || 'Panel'}</span>
        </div>

        <nav className={styles.nav}>
          {isSuperAdmin ? (
            /* Super Admin: only tenant management */
            superAdminItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navItem} ${pathname === item.href ? styles.navItemActive : ''}`}
              >
                <item.icon size={18} />
                {item.label}
              </Link>
            ))
          ) : (
            /* Tenant users: full navigation */
            <>
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

              {showSales && (
                <Link
                  href="/dashboard/sales"
                  className={`${styles.navItem} ${pathname === '/dashboard/sales' ? styles.navItemActive : ''}`}
                >
                  <DollarSign size={18} />
                  Ventas
                </Link>
              )}

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
