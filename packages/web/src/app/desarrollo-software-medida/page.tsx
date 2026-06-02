import { SolutionPageLayout } from '@/components/marketing/SolutionPageLayout';
import { ContentBlock } from '@/components/marketing/ui';

export const metadata = {
  title: 'Desarrollo de Software a Medida — Volt',
  description:
    'Creamos plataformas, sistemas internos, dashboards e integraciones adaptadas a tu negocio.',
};

export default function DesarrolloSoftwarePage() {
  return (
    <SolutionPageLayout
      badge="Desarrollo"
      heroTitle="Desarrollo de Software a Medida"
      heroSubtitle="Creamos tecnología alineada a los procesos y objetivos de tu negocio. Diseñamos y desarrollamos soluciones tecnológicas personalizadas que se adaptan exactamente a la forma en que opera tu organización."
      heroCtaLabel="Cotizar mi desarrollo"
      problema={{
        title: 'No todos los negocios entran en una plataforma genérica',
        paragraphs: [
          'Muchas empresas trabajan con procesos propios, sistemas desconectados, planillas manuales o herramientas que no terminan de adaptarse a su operación real.',
          'Eso genera pérdida de tiempo, errores, falta de visibilidad y dificultad para escalar.',
        ],
      }}
      solucion={{
        title: 'Software diseñado para resolver problemas reales',
        paragraphs: [
          'En Volt analizamos tus procesos, identificamos oportunidades de mejora y construimos herramientas tecnológicas que generan eficiencia, escalabilidad y ventaja competitiva.',
          'No partimos de estructuras rígidas. Construimos soluciones alineadas a tu flujo de trabajo, tus objetivos y tus equipos.',
        ],
      }}
      queDesarrollamos={[
        'Sistemas de gestión internos.',
        'Plataformas web.',
        'Aplicaciones móviles.',
        'Portales para clientes y proveedores.',
        'Sistemas de logística y seguimiento.',
        'Automatización de procesos operativos.',
        'Dashboards e inteligencia de negocios.',
        'Integraciones entre sistemas.',
        'Soluciones basadas en inteligencia artificial.',
        'Plataformas de e-commerce.',
        'CRMs y herramientas comerciales personalizadas.',
      ]}
      enfoque={[
        'Escalabilidad.',
        'Seguridad.',
        'Rendimiento.',
        'Automatización.',
        'Integración con herramientas existentes.',
        'Experiencia de usuario.',
        'Retorno de inversión.',
      ]}
      extraSection={
        <section style={{ padding: '80px 24px', background: 'var(--color-bg-secondary)' }}>
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <ContentBlock
              title="Más que desarrollo"
              paragraphs={[
                'Combinamos análisis funcional, experiencia de usuario, arquitectura escalable y tecnologías modernas para construir productos sólidos y preparados para crecer junto a tu empresa.',
                'Nos involucramos como socios tecnológicos. Acompañamos desde la definición de la idea hasta la implementación, evolución y mantenimiento de la solución.',
                'El resultado es un producto diseñado para resolver problemas reales, optimizar operaciones y generar nuevas oportunidades de negocio mediante tecnología construida específicamente para tu organización.',
              ]}
            />
          </div>
        </section>
      }
      ctaFinal={{
        title: 'Construí una herramienta pensada para tu negocio',
        subtitle:
          'Transformá procesos manuales, sistemas desconectados o ideas pendientes en una solución tecnológica funcional, escalable y lista para crecer.',
        buttonLabel: 'Hablar con Volt',
      }}
    />
  );
}
