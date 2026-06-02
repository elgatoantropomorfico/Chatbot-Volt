'use client';

import { Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { MarketingShell } from './MarketingShell';
import { BulletList, ContentBlock, FinalCTA, GhostButton, PrimaryButton } from './ui';
import { DEMO_MAILTO } from './constants';

export interface SolutionPageProps {
  badge: string;
  heroTitle: string;
  heroSubtitle: string;
  heroCtaLabel: string;
  problema: { title: string; paragraphs: string[] };
  solucion: { title: string; paragraphs: string[] };
  beneficios?: readonly string[];
  funcionalidades?: readonly string[];
  casosUso?: readonly string[];
  aplicaciones?: readonly string[];
  queDesarrollamos?: readonly string[];
  enfoque?: readonly string[];
  extraSection?: ReactNode;
  ctaFinal: {
    title: string;
    subtitle: string;
    buttonLabel: string;
    buttonHref?: string;
  };
}

export function SolutionPageLayout(props: SolutionPageProps) {
  const ctaHref = props.ctaFinal.buttonHref ?? DEMO_MAILTO;

  return (
    <MarketingShell>
      <section
        style={{
          position: 'relative',
          paddingTop: 140,
          paddingBottom: 80,
          textAlign: 'center',
          overflow: 'hidden',
        }}
      >
        <HeroBackground />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 760, margin: '0 auto', padding: '0 24px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 16px',
              borderRadius: 'var(--radius-full)',
              background: 'var(--color-primary-light)',
              border: '1px solid var(--color-border-light)',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--color-primary-hover)',
              marginBottom: 24,
            }}
          >
            <Sparkles size={14} />
            {props.badge}
          </div>
          <h1
            style={{
              fontSize: 'clamp(32px, 5vw, 52px)',
              fontWeight: 900,
              lineHeight: 1.1,
              letterSpacing: '-0.04em',
              marginBottom: 20,
              color: '#fff',
            }}
          >
            {props.heroTitle}
          </h1>
          <p
            style={{
              fontSize: 'clamp(16px, 2vw, 18px)',
              color: 'var(--color-text-secondary)',
              lineHeight: 1.65,
              marginBottom: 36,
            }}
          >
            {props.heroSubtitle}
          </p>
          <div className="landing-hero-btns" style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <PrimaryButton href={ctaHref} external={ctaHref.startsWith('mailto:')}>
              {props.heroCtaLabel}
            </PrimaryButton>
            <GhostButton href="/contacto">Agendar demo</GhostButton>
          </div>
        </div>
      </section>

      <section style={{ padding: '80px 24px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <ContentBlock title={props.problema.title} paragraphs={props.problema.paragraphs} />
        </div>
      </section>

      <section style={{ padding: '80px 24px', background: 'var(--color-bg-secondary)' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <ContentBlock title={props.solucion.title} paragraphs={props.solucion.paragraphs} />
        </div>
      </section>

      {props.beneficios && props.beneficios.length > 0 && (
        <ListSection badge="Beneficios" title="Qué obtenés" items={props.beneficios} />
      )}

      {props.funcionalidades && props.funcionalidades.length > 0 && (
        <ListSection badge="Funcionalidades" title="Qué puede hacer" items={props.funcionalidades} alt />
      )}

      {props.casosUso && props.casosUso.length > 0 && (
        <ListSection badge="Casos de uso" title="Aplicaciones concretas" items={props.casosUso} />
      )}

      {props.aplicaciones && props.aplicaciones.length > 0 && (
        <ListSection badge="Aplicaciones" title="Ideal para" items={props.aplicaciones} alt />
      )}

      {props.queDesarrollamos && props.queDesarrollamos.length > 0 && (
        <ListSection badge="Desarrollo" title="Qué desarrollamos" items={props.queDesarrollamos} />
      )}

      {props.enfoque && props.enfoque.length > 0 && (
        <ListSection badge="Enfoque" title="Cada proyecto se desarrolla con foco en" items={props.enfoque} alt />
      )}

      {props.extraSection}

      <FinalCTA
        title={props.ctaFinal.title}
        subtitle={props.ctaFinal.subtitle}
        buttonLabel={props.ctaFinal.buttonLabel}
        buttonHref={ctaHref}
      />
    </MarketingShell>
  );
}

function ListSection({
  badge,
  title,
  items,
  alt,
}: {
  badge: string;
  title: string;
  items: readonly string[];
  alt?: boolean;
}) {
  return (
    <section style={{ padding: '80px 24px', background: alt ? 'var(--color-bg-secondary)' : undefined }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--color-primary-hover)',
            marginBottom: 8,
          }}
        >
          {badge}
        </div>
        <h2
          style={{
            fontSize: 28,
            fontWeight: 800,
            color: '#fff',
            letterSpacing: '-0.03em',
            marginBottom: 28,
          }}
        >
          {title}
        </h2>
        <BulletList items={items} />
      </div>
    </section>
  );
}

function HeroBackground() {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: -120,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 700,
          height: 700,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(139, 92, 246, 0.12) 0%, rgba(232, 121, 249, 0.05) 40%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 80,
          right: '8%',
          width: 220,
          height: 220,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(232, 121, 249, 0.08) 0%, transparent 70%)',
          animation: 'float 6s ease-in-out infinite',
          pointerEvents: 'none',
        }}
      />
    </>
  );
}
