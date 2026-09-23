/**
 * Qué le ofrecemos a cada rubro, para que la propuesta del primer mensaje deje
 * de ser genérica.
 *
 * Sin esta guía el modelo elegía del catálogo "por rubro" y caía siempre en lo
 * mismo — "sitio web + reseñas + reservar hora" — incluso a una ferretería o a
 * una panadería, donde nadie reserva hora. Esta tabla dice, por rubro, cuál es
 * el dolor típico y qué servicio del catálogo real le calza.
 *
 * El `servicio` nombra SOLO servicios del catálogo publicado que ya está en
 * `draft.ts` (Automatizacion, Landing o sitio web, Sistema a medida,
 * Inteligencia aplicada). No se inventan servicios nuevos.
 *
 * Los textos van sin tildes porque se pegan dentro del prompt (ver `draft.ts`).
 */

export interface OfertaRubro {
  /** El problema del día a día que ese rubro suele tener. */
  dolor: string
  /** Qué servicio del catálogo le calza, dicho en resultado. */
  servicio: string
  /** Lo que NO se le puede ofrecer a ese rubro. */
  prohibido?: string
}

interface Entrada extends OfertaRubro {
  /** Raíces sin tildes: calzan con singular y plural ("barberia", "barberias"). */
  claves: string[]
}

const SIN_RESERVAS = "NO le ofrezcas reservar hora ni agenda: en este rubro nadie pide hora."

