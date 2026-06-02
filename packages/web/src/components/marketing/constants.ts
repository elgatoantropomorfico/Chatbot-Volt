export const PLATFORM_LOGIN = '/login';

export const DEMO_MAILTO =
  'mailto:pradoignacio.utn@icloud.com?subject=Solicitud%20de%20demo%20-%20Volt';

export const NAV_LINKS = [
  { label: 'Inicio', href: '/' },
  { label: 'Sectores', href: '/sectores' },
  { label: 'Casos de uso', href: '/casos-de-uso' },
  { label: 'Contacto', href: '/contacto' },
] as const;

export const SOLUTION_LINKS = [
  {
    label: 'Chatbot Inteligente',
    href: '/chatbot-inteligente',
    short: 'Ventas y atención con IA',
  },
  {
    label: 'Integraciones Meta',
    href: '/integraciones-meta',
    short: 'WhatsApp, Instagram y Facebook',
  },
  {
    label: 'Turnos y casos',
    href: '/automatizacion-turnos-consultas',
    short: 'Reservas, consultas y tickets',
  },
  {
    label: 'Software a medida',
    href: '/desarrollo-software-medida',
    short: 'Plataformas y sistemas propios',
  },
] as const;

export const IDEAL_FOR = [
  'Clínicas y centros médicos',
  'Instituciones educativas',
  'Inmobiliarias',
  'Comercios y servicios',
  'Equipos comerciales',
  'Áreas de atención al cliente',
  'Empresas con procesos repetitivos',
  'Organizaciones que necesitan integrar sistemas',
] as const;

export const GENERAL_BENEFITS = [
  'Atención inmediata',
  'Reducción de carga operativa',
  'Mayor conversión de consultas en ventas',
  'Datos organizados en tiempo real',
  'Procesos más eficientes',
  'Integración con herramientas existentes',
  'Escalabilidad para equipos comerciales y administrativos',
] as const;

export const WORK_STEPS = [
  'Analizamos tus procesos actuales',
  'Detectamos oportunidades de automatización',
  'Diseñamos la solución ideal',
  'Integramos canales, sistemas y flujos',
  'Implementamos, medimos y optimizamos',
] as const;
