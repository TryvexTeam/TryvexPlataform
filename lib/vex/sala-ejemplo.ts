import type {
  AgenteSala,
  Encargo,
  EntradaHilo,
  Herramienta,
  Rutina,
} from '@/lib/types/sala-agentes'

/**
 * Datos de EJEMPLO para la Sala de Agentes.
 *
 * Esta primera entrega es la capa visual: la pantalla se ve completa y se puede
 * discutir sin haber cableado nada. Los nombres y oficios son los reales del
 * equipo (cerebro/contexto-tryvex.md), pero los números y los textos son
 * inventados y así se anuncian en pantalla — no se pasan por datos de verdad.
 *
 * Cuando se conecte a la base, esto se reemplaza por repos en `lib/repos/`:
 * `agentes`, `tareas` + `tarea_evidencias` (loop de la migración 014) y la
 * tabla `rutinas`, que todavía no existe.
 */

export const AGENTES_EJEMPLO: AgenteSala[] = [
  {
    id: 'vex',
    nombre: 'Vex',
    oficio: 'Comercial · escribe y contesta a los leads',
    color: 'var(--tx-accent)',
    estado: 'trabajando',
    haciendo: 'Redactando el primer mensaje para 12 leads nuevos del scraper.',
    humano: 'Ignacio',
    encargosHoy: 7,
    proximaRutina: 'hoy 20:00',
  },
  {
    id: 'ariel',
    nombre: 'Ariel',
    oficio: 'Ingeniería · Vex, el scraper y la infraestructura del contacto',
    color: 'var(--tx-green)',
    estado: 'esperando_firma',
    haciendo: 'Todo probado. No toca producción hasta que alguien firme el encargo #1281.',
    humano: 'Cristian',
    encargosHoy: 4,
    proximaRutina: null,
  },
  {
    id: 'spike',
    nombre: 'Spike',
    oficio: 'Datos · el puente de WhatsApp y la revisión cruzada',
    color: 'var(--tx-blue)',
    estado: 'trabajando',
    haciendo: 'Revisando qué ofrece la web de 38 leads: reserva, carrito, cotizador.',
    humano: 'Adley',
    encargosHoy: 9,
    proximaRutina: 'mañana 09:00',
  },
  {
    id: 'emili',
    nombre: 'Emili',
    oficio: 'Recepción · atiende el WhatsApp comercial y agenda',
    color: 'var(--tx-orange)',
    estado: 'en_reposo',
    haciendo: 'Agendó una reunión con Ópticas Premium para el jueves a las 11:00.',
    humano: null,
    encargosHoy: 3,
    proximaRutina: 'cuando escriba un lead',
  },
  {
    id: 'jarvis',
    nombre: 'Jarvis',
    oficio: 'Coordinación · la plataforma, la vista y el reparto',
    color: 'var(--tx-ink-muted)',
    estado: 'sin_latido',
    haciendo:
      'Tomó el cierre semanal y dejó de dar señales hace 14 min. Su encargo quedó huérfano y volvió a la cola.',
    humano: 'Ignacio',
    encargosHoy: 2,
    proximaRutina: null,
  },
]

export const ENCARGOS_EJEMPLO: Encargo[] = [
  {
    id: '1284',
    titulo: 'Escribir a 43 peluquerías de Ñuñoa',
    agenteId: 'spike',
    estado: 'bloqueada',
    evidencias: [{ tipo: 'log', resumen: '43 borradores listos' }],
    veredicto: null,
    pedidoPor: 'Vicente',
    requiereFirma: true,
    porQueIrreversible: 'Sale por el número comercial. Un mensaje enviado no se puede recoger.',
  },
  {
    id: '1281',
    titulo: 'Arreglar el límite de reservas de la landing',
    agenteId: 'ariel',
    estado: 'bloqueada',
    evidencias: [
      { tipo: 'test', resumen: '12 pruebas en verde' },
      { tipo: 'exit_code', resumen: 'build 0' },
      { tipo: 'url', resumen: 'vista previa del despliegue' },
    ],
    veredicto: 'pasa',
    pedidoPor: 'Ignacio',
    requiereFirma: true,
    porQueIrreversible: 'Toca el sitio que está vivo ahora mismo.',
  },
  {
    id: '1286',
    titulo: 'Revisar qué ofrece la web de los leads nuevos',
    agenteId: 'spike',
    estado: 'en_curso',
    evidencias: [{ tipo: 'log', resumen: '38 de 47 revisados' }],
    veredicto: null,
    pedidoPor: 'Rutina diaria',
    requiereFirma: false,
    porQueIrreversible: null,
  },
  {
    id: '1279',
    titulo: 'Contestar a Peluquería Carola',
    agenteId: 'emili',
    estado: 'listo',
    evidencias: [
      { tipo: 'url', resumen: 'ficha del lead creada' },
      { tipo: 'log', resumen: 'hilo de 6 mensajes' },
    ],
    veredicto: 'pasa',
    pedidoPor: 'Evento: el lead respondió',
    requiereFirma: false,
    porQueIrreversible: null,
  },
  {
    id: '1275',
    titulo: 'Cierre financiero de la semana',
    agenteId: 'jarvis',
    estado: 'huerfana',
    evidencias: [],
    veredicto: null,
    pedidoPor: 'Rutina semanal',
    requiereFirma: false,
    porQueIrreversible: null,
  },
]

