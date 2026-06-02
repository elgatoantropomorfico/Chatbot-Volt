import { SolutionPageLayout } from '@/components/marketing/SolutionPageLayout';

export const metadata = {
  title: 'Integraciones Meta — Volt',
  description:
    'Conectá WhatsApp, Instagram y Facebook con asistentes inteligentes, CRMs y automatizaciones.',
};

export default function IntegracionesMetaPage() {
  return (
    <SolutionPageLayout
      badge="Integraciones"
      heroVisual="meta"
      heroTitle="Conectá tu negocio con WhatsApp, Instagram y Facebook"
      heroSubtitle="Integramos tus canales de Meta con asistentes inteligentes, sistemas internos, CRMs, ERPs y herramientas de automatización para que tu empresa pueda centralizar conversaciones y escalar su comunicación digital."
      heroCtaLabel="Integrar mis canales"
      problema={{
        title: 'Muchos mensajes, muchos canales, poca organización',
        paragraphs: [
          'Cuando WhatsApp, Instagram y Facebook funcionan por separado, los equipos pierden tiempo, información y oportunidades. La atención se vuelve difícil de medir, seguir y escalar.',
        ],
      }}
      solucion={{
        title: 'Canales conectados a una operación inteligente',
        paragraphs: [
          'Con Volt podés conectar tus canales de comunicación con flujos automatizados, bots conversacionales, bases de datos, sistemas de gestión y equipos humanos.',
          'Esto permite centralizar la atención, automatizar respuestas y crear experiencias omnicanal más rápidas, ordenadas y profesionales.',
        ],
      }}
      beneficios={[
        'Integración con WhatsApp Business API.',
        'Automatización de respuestas y flujos conversacionales.',
        'Unificación de mensajes de WhatsApp, Instagram y Facebook.',
        'Envío de notificaciones y mensajes transaccionales.',
        'Derivación hacia equipos comerciales o de soporte.',
        'Integración con CRMs, ERPs y sistemas internos.',
        'Infraestructura segura y escalable.',
      ]}
      extraSection={
        <section style={{ padding: '80px 24px' }}>
          <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
            <h2
              style={{
                fontSize: 28,
                fontWeight: 800,
                color: '#fff',
                letterSpacing: '-0.03em',
                marginBottom: 16,
              }}
            >
              Potenciá tus canales
            </h2>
            <p style={{ fontSize: 16, lineHeight: 1.7, color: 'var(--color-text-secondary)' }}>
              Convertí tus redes sociales y WhatsApp en verdaderos canales de venta, atención y
              fidelización mediante procesos automatizados y experiencias diseñadas para maximizar
              resultados.
            </p>
          </div>
        </section>
      }
      ctaFinal={{
        title: 'Tus canales pueden hacer mucho más que recibir mensajes',
        subtitle:
          'Conectalos a una infraestructura inteligente y empezá a convertir conversaciones en datos, ventas y procesos medibles.',
        buttonLabel: 'Solicitar integración',
      }}
    />
  );
}
