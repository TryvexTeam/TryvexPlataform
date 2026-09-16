import type { CostoAgente } from '@/components/vex/intelligence/panel-costos'
import type { Campana } from '@/components/vex/intelligence/panel-campanas'
import type { MetricasSala } from '@/components/vex/intelligence/panel-metricas'
import type { DocumentoConocimiento } from '@/components/vex/intelligence/panel-conocimiento'
import type {
  AgenteSala,
  Canal,
  ConversacionCliente,
  Encargo,
  EntradaHilo,
  Herramienta,
  Rutina,
  Traspaso,
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

/**
 * Los canales por donde trabajan los agentes.
 *
 * Los plazos son reales, no de adorno: la app de WhatsApp Business hay que
 * abrirla cada 13 días o la coexistencia se rompe, y desde el 1-oct-2026 Meta
 * cobra los mensajes de servicio pasados los 1.000 del mes.
 */
export const CANALES_EJEMPLO: Canal[] = [
  {
    id: 'ch1',
    tipo: 'whatsapp_oficial',
    etiqueta: '+56 9 4421 8890',
    agenteId: 'emili',
    estado: 'conectado',
    desde: 'agosto 2026',
    riesgo: 'ninguno',
    nota: 'API oficial de Meta. Sin riesgo de bloqueo; se paga por mensaje.',
    mensajesHoy: 148,
    aviso: {
      texto: 'Abrí la app de WhatsApp Business: la coexistencia se rompe a los 13 días sin usarla.',
      cuando: 'quedan 4 días',
      severidad: 'aviso',
    },
  },
  {
    id: 'ch2',
    tipo: 'whatsapp_baileys',
    etiqueta: '+56 9 7712 3345',
    agenteId: 'vex',
    estado: 'conectado',
    desde: 'julio 2026',
    riesgo: 'alto',
    nota: 'Número propio, sin costo por mensaje. Si WhatsApp lo bloquea, se pierde sin apelación.',
    mensajesHoy: 63,
    salida: 'Router 4G de la oficina · IP chilena propia',
    aviso: {
      texto: 'Este número no puede compartir salida con otro: si WhatsApp marca la IP, caen todos juntos.',
      cuando: 'regla permanente',
      severidad: 'critico',
    },
  },
  {
    id: 'ch3',
    tipo: 'web',
    etiqueta: 'tryvex.tech',
    agenteId: 'vex',
    estado: 'conectado',
    desde: 'junio 2026',
    riesgo: 'ninguno',
    nota: 'Chat en el sitio. Sin trámites y sin costo por mensaje: el canal más barato que hay.',
    mensajesHoy: 22,
  },
  {
    id: 'ch4',
    tipo: 'instagram',
    etiqueta: '@tryvex.cl',
    agenteId: 'emili',
    estado: 'apagado',
    desde: '—',
    riesgo: 'medio',
    nota: 'Meta solo deja responder dentro de las 24 h. Fuera de esa ventana, contesta una persona.',
    mensajesHoy: 0,
    aviso: {
      texto: 'Falta la revisión de la app en Meta: puede tardar semanas, conviene mandarla antes de venderlo.',
      cuando: 'sin enviar',
      severidad: 'info',
    },
  },
  {
    id: 'ch5',
    tipo: 'telegram',
    etiqueta: '@tryvex_bot',
    agenteId: 'spike',
    estado: 'sin_latido',
    desde: 'agosto 2026',
    riesgo: 'ninguno',
    nota: 'Se usa para avisos internos del equipo, no para clientes.',
    mensajesHoy: 0,
    aviso: {
      texto: 'No responde hace 3 horas. Puede ser el webhook o el token.',
      cuando: 'hace 3 h',
      severidad: 'aviso',
    },
  },
]

/**
 * Lo que cuesta tener a los agentes trabajando.
 *
 * Los montos son de ejemplo pero el orden de magnitud es el real de un modelo
 * económico: unos pocos pesos por conversación. Lo caro nunca es pensar — es
 * mandar el mensaje por la API oficial de WhatsApp, y eso se cobra aparte.
 */
export const COSTOS_EJEMPLO: CostoAgente[] = [
  {
    agenteId: 'vex',
    nombre: 'Vex',
    color: 'var(--tx-accent)',
    gastoHoyCLP: 2140,
    gastoMesCLP: 38600,
    encargosMes: 412,
    tokensMes: 9_840_000,
    serie: [980, 1240, 1180, 1620, 2010, 1740, 1390, 2260, 2480, 1920, 2050, 2310, 2180, 2140],
  },
  {
    agenteId: 'spike',
    nombre: 'Spike',
    color: 'var(--tx-blue)',
    gastoHoyCLP: 1620,
    gastoMesCLP: 24800,
    encargosMes: 286,
    tokensMes: 6_120_000,
    serie: [720, 890, 1010, 1180, 1340, 980, 1120, 1560, 1480, 1290, 1610, 1720, 1540, 1620],
  },
  {
    agenteId: 'ariel',
    nombre: 'Ariel',
    color: 'var(--tx-green)',
    gastoHoyCLP: 890,
    gastoMesCLP: 16400,
    encargosMes: 94,
    tokensMes: 4_310_000,
    serie: [410, 520, 680, 720, 610, 880, 940, 760, 1020, 880, 790, 930, 850, 890],
  },
  {
    agenteId: 'emili',
    nombre: 'Emili',
    color: 'var(--tx-orange)',
    gastoHoyCLP: 480,
    gastoMesCLP: 9200,
    encargosMes: 178,
    tokensMes: 2_240_000,
    serie: [260, 310, 290, 410, 380, 350, 420, 460, 390, 340, 470, 510, 440, 480],
  },
  {
    agenteId: 'jarvis',
    nombre: 'Jarvis',
    color: 'var(--tx-ink-muted)',
    gastoHoyCLP: 0,
    gastoMesCLP: 6100,
    encargosMes: 46,
    tokensMes: 1_480_000,
    serie: [180, 240, 310, 280, 350, 290, 410, 380, 320, 260, 180, 90, 40, 0],
  },
]

/**
 * Conversaciones con gente de afuera.
 *
 * Tres casos que cubren lo que de verdad pasa: una que el agente lleva solo,
 * una que un humano interrumpió a la mitad, y una donde el agente se frenó
 * porque no sabía la respuesta — que es el caso que más enseña.
 */
export const CONVERSACIONES_EJEMPLO: ConversacionCliente[] = [
  {
    id: 'c1',
    cliente: 'Peluquería Carola',
    telefono: '+56 9 6543 2109',
    canal: 'whatsapp',
    agenteId: 'emili',
    modo: 'AI',
    ultimoMensaje: 'para mostrar trabajos. la reserva ya la tengo con reservo',
    hace: 'hace 3 min',
    sinLeer: 0,
    ficha: {
      negocio: 'Peluquería Carola',
      rubro: 'Peluquería',
      comuna: 'Ñuñoa',
      estado: 'interesada',
      capacidadesWeb: ['reserva', 'whatsapp'],
    },
    hilo: [
      {
        clase: 'mensaje',
        de: 'cliente',
        autor: 'Carola',
        hora: '19:41',
        texto: 'hola, vi que hacen páginas. cuánto sale una para mi peluquería?',
      },
      {
        clase: 'pasos',
        pasos: [
          { orden: 1, texto: 'Buscó el número en fact_leads · lead ya existía', duracion: '0,2 s', resultado: 'ok' },
          { orden: 2, texto: 'Leyó web_capacidades: reserva, whatsapp', duracion: '0,1 s', resultado: 'ok' },
          { orden: 3, texto: 'Frenos: precios permitidos $180.000 y $25.000/mes', duracion: '0,04 s', resultado: 'ok' },
        ],
      },
      {
        clase: 'mensaje',
        de: 'agente',
        autor: 'Emili',
        hora: '19:41',
        texto:
          'Hola Carola. Sí, hacemos páginas. Antes de tirarte un número: ¿la querís para mostrar tus trabajos, o para que te reserven hora online?',
      },
      {
        clase: 'mensaje',
        de: 'cliente',
        autor: 'Carola',
        hora: '19:44',
        texto: 'para mostrar trabajos. la reserva ya la tengo con reservo',
      },
      {
        clase: 'mensaje',
        de: 'agente',
        autor: 'Emili',
        hora: '19:44',
        texto:
          'Perfecto, entonces no te vendo lo que ya tenés resuelto.\n\nUna página para mostrar trabajos, con tu galería y el enlace a Reservo, sale $180.000 y queda lista en una semana.',
      },
      {
        clase: 'veredicto',
        resultado: 'pasa',
        detalle: 'Lead actualizado a «interesada» · ejecutó Emili · validó Vex',
        evidencias: [
          { tipo: 'url', resumen: 'ficha del lead' },
          { tipo: 'log', resumen: 'hilo de 4 mensajes' },
        ],
      },
    ],
  },
  {
    id: 'c2',
    cliente: 'Ópticas Premium',
    telefono: '+56 9 8812 4471',
    canal: 'whatsapp',
    agenteId: 'emili',
    modo: 'HUMANO',
    ultimoMensaje: 'Perfecto, nos vemos el jueves a las 11 entonces.',
    hace: 'hace 25 min',
    sinLeer: 0,
    ficha: {
      negocio: 'Ópticas Premium',
      rubro: 'Óptica',
      comuna: 'Providencia',
      estado: 'reunión agendada',
      capacidadesWeb: ['reserva', 'cotiza', 'carrito'],
    },
    hilo: [
      {
        clase: 'mensaje',
        de: 'cliente',
        autor: 'Rodrigo',
        hora: '18:52',
        texto: 'me interesa pero quiero hablar con alguien, no con un bot',
      },
      {
        clase: 'pasos',
        pasos: [
          { orden: 1, texto: 'Detectó pedido explícito de humano', duracion: '0,03 s', resultado: 'aviso' },
          { orden: 2, texto: 'Ejecutó derivarHumano · avisó a Vicente', duracion: '0,4 s', resultado: 'ok' },
          { orden: 3, texto: 'Se calló en este hilo por 8 horas', duracion: '—', resultado: 'ok' },
        ],
      },
      {
        clase: 'mensaje',
        de: 'persona',
        autor: 'Vicente',
        hora: '18:55',
        texto: 'Hola Rodrigo, soy Vicente de Tryvex. ¿Te viene bien el jueves a las 11 para mostrarte dos ejemplos?',
      },
      {
        clase: 'mensaje',
        de: 'cliente',
        autor: 'Rodrigo',
        hora: '19:20',
        texto: 'Perfecto, nos vemos el jueves a las 11 entonces.',
      },
    ],
  },
  {
    id: 'c3',
    cliente: 'Gimnasio Aconcagua',
    telefono: 'chat de la web',
    canal: 'web',
    agenteId: 'vex',
    modo: 'AI',
    ultimoMensaje: 'Te confirmo el valor con el equipo y te aviso.',
    hace: 'hace 1 h',
    sinLeer: 2,
    ficha: {
      negocio: 'Gimnasio Aconcagua',
      rubro: 'Gimnasio',
      comuna: 'Maipú',
      estado: 'sin contactar',
      capacidadesWeb: [],
    },
    hilo: [
      {
        clase: 'mensaje',
        de: 'cliente',
        autor: 'Visitante',
        hora: '18:10',
        texto: '¿me hacen un descuento si contrato la página y el mantenimiento juntos?',
      },
      {
        clase: 'pasos',
        pasos: [
          { orden: 1, texto: 'El modelo propuso «$150.000 con descuento»', duracion: '1,3 s', resultado: 'ok' },
          { orden: 2, texto: 'FRENO: importe no autorizado · 150000 no está en la lista', duracion: '0,02 s', resultado: 'error' },
          { orden: 3, texto: 'Reemplazó por la respuesta segura y avisó al equipo', duracion: '0,1 s', resultado: 'ok' },
        ],
      },
      {
        clase: 'mensaje',
        de: 'agente',
        autor: 'Vex',
        hora: '18:10',
        texto: 'Te confirmo el valor con el equipo y te aviso.',
      },
      {
        clase: 'veredicto',
        resultado: 'falla',
        detalle:
          'El agente no supo responder y frenó bien, pero el lead quedó esperando. Falta decidir si existe ese descuento.',
        evidencias: [{ tipo: 'log', resumen: 'guardrail precio bloqueado' }],
      },
    ],
  },
]

/**
 * Lo que los agentes saben, y de dónde lo sacaron.
 *
 * Un documento sin citas en 30 días es peso muerto: o está mal indexado o
 * nadie pregunta por eso. Por eso `citasMes` y `ultimaCita` viajan siempre.
 */
export const DOCUMENTOS_EJEMPLO: DocumentoConocimiento[] = [
  {
    id: 'doc-precios',
    titulo: 'Lista de precios y planes 2026',
    origen: 'manual',
    resumen: 'Los tres planes, el anual con descuento y las cuotas derivadas.',
    fragmentos: 24,
    agentes: ['vex', 'ariel'],
    citasMes: 187,
    ultimaCita: '2026-09-15T22:40:00-03:00',
    actualizado: '2026-09-02T11:20:00-03:00',
  },
  {
    id: 'doc-objeciones',
    titulo: 'Objeciones frecuentes y cómo responderlas',
    origen: 'reunion',
    resumen: 'Doce objeciones reales de cierre, con la respuesta acordada por el equipo.',
    fragmentos: 41,
    agentes: ['vex', 'ariel', 'emili'],
    citasMes: 96,
    ultimaCita: '2026-09-15T19:05:00-03:00',
    actualizado: '2026-08-28T16:00:00-03:00',
  },
  {
    id: 'doc-sitio',
    titulo: 'tryvex.cl · páginas públicas',
    origen: 'web',
    resumen: 'Servicios, casos y preguntas frecuentes, tal como están publicados.',
    fragmentos: 118,
    agentes: ['vex'],
    citasMes: 54,
    ultimaCita: '2026-09-14T10:12:00-03:00',
    actualizado: '2026-09-10T08:00:00-03:00',
  },
  {
    id: 'doc-soporte',
    titulo: 'Guion de soporte técnico nivel 1',
    origen: 'manual',
    resumen: 'Los ocho problemas que resuelve el equipo sin escalar a ingeniería.',
    fragmentos: 33,
    agentes: ['spike', 'emili'],
    citasMes: 12,
    ultimaCita: '2026-09-08T15:30:00-03:00',
    actualizado: '2026-06-19T09:45:00-03:00',
  },
  {
    id: 'doc-integraciones',
    titulo: 'Integraciones disponibles y sus límites',
    origen: 'manual',
    resumen: 'Qué se conecta hoy, qué no, y qué requiere desarrollo a medida.',
    fragmentos: 57,
    agentes: ['spike'],
    citasMes: 0,
    ultimaCita: null,
    actualizado: '2026-04-03T14:00:00-03:00',
  },
  {
    id: 'doc-llamadas',
    titulo: 'Transcripciones de llamadas cerradas · agosto',
    origen: 'conversacion',
    resumen: 'Lo que dijeron los clientes que sí compraron, en sus palabras.',
    fragmentos: 206,
    agentes: ['ariel', 'jarvis'],
    citasMes: 31,
    ultimaCita: '2026-09-13T17:22:00-03:00',
    actualizado: '2026-09-01T12:00:00-03:00',
  },
]

/**
 * Traspasos de ejemplo.
 *
 * Elegidos para que se note el orden: el reclamo de hace 8 minutos tiene que
 * quedar arriba del 'pidio hablar con alguien' de anteayer.
 */
export const TRASPASOS_EJEMPLO: Traspaso[] = [
  {
    id: 'tr-01',
    conversacionId: 'conv-01',
    cliente: 'Camila Vergara · Clínica Andes',
    canal: 'whatsapp_baileys',
    agenteId: 'vex',
    motivo: 'reclamo',
    resumen: 'Cobro duplicado del plan de septiembre. Pide la plata de vuelta hoy.',
    ultimoMensaje: 'Me cobraron dos veces y nadie me responde, necesito que me devuelvan eso hoy.',
    estado: 'esperando',
    desde: '2026-09-15T23:42:00-03:00',
    intentos: [
      'Pidió el comprobante y lo recibió.',
      'Ofreció nota de crédito; la clienta quiere la devolución, no crédito.',
    ],
    clienteEsperando: true,
  },
  {
    id: 'tr-02',
    conversacionId: 'conv-07',
    cliente: 'Rodrigo Pizarro · Aurora Retail',
    canal: 'whatsapp_oficial',
    agenteId: 'ariel',
    motivo: 'precio_no_autorizado',
    resumen: 'Pide un 30% por tres años. El descuento máximo autorizado es 15%.',
    ultimoMensaje: 'Si me dejan el anual en 30% menos firmamos mañana mismo.',
    estado: 'esperando',
    desde: '2026-09-15T21:10:00-03:00',
    intentos: ['Ofreció el 15% anual, que es el tope del guion.'],
    clienteEsperando: true,
  },
  {
    id: 'tr-03',
    conversacionId: 'conv-12',
    cliente: 'Fernanda Soto',
    canal: 'instagram',
    agenteId: 'emili',
    motivo: 'dato_sensible',
    resumen: 'Mandó una foto de su cédula por el chat para validar identidad.',
    ultimoMensaje: 'Ahí va mi carnet para que confirmen que soy yo.',
    estado: 'tomado',
    desde: '2026-09-15T18:30:00-03:00',
    tomadoPor: 'Ignacio',
    intentos: ['Pidió no enviar documentos por el chat; ya estaba enviado.'],
    clienteEsperando: false,
  },
  {
    id: 'tr-04',
    conversacionId: 'conv-19',
    cliente: 'Matías Leiva · Grupo Zeta',
    canal: 'web',
    agenteId: 'spike',
    motivo: 'sin_conocimiento',
    resumen: 'Pregunta si se integra con un ERP que no está en la base de conocimiento.',
    ultimoMensaje: 'Trabajamos con Defontana, se puede conectar?',
    estado: 'devuelto',
    desde: '2026-09-14T16:05:00-03:00',
    intentos: [
      'Buscó en integraciones disponibles: no aparece.',
      'Lo tomó soporte y lo devolvió: necesita respuesta de desarrollo.',
    ],
    clienteEsperando: false,
  },
  {
    id: 'tr-05',
    conversacionId: 'conv-22',
    cliente: 'Paulina Ruiz',
    canal: 'whatsapp_baileys',
    agenteId: 'vex',
    motivo: 'pidio_humano',
    resumen: 'Quiere hablar con una persona antes de contratar. No dio motivo.',
    ultimoMensaje: 'Prefiero que me llame alguien del equipo.',
    estado: 'esperando',
    desde: '2026-09-13T12:00:00-03:00',
    intentos: ['Ofreció resolver las dudas por chat; insistió en la llamada.'],
    clienteEsperando: false,
  },
  {
    id: 'tr-06',
    conversacionId: 'conv-04',
    cliente: 'Hernán Cortés · Vitacura Motors',
    canal: 'whatsapp_oficial',
    agenteId: 'ariel',
    motivo: 'tres_intentos',
    resumen: 'No entendió la diferencia entre los planes después de tres explicaciones.',
    ultimoMensaje: 'Sigo sin cachar qué me conviene.',
    estado: 'cerrado',
    desde: '2026-09-11T09:20:00-03:00',
    tomadoPor: 'Ariel (humano)',
    intentos: [],
    clienteEsperando: false,
  },
]

/**
 * Métricas de ejemplo de los últimos 14 días.
 *
 * Las series suben hacia el final de la quincena, que es lo que pasa cuando
 * una campaña entra a mitad de período: sirve para ver si el gráfico aguanta
 * un salto y no solo una línea plana.
 */
export const METRICAS_EJEMPLO: MetricasSala = {
  resueltasSinHumano: 312,
  conversaciones: 358,
  traspasos: 46,
  leadsCaptados: 97,
  reuniones: 23,
  segundosPrimeraRespuesta: 38,
  frenosAplicados: 61,
  serieConversaciones: [18, 21, 16, 9, 7, 24, 27, 25, 22, 31, 29, 34, 41, 34],
  serieResueltas: [16, 19, 14, 8, 7, 21, 24, 21, 18, 27, 25, 30, 36, 30],
  motivosTraspaso: [
    { motivo: 'Pidió hablar con una persona', veces: 14 },
    { motivo: 'Precio fuera de lo autorizado', veces: 11 },
    { motivo: 'No sabe la respuesta', veces: 8 },
    { motivo: 'Reclamo', veces: 6 },
    { motivo: 'Dato sensible', veces: 4 },
    { motivo: 'No pudo en tres intentos', veces: 3 },
  ],
}

/**
 * Campañas de ejemplo.
 *
 * La primera está frenada a propósito: sale por el número propio, que es
 * exactamente lo que no se debe hacer con un envío masivo. Si la pantalla no
 * muestra ese freno, la pantalla está mal.
 */
export const CAMPANAS_EJEMPLO: Campana[] = [
  {
    id: 'cam-01',
    nombre: 'Reactivar leads fríos de julio',
    publico: '212 leads que cotizaron y no respondieron hace más de 60 días',
    estado: 'borrador',
    canal: 'WhatsApp · número propio',
    canalOficial: false,
    plantilla: { nombre: 'reactivacion_cotizacion_v2', aprobada: false },
    destinatarios: 212,
    conConsentimiento: 148,
    agenteId: 'ariel',
    cuando: 'sin fecha',
  },
  {
    id: 'cam-02',
    nombre: 'Aviso de mantención programada',
    publico: '86 clientes activos con integración conectada',
    estado: 'lista',
    canal: 'WhatsApp · API oficial',
    canalOficial: true,
    plantilla: { nombre: 'mantencion_programada', aprobada: true },
    destinatarios: 86,
    conConsentimiento: 86,
    agenteId: 'spike',
    cuando: 'sale el 18-sep a las 09:00',
  },
  {
    id: 'cam-03',
    nombre: 'Invitación al taller de octubre',
    publico: '134 contactos del sector salud',
    estado: 'esperando_plantilla',
    canal: 'WhatsApp · API oficial',
    canalOficial: true,
    plantilla: { nombre: 'invitacion_taller_oct', aprobada: false },
    destinatarios: 134,
    conConsentimiento: 121,
    agenteId: 'emili',
    cuando: 'en cuanto Meta apruebe',
  },
  {
    id: 'cam-04',
    nombre: 'Encuesta de satisfacción de agosto',
    publico: '158 clientes atendidos el mes pasado',
    estado: 'enviada',
    canal: 'WhatsApp · API oficial',
    canalOficial: true,
    plantilla: { nombre: 'encuesta_satisfaccion', aprobada: true },
    destinatarios: 158,
    conConsentimiento: 158,
    agenteId: 'vex',
    resultado: { entregados: 154, respondieron: 61, reuniones: 9 },
    cuando: 'salió el 2-sep',
  },
]
