import { SolutionPageLayout } from '@/components/marketing/SolutionPageLayout';

export const metadata = {
  title: 'Chatbot Inteligente — Volt',
  description:
    'Automatizá conversaciones, capturá oportunidades y respondé en segundos con un asistente virtual entrenado para tu negocio.',
};

export default function ChatbotInteligentePage() {
  return (
    <SolutionPageLayout
      badge="Chatbot"
      heroTitle="Chatbot Inteligente para Ventas y Atención al Cliente"
      heroSubtitle="Automatizá conversaciones, capturá oportunidades y respondé en segundos. Transformá cada consulta en una oportunidad de negocio mediante un asistente virtual entrenado para responder preguntas frecuentes, calificar prospectos, brindar información comercial y acompañar a tus clientes las 24 horas del día."
      heroCtaLabel="Quiero automatizar mi atención"
      problema={{
        title: 'Tus clientes escriben. Tu equipo no siempre llega a tiempo.',
        paragraphs: [
          'Las consultas entran por distintos canales, se acumulan, se responden tarde o se pierden entre conversaciones. Eso impacta directamente en la atención, la experiencia del cliente y las oportunidades comerciales.',
        ],
      }}
      solucion={{
        title: 'Un asistente virtual entrenado para tu negocio',
        paragraphs: [
          'El chatbot de Volt responde de forma inmediata, entiende la intención del usuario, guía la conversación y deriva a una persona cuando la situación lo requiere.',
          'Puede trabajar como primer filtro comercial, soporte automatizado, asistente de ventas o canal de atención permanente.',
        ],
      }}
      beneficios={[
        'Atención inmediata las 24 horas.',
        'Reducción de tiempos operativos.',
        'Mayor conversión de consultas en ventas.',
        'Captura y clasificación automática de leads.',
        'Respuestas consistentes y alineadas a tu negocio.',
        'Escalamiento inteligente hacia equipos humanos.',
        'Reportes y métricas en tiempo real.',
      ]}
      casosUso={[
        'Atención comercial.',
        'Soporte al cliente.',
        'Generación de leads.',
        'Gestión de consultas frecuentes.',
        'Seguimiento de prospectos.',
        'Derivación automática según área o interés.',
        'Calificación de oportunidades.',
        'Envío de información sobre productos, servicios, precios o disponibilidad.',
      ]}
      ctaFinal={{
        title: 'Tu próximo cliente puede estar escribiendo ahora',
        subtitle:
          'Respondé más rápido, organizá mejor tus consultas y convertí más oportunidades con un chatbot entrenado para tu negocio.',
        buttonLabel: 'Agendar demo',
      }}
    />
  );
}
