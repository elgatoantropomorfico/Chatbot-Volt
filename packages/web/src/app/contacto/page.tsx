'use client';

import type { ReactNode } from 'react';
import { Mail, MapPin, Calendar } from 'lucide-react';
import { MarketingShell } from '@/components/marketing/MarketingShell';
import { DEMO_MAILTO } from '@/components/marketing/constants';
import { PrimaryButton, SectionHeader } from '@/components/marketing/ui';
import { HeroOrbs, MetaHubVisual } from '@/components/marketing/visuals';

const CTAS = [
  { label: 'Agendar demo', href: DEMO_MAILTO },
  { label: 'Solicitar diagnóstico', href: DEMO_MAILTO },
  { label: 'Automatizar mi atención', href: DEMO_MAILTO },
  { label: 'Integrar mis canales', href: DEMO_MAILTO },
  { label: 'Cotizar mi desarrollo', href: DEMO_MAILTO },
];

export default function ContactoPage() {
  return (
    <MarketingShell>
      <section
        style={{
          position: 'relative',
          padding: '140px 24px 60px',
          textAlign: 'center',
          overflow: 'hidden',
        }}
      >
        <HeroOrbs />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 640, margin: '0 auto' }}>
          <SectionHeader
            badge="Contacto"
            title="Agendá una demo o escribinos"
            subtitle="Contanos qué querés automatizar y te respondemos con una propuesta adaptada a tu negocio."
          />
        </div>
      </section>

      <section style={{ padding: '0 24px 100px' }}>
        <div
          className="landing-split"
          style={{
            maxWidth: 1000,
            margin: '0 auto 48px',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 40,
            alignItems: 'center',
          }}
        >
          <MetaHubVisual />
          <div
            style={{
              padding: 40,
              borderRadius: 'var(--radius-xl)',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border-glow)',
              boxShadow: 'var(--shadow-glow)',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginBottom: 32 }}>
              <ContactRow
                icon={<Mail size={20} color="var(--color-primary)" />}
                label="Email"
                value="pradoignacio.utn@icloud.com"
                href="mailto:pradoignacio.utn@icloud.com"
              />
              <ContactRow
                icon={<MapPin size={20} color="var(--color-accent)" />}
                label="Ubicación"
                value="Corrientes, Argentina"
              />
              <ContactRow
                icon={<Calendar size={20} color="var(--color-success)" />}
                label="Demo"
                value="Coordinamos una reunión según tu disponibilidad"
              />
            </div>

            <PrimaryButton href={DEMO_MAILTO} external>
              Agendar demo por email
            </PrimaryButton>

            <p
              style={{
                fontSize: 13,
                color: 'var(--color-text-muted)',
                marginTop: 20,
                lineHeight: 1.5,
                textAlign: 'center',
              }}
            >
              Si ya tenés cuenta en la plataforma, usá el botón{' '}
              <strong style={{ color: 'var(--color-text-secondary)' }}>Acceder</strong> en el menú.
            </p>
          </div>
        </div>

        <div style={{ maxWidth: 560, margin: '48px auto 0' }}>
          <p
            style={{
              fontSize: 12,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--color-text-muted)',
              textAlign: 'center',
              marginBottom: 16,
            }}
          >
            También podés indicar tu interés
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
            {CTAS.map((c) => (
              <a
                key={c.label}
                href={c.href}
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--color-text-secondary)',
                  padding: '10px 16px',
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  textDecoration: 'none',
                  transition: 'border-color 0.15s',
                }}
              >
                {c.label}
              </a>
            ))}
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}

function ContactRow({
  icon,
  label,
  value,
  href,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-primary-light)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4 }}>
          {label}
        </div>
        {href ? (
          <a href={href} style={{ fontSize: 15, color: 'var(--color-primary-hover)', textDecoration: 'none' }}>
            {value}
          </a>
        ) : (
          <div style={{ fontSize: 15, color: 'var(--color-text-secondary)' }}>{value}</div>
        )}
      </div>
    </div>
  );
}
