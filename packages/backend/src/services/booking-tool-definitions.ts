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
      description:
        'Muestra precios. mode=prices (default): precio base + precio con cada promo por servicio. ' +
        'mode=promos: solo lista de promociones vigentes. NO lista horarios. ' +
        'Usar prices para "ver precios" / cuánto sale; promos solo si preguntan explícitamente por promociones/descuentos.',
      parameters: {
        type: 'object',
        properties: {
          service_id: { type: 'string', description: 'ID del servicio si ya está elegido (opcional)' },
          mode: {
            type: 'string',
            enum: ['prices', 'promos'],
            description: 'prices = lista con base+promos por servicio; promos = solo bloque de promociones',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_available_slots',
      description:
        'Consulta la agenda REAL y devuelve los primeros horarios libres. ' +
        'Usar apenas tengas servicio confirmado (modo ASAP, limit 2). ' +
        'También para fecha/frase libre (date_query) o "otros horarios" (exclude_shown=true). ' +
        'OBLIGATORIO antes de mencionar fechas/horas concretas.',
      parameters: {
        type: 'object',
        properties: {
          service_id: { type: 'string' },
          limit: { type: 'number', description: 'Default 2 en primera propuesta; máx 5' },
          mode: {
            type: 'string',
            enum: ['ASAP', 'RANGE', 'EXACT_DATE'],
            description: 'ASAP = próximos disponibles. RANGE requiere range. EXACT_DATE con date_query.',
          },
          range: {
            type: 'string',
            enum: ['this_week', 'next_week'],
            description: 'Solo con mode=RANGE',
          },
          date_query: {
            type: 'string',
            description: 'Frase libre: "mañana", "jueves", "25/07", "por la tarde", etc.',
          },
          daypart: {
            type: 'string',
            enum: ['ANY', 'MORNING', 'AFTERNOON'],
            description: 'Filtro franja horaria',
          },
          exclude_shown: {
            type: 'boolean',
            description: 'true si el usuario pidió otros/más horarios (excluye shownSlotKeys). Default true si ya hay shown.',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'show_slot_browse_menu',
      description:
        'Segundo nivel tras "Ver más horarios": menú Esta semana / Semana próxima / Elegir fecha. ' +
        'No consulta agenda; solo presenta el selector de rango.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_available_days',
      description:
        'Lista SOLO los días del rango que tienen al menos un cupo libre. ' +
        'Usar tras elegir Esta semana / Semana próxima, o un rango explícito.',
      parameters: {
        type: 'object',
        properties: {
          service_id: { type: 'string' },
          range: {
            type: 'string',
            enum: ['this_week', 'next_week'],
          },
          date_from: { type: 'string', description: 'YYYY-MM-DD (alternativa a range)' },
          date_to: { type: 'string', description: 'YYYY-MM-DD' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_slots_for_day',
      description: 'Horarios libres de un día concreto (después de que el usuario eligió un día de get_available_days).',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'YYYY-MM-DD' },
          service_id: { type: 'string' },
          daypart: { type: 'string', enum: ['ANY', 'MORNING', 'AFTERNOON'] },
        },
        required: ['date'],
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
      description:
        'Confirma el horario elegido revalidando en agenda real. Si se ocupó, devuelve alternativas. Requiere date y time.',
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
      description: 'Lista turnos activos del cliente para consulta, cancelación o reprogramación.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'request_cancel_appointment',
      description:
        'Prepara la cancelación: guarda el turno pendiente y muestra confirmación Sí/No. ' +
        'OBLIGATORIO antes de cancel_appointment (salvo confirm=true tras el sí del usuario).',
      parameters: {
        type: 'object',
        properties: {
          appointment_id: { type: 'string' },
          label: { type: 'string', description: 'Texto legible del turno a cancelar' },
        },
        required: ['appointment_id'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_appointment',
      description:
        'Cancela un turno. Requiere confirm=true (o pendingCancel ya aceptado por el usuario).',
      parameters: {
        type: 'object',
        properties: {
          appointment_id: { type: 'string' },
          confirm: { type: 'boolean', description: 'Debe ser true para ejecutar la cancelación' },
        },
        required: ['appointment_id', 'confirm'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'request_reschedule_appointment',
      description:
        'Inicia reprogramación de un turno confirmado/señado: muestra horarios libres. ' +
        'Mueve el mismo turno (mismo cobro). No cancelar ni crear otro.',
      parameters: {
        type: 'object',
        properties: {
          appointment_id: { type: 'string' },
          label: { type: 'string' },
        },
        required: ['appointment_id'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'apply_reschedule_appointment',
      description:
        'Aplica la nueva fecha/hora al turno (in place). Solo con date/time de listedSlots o disponibles.',
      parameters: {
        type: 'object',
        properties: {
          appointment_id: { type: 'string' },
          date: { type: 'string', description: 'YYYY-MM-DD' },
          time: { type: 'string', description: 'HH:MM' },
        },
        required: ['appointment_id', 'date', 'time'],
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
