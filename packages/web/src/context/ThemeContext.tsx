'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  applyPublicTheme,
  applyTheme,
  getStoredTheme,
  isDashboardRoute,
  type Theme,
} from '@/lib/theme';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  isLight: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const tenantId = user?.tenantId ?? null;
  const isDashboard = isDashboardRoute(pathname);

  const [theme, setThemeState] = useState<Theme>('dark');

  useEffect(() => {
    if (!isDashboard) {
      applyPublicTheme();
      setThemeState('dark');
      return;
    }

    if (loading) return;

    const stored = getStoredTheme(tenantId);
    setThemeState(stored);
    if (tenantId) {
      applyTheme(stored, tenantId);
    } else {
      applyPublicTheme();
    }
  }, [isDashboard, tenantId, loading]);

  const setTheme = useCallback(
    (next: Theme) => {
      if (!isDashboard || !tenantId) return;
      setThemeState(next);
      applyTheme(next, tenantId);
    },
    [isDashboard, tenantId],
  );

  const value = useMemo(
    () => ({ theme, setTheme, isLight: theme === 'light' }),
    [theme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      theme: 'dark' as Theme,
      setTheme: () => {},
      isLight: false,
    };
  }
  return ctx;
}
