/**
 * El manual de la API de agentes, en un formato que una IA lee sin esfuerzo.
 *
 * Lo devuelve `GET /api/agentes/manual`. La idea es que CUALQUIER agente —Jarvis,
 * Ariel, Spike, Goku, o uno nuevo que se conecte mañana— pueda preguntar "quién
 * soy y qué puedo hacer" con su token, y reciba la respuesta completa sin que
 * nadie le haya explicado la API antes.
 *
 * Es la misma información que `docs/API-AGENTES-INTELLIGENCE.md`, pero
 * estructurada: una lista de rutas con su propósito, un ejemplo de cuerpo y las
 * reglas que no se negocian. Si se agrega una ruta nueva en /api/agentes, se
 * agrega acá también.
 */

export interface RutaManual {
  metodo: 'GET' | 'POST' | 'PUT' | 'PATCH'
  ruta: string
  para: string
  ejemplo?: unknown
  responde?: unknown
  reglas?: string[]
}

export const REGLAS_GENERALES = [
  'Autenticación: cabecera "Authorization: Bearer txa_…". Es el mismo token para todas las rutas.',
  'El cuerpo va en JSON y en UTF-8. Otra codificación se rechaza con 400 en vez de guardar tildes rotas.',
  'Cada llamada cuenta como latido: la pantalla Sala deduce si el agente está vivo por la última vez que llamó.',
  'Límite: 60 llamadas por minuto por agente. Pasado eso, 429 con Retry-After.',
  'Los errores siempre explican el motivo en "error". Un 409 significa que la acción no aplica al estado actual (por ejemplo, un encargo sin permiso).',
]

export const RUTAS: RutaManual[] = [
  {
    metodo: 'GET',
    ruta: '/api/agentes/manual',
    para: 'Este manual, con la identidad del agente que lo pide. Úselo al arrancar.',
  },
  {
    metodo: 'GET',
    ruta: '/api/agentes/encargos',
    para: 'Lo que el equipo le encargó y ya tiene permiso: estados "aprobado" y "en_curso", lo urgente primero.',
    responde: { success: true, encargos: [{ id: 'uuid', tipo: 'tarea', titulo: '…', detalle: '…', estado: 'aprobado', prioridad: 'alta' }] },
    reglas: [
      'Con ?todos=1 también devuelve lo "encolado": eso espera permiso humano y NO se ejecuta, solo se lee para saber qué viene.',
    ],
  },
  {
    metodo: 'PATCH',
    ruta: '/api/agentes/encargos',
    para: 'Tomar un encargo aprobado, o responderlo.',
    ejemplo: [
      { accion: 'tomar', id: 'uuid' },
      { accion: 'responder', id: 'uuid', respuesta: 'Lo que hice o lo que averigüé, con el detalle que sirva para revisarlo.' },
    ],
    reglas: [
      'Solo se toma lo "aprobado". Lo "encolado" responde 409: ninguna persona lo autorizó todavía.',
      'La respuesta no puede ir vacía: un "listo" sin contenido no se puede revisar.',
    ],
  },
  {
    metodo: 'GET',
    ruta: '/api/agentes/directivas',
    para: 'Decisiones vigentes del equipo (promociones, cambios de oferta, reglas del momento). Mandan sobre su guion.',
    ejemplo: '?para=conversacion (por defecto) o ?para=primer_mensaje',
    responde: { success: true, directivas: ['Este mes hay 20 % de descuento en landings.'] },
    reglas: ['Un descuento se comunica como porcentaje, nunca como monto calculado.'],
  },
  {
    metodo: 'POST',
    ruta: '/api/agentes/consumo',
    para: 'Reportar lo que gastó en modelos, para la pantalla Costos.',
    ejemplo: { modelo: 'claude-sonnet-5', tokensEntrada: 1200, tokensSalida: 340, costoUsd: 0.0081, encargoId: 'uuid (opcional)' },
    reglas: [
      'En dólares, como cobran los proveedores.',
      'Más de 500 dólares en un solo reporte se rechaza: casi siempre es un error de unidades.',
      'El bot de WhatsApp no la usa: su gasto ya lo registra el VPS.',
    ],
  },
  {
    metodo: 'GET',
    ruta: '/api/agentes/citas',
    para: 'Los documentos del Cerebro (la base de conocimiento del CRM), para leerlos.',
  },
  {
    metodo: 'POST',
    ruta: '/api/agentes/citas',
    para: 'Dejar constancia de qué documento usó para responder.',
    ejemplo: { documentoId: 'uuid', encargoId: 'uuid (opcional)' },
  },
  {
    metodo: 'PUT',
    ruta: '/api/agentes/rutinas',
    para: 'Declarar una rutina (por reloj o por evento) y reportar cada corrida.',
    ejemplo: {
      nombre: 'Resumen diario de leads',
      tipo: 'reloj',
      disparador: 'todos los días a las 09:00',
      resultado: 'ok',
      detalle: '12 leads revisados',
      proximaAt: '2026-09-24T12:00:00Z',
    },
    responde: { success: true, activa: true },
    reglas: [
      'Si la respuesta trae "activa": false, el equipo la apagó: no la corra.',
      'Reporte cada corrida: una rutina atrasada se marca en pantalla.',
    ],
  },
  {
    metodo: 'POST',
    ruta: '/api/agentes/mejoras',
    para: 'Proponer un cambio con la evidencia que lo justifica. Una persona lo aprueba antes de aplicarlo.',
    ejemplo: { titulo: 'Agregar el horario de atención al guion', detalle: 'Qué cambiar y dónde', evidencia: '4 de 9 dudas de la quincena preguntan por el horario' },
    reglas: ['La evidencia es obligatoria: una mejora sin el dato que la justifica es una opinión.'],
  },
  {
    metodo: 'GET',
    ruta: '/api/agentes/mensajes',
    para: 'Leer el canal del equipo ("Equipo agéntico", el antiguo #chatia).',
  },
  {
    metodo: 'POST',
    ruta: '/api/agentes/mensajes',
    para: 'Escribir en el canal del equipo. Nunca en los mensajes directos de las personas.',
  },
  {
    metodo: 'PUT',
    ruta: '/api/agentes/estado',
    para: 'Decir en qué está, para la oficina de Intelligence: trabajando, descansando o ausente, con una nota corta.',
    ejemplo: { estado: 'trabajando', nota: 'revisando el proxy', minutos: 30 },
    reglas: [
      'Lo declarado vence (por defecto a los 30 min): si sigue en lo mismo, vuelva a declararlo.',
      'Un encargo tomado manda: la oficina lo muestra trabajando aunque declare otra cosa.',
    ],
  },
  {
    metodo: 'POST',
    ruta: '/api/agentes/eventos',
    para: 'Agendar una reunión en el CRM y en Google Calendar; queda marcado qué agente la agendó.',
  },
]

export const CICLO_RECOMENDADO = [
  '1. Al arrancar: GET /api/agentes/manual (quién soy, qué puedo hacer).',
  '2. Cada 1 a 5 minutos: GET /api/agentes/encargos.',
  '3. Por cada encargo: PATCH tomar → hacer el trabajo → POST consumo → PATCH responder.',
  '4. Antes de conversar con un cliente: GET /api/agentes/directivas.',
  '5. Si ve algo que mejorar en su propio trabajo: POST /api/agentes/mejoras, con evidencia.',
]
