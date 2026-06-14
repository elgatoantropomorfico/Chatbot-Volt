'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, MessageSquare, Users, Calendar, ShoppingCart, Loader2, X,
} from 'lucide-react';
import { api } from '@/lib/api';
import styles from './DashboardSearch.module.css';

export interface SearchResult {
  type: 'conversation' | 'lead' | 'appointment' | 'sale';
  id: string;
  title: string;
  subtitle: string;
  badge?: string;
  href: string;
}

const TYPE_META: Record<SearchResult['type'], { label: string; icon: React.ReactNode }> = {
  conversation: { label: 'Conversación', icon: <MessageSquare size={14} /> },
  lead: { label: 'Lead', icon: <Users size={14} /> },
  appointment: { label: 'Turno', icon: <Calendar size={14} /> },
  sale: { label: 'Venta', icon: <ShoppingCart size={14} /> },
};

interface DashboardSearchProps {
  modules?: { sales?: boolean; booking?: boolean };
}

export function DashboardSearch({ modules }: DashboardSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const placeholder = [
    'Buscar conversaciones, leads',
    modules?.booking ? 'turnos' : null,
    modules?.sales ? 'ventas' : null,
  ].filter(Boolean).join(', ') + '...';

  const runSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { results: data } = await api.dashboardSearch(q.trim());
      setResults(data || []);
      setActiveIdx(0);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(() => runSearch(query), 280);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, runSearch]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const goTo = (r: SearchResult) => {
    setOpen(false);
    setQuery('');
    setResults([]);
    router.push(r.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) {
      if (e.key === 'Enter' && query.trim().length >= 2) runSearch(query);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      goTo(results[activeIdx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <label className={styles.pill}>
        <Search size={16} />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoComplete="off"
        />
        {query && (
          <button type="button" className={styles.clearBtn} onClick={() => { setQuery(''); setResults([]); }}>
            <X size={14} />
          </button>
        )}
        {loading && <Loader2 size={14} className={styles.spinner} />}
      </label>

      {open && query.trim().length >= 2 && (
        <div className={styles.dropdown}>
          {loading && results.length === 0 ? (
            <div className={styles.empty}>Buscando...</div>
          ) : results.length === 0 ? (
            <div className={styles.empty}>Sin resultados para &ldquo;{query}&rdquo;</div>
          ) : (
            <ul className={styles.list}>
              {results.map((r, i) => {
                const meta = TYPE_META[r.type];
                return (
                  <li key={`${r.type}-${r.id}`}>
                    <button
                      type="button"
                      className={`${styles.resultItem} ${i === activeIdx ? styles.resultItemActive : ''}`}
                      onMouseEnter={() => setActiveIdx(i)}
                      onClick={() => goTo(r)}
                    >
                      <span className={styles.resultIcon}>{meta.icon}</span>
                      <span className={styles.resultBody}>
                        <span className={styles.resultTitle}>{r.title}</span>
                        <span className={styles.resultSub}>{r.subtitle}</span>
                      </span>
                      <span className={styles.resultType}>{meta.label}</span>
                      {r.badge && <span className={styles.resultBadge}>{r.badge}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