// El orden importa: gana la primera entrada que calce. Las más específicas van
// antes ("centro de estetica" antes que cualquier cosa genérica).
const TABLA: Entrada[] = [
  {
    claves: ["barber", "peluquer", "salon de belleza", "estetica", "manicur"],
    dolor: "las horas se piden por WhatsApp o por telefono y alguien tiene que contestar entre cliente y cliente, y fuera de horario nadie responde",
    servicio: "Automatizacion: que los clientes pidan y confirmen hora por WhatsApp a cualquier hora y la agenda se llene sola (2 a 4 semanas)",
  },
  {
    claves: ["restaur", "cafeter", "pizzer", "sushi", "comida"],
    dolor: "los pedidos y reservas llegan por varios lados y se toman a mano, y en hora punta se pierden mensajes",
    servicio: "Automatizacion: pedidos y reservas por WhatsApp que entran ordenados, sin que alguien los copie a mano (2 a 4 semanas)",
  },
  {
    claves: ["farmac"],
    dolor: "le preguntan todo el dia por WhatsApp si tiene un producto o a que hora abre, y alguien tiene que contestar lo mismo una y otra vez",
    servicio: "Automatizacion: respuestas automaticas por WhatsApp a lo repetitivo (horario, disponibilidad, como llegar) y el inventario sincronizado (2 a 4 semanas)",
    prohibido: "NADA de vender, despachar ni recomendar medicamentos en linea: lo regula el ISP.",
  },
  {
    claves: ["clinic", "dentist", "dental", "odontolog", "kinesiolog", "psicolog", "medic", "nutricion", "centro de salud"],
    dolor: "las horas se agendan a mano por telefono y WhatsApp, y los pacientes que no confirman dejan huecos en la agenda",
    servicio: "Automatizacion: agenda por WhatsApp con confirmacion y recordatorio automatico, para que no queden horas vacias (2 a 4 semanas)",
    prohibido: "NADA de diagnosticar, recetar ni orientar sobre salud por WhatsApp.",
  },
  {
    claves: ["veterinar"],
    dolor: "las horas y las vacunas se agendan a mano, y los recordatorios de control dependen de que alguien se acuerde",
    servicio: "Automatizacion: agenda por WhatsApp y recordatorios automaticos de vacunas y controles (2 a 4 semanas)",
    prohibido: "NADA de diagnosticar ni recomendar tratamientos por WhatsApp.",
  },
  {
    claves: ["optic"],
    dolor: "le preguntan por WhatsApp si tiene un modelo, cuanto sale un lente o si su receta esta lista, y alguien tiene que contestar cada vez",
    servicio: "Automatizacion: aviso automatico por WhatsApp cuando los lentes estan listos y respuestas a lo repetitivo, sin que nadie las escriba (2 a 4 semanas)",
    prohibido: "NADA de examen visual ni de indicar graduaciones por WhatsApp.",
  },
  {
    claves: ["ferreter", "materiales de construccion", "electricist", "gasfiter"],
    dolor: "le piden cotizaciones y stock por WhatsApp todo el dia, y armar cada cotizacion a mano le quita tiempo de meson",
    servicio: "Automatizacion: cotizaciones y consultas de stock por WhatsApp que se responden solas desde su inventario (2 a 4 semanas)",
    prohibido: SIN_RESERVAS,
  },
  {
    claves: ["panader", "pasteler", "reposter", "amasander"],
    dolor: "los encargos de tortas y pedidos grandes llegan por WhatsApp y se anotan a mano, y alguno se pierde",
    servicio: "Automatizacion: encargos por WhatsApp que quedan anotados con fecha y detalle, sin libreta (2 a 4 semanas)",
    prohibido: SIN_RESERVAS,
  },
  {
    claves: ["lavander", "tintorer"],
    dolor: "los clientes preguntan por WhatsApp si su ropa ya esta lista, y alguien tiene que ir a mirar y contestar",
    servicio: "Automatizacion: aviso automatico por WhatsApp cuando el pedido esta listo para retirar (2 a 4 semanas)",
    prohibido: SIN_RESERVAS,
  },
  {
    claves: ["taller", "mecanic", "automovil", "automotor", "vulcaniz", "desabolladur"],
    dolor: "el cliente llama o escribe para saber como va su auto, y los presupuestos se arman y se mandan a mano",
    servicio: "Automatizacion: presupuestos y avisos de avance por WhatsApp, y la agenda de ingresos ordenada (2 a 4 semanas)",
  },
  {
    claves: ["gimnasi", "crossfit", "pilates", "yoga"],
    dolor: "las consultas de planes y horarios llegan por WhatsApp todo el dia, y los cupos de clases se manejan a mano",
    servicio: "Automatizacion: respuestas automaticas de planes y reserva de cupos en clases por WhatsApp (2 a 4 semanas)",
  },
  {
    claves: ["abogad", "estudio juridico"],
    dolor: "las consultas iniciales llegan por WhatsApp y correo sin orden, y filtrar cuales son de su area le quita horas",
    servicio: "Inteligencia aplicada: ordenar y clasificar las consultas y documentos que llegan, para atender primero lo que corresponde (5 a 10 semanas)",
    prohibido: "NADA que suene a captar clientes con promesas de resultado en un juicio.",
  },
  {
    claves: ["contador", "contab", "tributar"],
    dolor: "persigue a sus clientes por los documentos del mes, y los recibe desordenados por WhatsApp y correo",
    servicio: "Inteligencia aplicada: que los documentos que mandan sus clientes lleguen clasificados y ordenados solos (5 a 10 semanas)",
    prohibido: SIN_RESERVAS,
  },
  {
    claves: ["florer", "floris"],
    dolor: "los pedidos para fechas especiales llegan todos juntos por WhatsApp y se anotan a mano",
    servicio: "Automatizacion: pedidos por WhatsApp con fecha, direccion y mensaje de la tarjeta anotados solos (2 a 4 semanas)",
    prohibido: SIN_RESERVAS,
  },
  {
    claves: ["joyer", "tienda de ropa", "boutique", "librer", "zapater"],
    dolor: "le preguntan por WhatsApp si tiene un producto o una talla, y contestar cada consulta le quita tiempo de atender",
    servicio: "Landing o sitio web: su catalogo a la vista para que el cliente vea que hay antes de escribir (1 a 2 semanas)",
    prohibido: SIN_RESERVAS,
  },
]

/** Minúsculas y sin tildes, para que "Óptica" y "opticas" calcen igual. */
function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
}

/** La oferta que le calza a ese rubro, o `null` si no está en la tabla. */
export function ofertaParaRubro(rubro: string | null): OfertaRubro | null {
  if (!rubro?.trim()) return null
  const r = normalizar(rubro)
  const e = TABLA.find((t) => t.claves.some((c) => r.includes(c)))
  if (!e) return null
  return e.prohibido
    ? { dolor: e.dolor, servicio: e.servicio, prohibido: e.prohibido }
    : { dolor: e.dolor, servicio: e.servicio }
}
