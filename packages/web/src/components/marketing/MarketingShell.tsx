'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Menu, X, Zap } from 'lucide-react';
import Link from 'next/link';
import { MarketingStyles } from './MarketingStyles';
import {
  DEMO_MAILTO,
  NAV_LINKS,
  PLATFORM_LOGIN,
  SOLUTION_LINKS,
} from './constants';

export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mkt-root">
      <div className="mkt-ambient" aria-hidden>
        <div className="mkt-ambient-orb1" />
        <div className="mkt-ambient-orb2" />
        <div className="mkt-ambient-orb3" />
      </div>
      <MarketingNavbar />
      <main style={{ position: 'relative', zIndex: 1 }}>{children}</main>
      <MarketingFooter />
      <MarketingStyles />
    </div>
  );
}

function MarketingNavbar() {
  const [solutionsOpen, setSolutionsOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setSolutionsOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  return (
    <>
      <nav className="mkt-nav">
        <div className="mkt-nav-inner">
          <Link href="/" className="mkt-brand">
            <div className="mkt-brand-icon">
              <Zap size={18} color="#fff" />
            </div>
            <span className="mkt-brand-text">
              <span className="mkt-brand-volt">Volt</span>
              <span className="mkt-brand-ia"> IA</span>
            </span>
          </Link>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div className="mkt-nav-links landing-nav-links" style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
              <Link href="/" className="mkt-nav-link landing-nav-link">
                Inicio
              </Link>

              <div ref={dropdownRef} className="landing-solutions-dropdown" style={{ position: 'relative' }}>
                <button
                  type="button"
                  className="mkt-nav-link landing-nav-link"
                  aria-expanded={solutionsOpen}
                  aria-haspopup="true"
                  onClick={() => setSolutionsOpen((o) => !o)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px 0',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  Soluciones
                  <ChevronDown
                    size={16}
                    style={{
                      transition: 'transform 0.2s',
                      transform: solutionsOpen ? 'rotate(180deg)' : 'rotate(0)',
                    }}
                  />
                </button>
                <div
                  className={`landing-solutions-menu${solutionsOpen ? ' is-open' : ''}`}
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    left: 0,
                    minWidth: 300,
                    padding: 8,
                    borderRadius: 'var(--radius-lg)',
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border-light)',
                    boxShadow: 'var(--shadow-lg)',
                    zIndex: 300,
                  }}
                >
                  {SOLUTION_LINKS.map((s) => (
                    <Link
                      key={s.href}
                      href={s.href}
                      onClick={() => setSolutionsOpen(false)}
                      style={{
                        display: 'block',
                        padding: '12px 14px',
                        borderRadius: 'var(--radius-md)',
                        textDecoration: 'none',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--color-surface-hover)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{s.label}</div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                        {s.short}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>

              {NAV_LINKS.filter((l) => l.href !== '/').map((l) => (
                <Link key={l.href} href={l.href} className="mkt-nav-link landing-nav-link">
                  {l.label}
                </Link>
              ))}
            </div>

            <button
              type="button"
              className="mkt-nav-mobile-toggle landing-nav-mobile-toggle"
              aria-label={mobileOpen ? 'Cerrar menú' : 'Abrir menú'}
              onClick={() => setMobileOpen((o) => !o)}
              style={{
                display: 'none',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: 8,
                color: 'var(--color-text)',
                cursor: 'pointer',
              }}
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>

            <a href={PLATFORM_LOGIN} className="mkt-nav-cta landing-nav-acceder">
              Acceder
            </a>
          </div>
        </div>
      </nav>

      {mobileOpen && (
        <div
          className="landing-mobile-menu"
          style={{
            position: 'fixed',
            top: 64,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 199,
            background: 'rgba(6, 6, 12, 0.97)',
            backdropFilter: 'blur(12px)',
            padding: 24,
            overflowY: 'auto',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
            Soluciones
          </div>
          {SOLUTION_LINKS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              onClick={() => setMobileOpen(false)}
              style={{
                display: 'block',
                padding: '14px 0',
                borderBottom: '1px solid var(--color-border)',
                textDecoration: 'none',
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{s.label}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{s.short}</div>
            </Link>
          ))}
          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMobileOpen(false)}
                style={{
                  padding: '14px 0',
                  fontSize: 15,
                  fontWeight: 500,
                  color: 'var(--color-text-secondary)',
                  textDecoration: 'none',
                  borderBottom: '1px solid var(--color-border)',
                }}
              >
                {l.label}
              </Link>
            ))}
          </div>
          <a
            href={PLATFORM_LOGIN}
            className="mkt-nav-cta"
            style={{ display: 'block', textAlign: 'center', marginTop: 24 }}
            onClick={() => setMobileOpen(false)}
          >
            Acceder al panel
          </a>
        </div>
      )}
    </>
  );
}

function MarketingFooter() {
  return (
    <footer className="mkt-footer">
      <div
        className="landing-footer-inner"
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 32,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: 'linear-gradient(135deg, #8b5cf6, #e879f9)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Zap size={14} color="#fff" />
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-secondary)' }}>
              Volt IA Agents
            </span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', maxWidth: 280, lineHeight: 1.5 }}>
            Automatización, integraciones y software a medida para empresas que quieren vender y atender mejor.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 48, flexWrap: 'wrap' }}>
          <FooterCol
            title="Soluciones"
            links={SOLUTION_LINKS.map((s) => ({ label: s.label, href: s.href }))}
          />
          <FooterCol
            title="Empresa"
            links={[
              { label: 'Sectores', href: '/sectores' },
              { label: 'Casos de uso', href: '/casos-de-uso' },
              { label: 'Contacto', href: '/contacto' },
              { label: 'Agendar demo', href: DEMO_MAILTO, external: true },
            ]}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 200 }}>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            Volt IA Agents — Marca operada por Ignacio Prado
          </span>
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
            CUIT: 20-39196909-5 · Corrientes, Argentina
          </span>
          <a
            href="mailto:pradoignacio.utn@icloud.com"
            style={{ fontSize: 11, color: 'var(--color-primary)', textDecoration: 'none' }}
          >
            pradoignacio.utn@icloud.com
          </a>
          <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
            <Link href="/privacy" style={{ fontSize: 11, color: 'var(--color-primary)', textDecoration: 'none' }}>
              Política de Privacidad
            </Link>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
              © {new Date().getFullYear()} Volt
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string; external?: boolean }[];
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--color-text-muted)',
          marginBottom: 12,
        }}
      >
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {links.map((l) =>
          l.external ? (
            <a
              key={l.href}
              href={l.href}
              style={{ fontSize: 13, color: 'var(--color-text-secondary)', textDecoration: 'none' }}
            >
              {l.label}
            </a>
          ) : (
            <Link
              key={l.href}
              href={l.href}
              style={{ fontSize: 13, color: 'var(--color-text-secondary)', textDecoration: 'none' }}
            >
              {l.label}
            </Link>
          ),
        )}
      </div>
    </div>
  );
}
