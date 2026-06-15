export type Theme = 'dark' | 'light';

/** @deprecated Global key — migrated to per-tenant storage on read */
export const LEGACY_THEME_STORAGE_KEY = 'volt_theme';

export const THEME_STORAGE_PREFIX = 'volt_theme:';
export const THEME_LAST_TENANT_KEY = 'volt_theme_last_tenant';

export function isDashboardRoute(pathname: string): boolean {
  return pathname === '/dashboard' || pathname.startsWith('/dashboard/');
}

export function getThemeStorageKey(tenantId: string | null | undefined): string | null {
  if (!tenantId) return null;
  return `${THEME_STORAGE_PREFIX}${tenantId}`;
}

export function getStoredTheme(tenantId?: string | null): Theme {
  if (typeof window === 'undefined') return 'dark';

  try {
    const key = getThemeStorageKey(tenantId);
    if (key) {
      const stored = localStorage.getItem(key);
      if (stored === 'light' || stored === 'dark') return stored;

      const legacy = localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
      if (legacy === 'light' || legacy === 'dark') {
        localStorage.setItem(key, legacy);
        localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
        return legacy;
      }
    }
  } catch {
    /* ignore */
  }

  return 'dark';
}

export function applyThemeToDocument(theme: Theme) {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

export function applyPublicTheme() {
  applyThemeToDocument('dark');
}

export function applyTheme(theme: Theme, tenantId?: string | null) {
  applyThemeToDocument(theme);

  if (!tenantId) return;

  try {
    const key = getThemeStorageKey(tenantId);
    if (!key) return;
    localStorage.setItem(key, theme);
    localStorage.setItem(THEME_LAST_TENANT_KEY, tenantId);
  } catch {
    /* ignore */
  }
}

export function getTenantIdFromAccessToken(): string | null {
  if (typeof window === 'undefined') return null;

  try {
    const token = localStorage.getItem('volt_access_token');
    if (!token) return null;

    const base64 = token.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/');
    if (!base64) return null;

    const payload = JSON.parse(atob(base64)) as { tenantId?: string | null };
    return payload.tenantId ?? null;
  } catch {
    return null;
  }
}

export const themeInitScript = `(function(){
  try {
    var p = location.pathname;
    var isDashboard = p === '/dashboard' || p.indexOf('/dashboard/') === 0;
    if (!isDashboard) {
      document.documentElement.removeAttribute('data-theme');
      return;
    }
    var tenantId = null;
    var token = localStorage.getItem('volt_access_token');
    if (token) {
      try {
        var part = token.split('.')[1];
        if (part) {
          var payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
          tenantId = payload.tenantId || null;
        }
      } catch (e) {}
    }
    if (!tenantId) tenantId = localStorage.getItem('${THEME_LAST_TENANT_KEY}');
    if (tenantId) {
      var t = localStorage.getItem('${THEME_STORAGE_PREFIX}' + tenantId);
      if (t === 'light') document.documentElement.setAttribute('data-theme', 'light');
      else document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  } catch (e) {}
})();`;
