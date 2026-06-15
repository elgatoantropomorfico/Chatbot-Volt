'use client';

import { Building2, GraduationCap, Home, ShoppingBag, Users } from 'lucide-react';
import { MarketingShell } from '@/components/marketing/MarketingShell';
import { DEMO_MAILTO } from '@/components/marketing/constants';
import { FinalCTA, PrimaryButton, SectionHeader } from '@/components/marketing/ui';
import { ChatMockup, HeroOrbs, IntegrationsLogoBar } from '@/components/marketing/visuals';

const SECTORS = [
  {
    icon: <Building2 size={24} />,
    color: '#34d399',
    title: 'Salud y clínicas',
    desc: 'Automatización de turnos, atención por WhatsApp, recordatorios, derivación de consultas y seguimiento de pacientes.',
  },
  {
    icon: <GraduationCap size={24} />,
    color: '#67e8f9',
    title: 'Educación',
    desc: 'Captura de aspirantes, respuestas automáticas, seguimiento comercial, integración con CRM y gestión de consultas recurrentes.',
  },
  {
    icon: <Home size={24} />,
    color: '#e879f9',
    title: 'Inmobiliarias',
    desc: 'Calificación de interesados, envío de propiedades, coordinación de visitas y seguimiento automático de prospectos.',
  },
  {
    icon: <ShoppingBag size={24} />,
    color: '#fbbf24',
    title: 'Comercios y servicios',
    desc: 'Atención inmediata, respuestas frecuentes, ventas asistidas y derivación a humanos cuando sea necesario.',
  },
  {
    icon: <Users size={24} />,
    color: '#8b5cf6',
    title: 'Equipos comerciales',
    desc: 'Clasificación de clientes, registro automático de oportunidades, seguimiento y métricas de conversión.',
  },
];

export default function SectoresPage() {
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
            badge="Sectores"
            title="Soluciones de IA y automatización para distintos tipos de empresas"
            subtitle="Adaptamos cada implementación al rubro, los canales y los procesos de tu organización."
          />
        </div>
        <div style={{ position: 'relative', zIndex: 1, marginTop: 48, padding: '0 24px' }}>
          <ChatMockup variant="turnos" />
        </div>
      </section>

      <IntegrationsLogoBar />

      <section style={{ padding: '60px 24px 100px' }}>
        <div
          className="landing-grid-3"
          style={{
            maxWidth: 1100,
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: 24,
          }}
        >
          {SECTORS.map((s, i) => (
            <div
              key={i}
              className="landing-card"
              style={{
                padding: 32,
                borderRadius: 'var(--radius-lg)',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                transition: 'all 0.25s',
                boxShadow: 'var(--shadow-card)',
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 'var(--radius-md)',
                  background: `${s.color}15`,
                  border: `1px solid ${s.color}30`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: s.color,
                  marginBottom: 16,
                }}
              >
                {s.icon}
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 10 }}>{s.title}</h3>
              <p style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--color-text-secondary)' }}>{s.desc}</p>
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'center', marginTop: 48 }}>
          <PrimaryButton href={DEMO_MAILTO} external>
            Solicitar diagnóstico para mi sector
          </PrimaryButton>
        </div>
      </section>

      <FinalCTA
        title="¿Tu rubro no está en la lista?"
        subtitle="Contanos cómo opera tu negocio y diseñamos una solución a medida."
        buttonLabel="Agendar demo"
        buttonHref={DEMO_MAILTO}
      />
    </MarketingShell>
  );
}
