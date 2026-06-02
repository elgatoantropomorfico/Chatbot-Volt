import { SolutionPageLayout } from '@/components/marketing/SolutionPageLayout';

export const metadata = {
  title: 'Automatización de Turnos y Casos — Volt',
  description:
    'Gestioná reservas, confirmaciones, consultas y tickets de forma automática.',
};

export default function AutomatizacionTurnosPage() {
  return (
    <SolutionPageLayout
      badge="Automatización"
      heroVisual="turnos"
      heroTitle="Automatización de Turnos, Consultas y Gestión de Casos"
      heroSubtitle="Menos tareas manuales. Más tiempo para lo importante. Digitalizá la atención al cliente mediante asistentes capaces de gestionar reservas, responder consultas frecuentes y organizar solicitudes de forma automática."
      heroCtaLabel="Automatizar mi gestión"
      problema={{
        title: 'La atención repetitiva consume tiempo y energía operativa',
        paragraphs: [
          'Responder siempre las mismas preguntas, confirmar turnos, reprogramar citas, derivar consultas y registrar casos manualmente hace que los equipos pierdan foco en tareas de mayor valor.',
        ],
      }}
      solucion={{
        title: 'Un sistema que entiende, organiza y ejecuta',
        paragraphs: [
          'La plataforma puede recibir consultas, identificar la necesidad del usuario y ejecutar acciones específicas sin intervención humana.',
          'Puede reservar turnos, confirmar citas, generar tickets, clasificar solicitudes y derivar casos según prioridad, área o tipo de consulta.',
        ],
      }}
      funcionalidades={[
        'Reserva automática de turnos.',
        'Confirmaciones y recordatorios.',
        'Reprogramación y cancelación de citas.',
        'Respuesta instantánea a preguntas frecuentes.',
        'Generación automática de tickets.',
        'Clasificación y derivación según prioridad o sector.',
        'Integración con sistemas existentes.',
        'Registro de datos y seguimiento de cada caso.',
      ]}
      aplicaciones={[
        'Clínicas y centros médicos.',
        'Estudios profesionales.',
        'Instituciones educativas.',
        'Servicios técnicos.',
        'Inmobiliarias.',
        'Centros de estética.',
        'Equipos de soporte.',
        'Empresas que gestionan consultas recurrentes.',
      ]}
      ctaFinal={{
        title: 'Organizá tus consultas antes de que lleguen al equipo humano',
        subtitle:
          'Automatizá la primera respuesta, la clasificación y la gestión operativa para trabajar con más orden y menos fricción.',
        buttonLabel: 'Ver cómo funciona',
        buttonHref: '/contacto',
      }}
    />
  );
}
