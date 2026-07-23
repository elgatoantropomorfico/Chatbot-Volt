'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { isCatalogConfigV2 } from '@/lib/catalog-config';

type BookingFlags = {
  ready: boolean;
  bookingEnabled: boolean;
  catalogConfigV2: boolean;
  refresh: () => Promise<void>;
};

const BookingFlagsContext = createContext<BookingFlags | undefined>(undefined);

function cacheKey(tenantId: string) {
  return `volt:bookingFlags:${tenantId}`;
}

function readCache(tenantId: string): { bookingEnabled: boolean; catalogConfigV2: boolean } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(cacheKey(tenantId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.bookingEnabled !== 'boolean' || typeof parsed?.catalogConfigV2 !== 'boolean') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(tenantId: string, flags: { bookingEnabled: boolean; catalogConfigV2: boolean }) {
  try {
    sessionStorage.setItem(cacheKey(tenantId), JSON.stringify(flags));
  } catch {
    /* ignore quota / private mode */
  }
}

export function BookingFlagsProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const tenantId = user?.tenantId ?? null;

  const cached = useMemo(
    () => (tenantId ? readCache(tenantId) : null),
    [tenantId],
  );

  const [bookingEnabled, setBookingEnabled] = useState(cached?.bookingEnabled ?? false);
  const [catalogConfigV2, setCatalogConfigV2] = useState(cached?.catalogConfigV2 ?? false);
  const [ready, setReady] = useState(!!cached || (!!user && user.role === 'superadmin'));

  // Sync from cache when tenant becomes available (auth finishes)
  useEffect(() => {
    if (!tenantId) return;
    const hit = readCache(tenantId);
    if (!hit) return;
    setBookingEnabled(hit.bookingEnabled);
    setCatalogConfigV2(hit.catalogConfigV2);
    setReady(true);
  }, [tenantId]);

  const refresh = useCallback(async () => {
    if (!user || user.role === 'superadmin' || !user.tenantId) {
      setBookingEnabled(false);
      setCatalogConfigV2(false);
      setReady(true);
      return;
    }
    try {
      const { settings } = await api.getBookingSettings();
      const flags = {
        bookingEnabled: !!settings?.bookingEnabled,
        catalogConfigV2: isCatalogConfigV2(settings),
      };
      setBookingEnabled(flags.bookingEnabled);
      setCatalogConfigV2(flags.catalogConfigV2);
      writeCache(user.tenantId, flags);
    } catch {
      setBookingEnabled(false);
      setCatalogConfigV2(false);
    } finally {
      setReady(true);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    void refresh();
  }, [authLoading, refresh]);

  const value = useMemo(
    () => ({ ready, bookingEnabled, catalogConfigV2, refresh }),
    [ready, bookingEnabled, catalogConfigV2, refresh],
  );

  return (
    <BookingFlagsContext.Provider value={value}>
      {children}
    </BookingFlagsContext.Provider>
  );
}

export function useBookingFlags(): BookingFlags {
  const ctx = useContext(BookingFlagsContext);
  if (!ctx) {
    // Fallback for pages outside provider (shouldn't happen in dashboard)
    return {
      ready: true,
      bookingEnabled: false,
      catalogConfigV2: false,
      refresh: async () => {},
    };
  }
  return ctx;
}