export const HILO_EJEMPLO: EntradaHilo[] = [
  {
    clase: 'mensaje',
    de: 'persona',
    autor: 'Ignacio',
    hora: '18:40',
    texto:
      'Revisá las webs de los leads nuevos de hoy y decime cuáles ya tienen reserva online. A esos no les ofrezcas agenda.',
  },
  {
    clase: 'mensaje',
    de: 'agente',
    autor: 'Spike',
    hora: '18:40',
    texto:
      'Voy. Son 47 leads con sitio. Si alguno no se deja leer lo marco como «no sabemos», nunca como «no tiene».',
  },
  {
    clase: 'pasos',
    pasos: [
      { orden: 1, texto: 'Leyó fact_leads · 47 con sitio, 0 revisados hoy', duracion: '0,3 s', resultado: 'ok' },
      { orden: 2, texto: 'Abrió 47 sitios · home, /contacto, /reservas y /agenda', duracion: '3 min 40 s', resultado: 'ok' },
      { orden: 3, texto: '9 sitios no respondieron · quedan como «no sabemos»', duracion: '—', resultado: 'aviso' },
      { orden: 4, texto: 'Escribió web_capacidades en 38 leads', duracion: '4,1 s', resultado: 'ok' },
      { orden: 5, texto: 'Avisó a Vex: 14 ya tienen reserva online', duracion: '0,2 s', resultado: 'ok' },
    ],
  },
  {
    clase: 'mensaje',
    de: 'agente',
    autor: 'Spike',
    hora: '18:46',
    texto:
      'Listo. De 47: 14 tienen reserva online, 6 tienen carrito y 11 solo formulario. Nueve no se dejaron leer y los dejé sin conclusión.\n\nLo que veo: a los 14 con reserva conviene ofrecerles la página de vitrina, no agenda.',
  },
  {
    clase: 'veredicto',
    resultado: 'pasa',
    detalle: 'Encargo #1286 · ejecutó Spike · validó Vex · sin firma humana: no toca nada irreversible',
    evidencias: [
      { tipo: 'log', resumen: '47 sitios' },
      { tipo: 'exit_code', resumen: '0' },
      { tipo: 'url', resumen: '3 muestras' },
      { tipo: 'test', resumen: '12 verdes' },
    ],
  },
  {
    clase: 'mensaje',
    de: 'persona',
    autor: 'Ignacio',
    hora: '18:52',
    texto: 'Perfecto. Convertilo en rutina diaria a las 9.',
  },
  {
    clase: 'mensaje',
    de: 'agente',
    autor: 'Spike',
    hora: '18:52',
    texto:
      'Hecho. Queda como rutina «Revisar webs nuevas», todos los días a las 09:00. Te aviso solo si algo falla.',
  },
]

export const RUTINAS_EJEMPLO: Rutina[] = [
  {
    id: 'r1',
    titulo: 'Revisar webs nuevas',
    descripcion: 'Mira qué ofrece el sitio de cada lead nuevo y lo anota. Avisa solo si algo falla.',
    disparo: 'reloj',
    cuando: 'cada día 09:00',
    ultimaCorrida: 'ayer · 47 leads · ok',
    activa: true,
  },
  {
    id: 'r2',
    titulo: 'Calificar al que llega',
    descripcion: 'Puntaje por rubro, comuna y si ya tiene web. Deja la ficha lista para que Vex escriba.',
    disparo: 'evento',
    cuando: 'cuando entra un lead',
    ultimaCorrida: 'hace 12 min · ok',
    activa: true,
  },
  {
    id: 'r3',
    titulo: 'Barrido de la cartera vieja',
    descripcion: 'Vuelve a mirar los leads revisados hace más de 60 días.',
    disparo: 'reloj',
    cuando: 'lunes 08:00',
    ultimaCorrida: 'apagada desde el 2 de septiembre',
    activa: false,
  },
]

export const HERRAMIENTAS_EJEMPLO: Herramienta[] = [
  {
    id: 'h1',
    nombre: 'Leer y escribir leads',
    ruta: '/api/agentes/lead',
    detalle: 'Crear, calificar y anotar en la ficha.',
    concedida: true,
    exigeFirma: false,
  },
  {
    id: 'h2',
    nombre: 'Navegador propio',
    ruta: null,
    detalle: 'Abrir los sitios de los leads, sin la sesión de nadie.',
    concedida: true,
    exigeFirma: false,
  },
  {
    id: 'h3',
    nombre: 'Escribir en el chat del equipo',
    ruta: '/api/agentes/mensajes',
    detalle: 'Avisar en el canal Equipo agéntico.',
    concedida: true,
    exigeFirma: false,
  },
  {
    id: 'h4',
    nombre: 'Mandar WhatsApp',
    ruta: '/api/agentes/wa-mensaje',
    detalle: 'Escribirle a un lead por el número comercial.',
    concedida: true,
    exigeFirma: true,
  },
  {
    id: 'h5',
    nombre: 'Agendar reuniones',
    ruta: '/api/agentes/eventos',
    detalle: 'No es su oficio: apagada.',
    concedida: false,
    exigeFirma: false,
  },
]
