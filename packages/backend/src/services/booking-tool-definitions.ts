import type OpenAI from 'openai';

export const BOOKING_AGENT_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'list_services',
      description: 'Lista los caminos/servicios activos del spa. Usar cuando el usuario quiere ver opciones o elegir un camino.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'match_service',
      description: 'Busca un camino por nombre o descripción en el texto del usuario. Devuelve el mejor match o null.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Texto del usuario describiendo el camino deseado' },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'show_price_info',
      description: 'Muestra precios base y promociones vigentes en texto. NO lista horarios ni slots. Usar cuando preguntan precios o "ver precios".',
      parameters: {
        type: 'object',
        properties: {
          service_id: { type: 'string', description: 'ID del servicio si ya está elegido (opcional)' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_available_slots',
      description: 'Consulta la agenda REAL y devuelve horarios libres. OBLIGATORIO antes de mencionar fechas/horas concretas al usuario.',
      parameters: {
        type: 'object',
        properties: {
          service_id: { type: 'string', description: 'ID del servicio (requerido si hay servicio elegido)' },
          limit: { type: 'number', description: 'Cantidad máxima de slots a devolver (default 5)' },
          date_query: { type: 'string', description: 'Filtro opcional: "mañana", "jueves", "20/06", etc.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'confirm_service',
      description: 'Marca el camino elegido como confirmado en el estado. Requiere service_id.',
      parameters: {
        type: 'object',
        properties: {
          service_id: { type: 'string' },
          service_name: { type: 'string' },
        },
        required: ['service_id', 'service_name'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'confirm_slot',
      description: 'Marca el horario ofrecido como confirmado. Requiere date y time del slot elegido.',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'YYYY-MM-DD' },
          time: { type: 'string', description: 'HH:MM' },
          label: { type: 'string', description: 'Etiqueta legible del horario' },
        },
        required: ['date', 'time'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_customer_name',
      description: 'Guarda el nombre completo del cliente para la reserva.',
      parameters: {
        type: 'object',
        properties: {
          full_name: { type: 'string' },
        },
        required: ['full_name'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_customer_notes',
      description: 'Guarda notas para la sesión o marca que no hay notas (skip=true).',
      parameters: {
        type: 'object',
        properties: {
          notes: { type: 'string', description: 'Texto de notas; omitir si skip=true' },
          skip: { type: 'boolean', description: 'true si el usuario no tiene nada que avisar' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'initiate_checkout',
      description: 'Gate duro: inicia el checkout de pago. Solo cuando servicio, horario y nombre están confirmados. Mueve al flujo de Mercado Pago.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_my_appointments',
      description: 'Lista turnos activos del cliente para consulta o cancelación.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_appointment',
      description: 'Cancela un turno activo por appointment_id.',
      parameters: {
        type: 'object',
        properties: {
          appointment_id: { type: 'string' },
        },
        required: ['appointment_id'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reset_booking',
      description: 'Reinicia la gestión de reserva en curso (volver al inicio).',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
];

export function toolCatalogText(): string {
  return BOOKING_AGENT_TOOLS.map((t) => {
    const fn = t.function;
    return `- ${fn.name}: ${fn.description}`;
  }).join('\n');
}
