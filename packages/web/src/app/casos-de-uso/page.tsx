'use client';

import Link from 'next/link';
import { MarketingShell } from '@/components/marketing/MarketingShell';
import { DEMO_MAILTO, SOLUTION_LINKS } from '@/components/marketing/constants';
import { FinalCTA, SectionHeader } from '@/components/marketing/ui';
import { DashboardMockup, HeroOrbs, IntegrationsLogoBar } from '@/components/marketing/visuals';

const USE_CASE_GROUPS = [
  {
    solution: 'Chatbot Inteligente',
    href: '/chatbot-inteligente',
    items: [
      'Atención comercial y soporte al cliente',
      'Generación y calificación de leads',
      'Consultas frecuentes y seguimiento de prospectos',
      'Derivación automática por área o interés',
      'Información sobre productos, servicios y precios',
    ],
  },
  {
    solution: 'Integraciones Meta',
    href: '/integraciones-meta',
    items: [
      'WhatsApp Business API con flujos automatizados',
      'Unificación de WhatsApp, Instagram y Facebook',
      'Mensajes transaccionales y notificaciones',
      'Conexión con CRMs, ERPs y sistemas internos',
      'Derivación a equipos comerciales o de soporte',
    ],
  },
  {
    solution: 'Turnos y casos',
    href: '/automatizacion-turnos-consultas',
    items: [
      'Reserva y confirmación de turnos',
      'Recordatorios y reprogramación de citas',
      'Tickets automáticos y clasificación de solicitudes',
      'Derivación por prioridad, sector o tipo de consulta',
      'Integración con sistemas de gestión existentes',
    ],
  },
  {
    solution: 'Software a medida',
    href: '/desarrollo-software-medida',
    items: [
      'Sistemas de gestión y portales web',
      'Dashboards e inteligencia de negocios',
      'Integraciones entre sistemas desconectados',
      'CRMs y herramientas comerciales personalizadas',
      'Plataformas de e-commerce y logística',
    ],
  },
];

export default function CasosDeUsoPage() {
  return (
    <MarketingShell>
      <section
        style={{
          position: 'relative',
          padding: '140px 24px 48px',
          textAlign: 'center',
          overflow: 'hidden',
        }}
      >
        <HeroOrbs />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 720, margin: '0 auto' }}>
          <SectionHeader
            badge="Casos de uso"
            title="Cómo las empresas usan Volt en la práctica"
            subtitle="Ejemplos concretos por línea de solución. Cada caso se adapta a tu operación, canales y sistemas."
          />
        </div>
        <div style={{ position: 'relative', zIndex: 1, marginTop: 48, padding: '0 24px' }}>
          <DashboardMockup />
        </div>
      </section>

      <IntegrationsLogoBar />

      <section style={{ padding: '60px 24px 100px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 40 }}>
          {USE_CASE_GROUPS.map((group, i) => (
            <div
              key={i}
              style={{
                padding: 32,
                borderRadius: 'var(--radius-lg)',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
              }}
            >
              <Link
                href={group.href}
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: 'var(--color-primary-hover)',
                  textDecoration: 'none',
                  marginBottom: 16,
                  display: 'inline-block',
                }}
              >
                {group.solution} →
              </Link>
              <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {group.items.map((item, j) => (
                  <li
                    key={j}
                    style={{
                      fontSize: 15,
                      color: 'var(--color-text-secondary)',
                      paddingLeft: 16,
                      borderLeft: '2px solid var(--color-border-light)',
                    }}
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div
          style={{
            maxWidth: 800,
            margin: '48px auto 0',
            padding: 24,
            borderRadius: 'var(--radius-lg)',
            background: 'var(--color-primary-light)',
            border: '1px solid var(--color-border-light)',
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
            Explorá cada solución en detalle:
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
            {SOLUTION_LINKS.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--color-primary-hover)',
                  padding: '8px 14px',
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  textDecoration: 'none',
                }}
              >
                {s.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <FinalCTA
        title="Quiero implementar IA en mi empresa"
        subtitle="Contanos tu caso y te proponemos la combinación de soluciones que mejor encaje."
        buttonLabel="Hablar con un especialista"
        buttonHref={DEMO_MAILTO}
      />
    </MarketingShell>
  );
}
