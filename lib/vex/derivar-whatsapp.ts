import type {
  ConversacionCliente,
  EntradaHilo,
  Traspaso,
} from '@/lib/types/sala-agentes'

/**
 * Conversaciones y traspasos, DERIVADOS de los mensajes reales.
 *
 * No hay tabla de "conversaciones de clientes" ni de "traspasos", y no hace
 * falta: `mensajes_wa` guarda cada mensaje con su dirección, si lo escribió el
 * bot, y quién del equipo lo mandó. De ahí sale todo, con las mismas
 * definiciones que usa `intelligence_metricas` en la base — si divergieran, la
 * pantalla de Métricas y la de Traspasos contarían cosas distintas.
 *
 * Funciones puras a propósito: se prueban con datos inventados en los tests
 * (`derivar-whatsapp.test.ts`) sin tocar la base.
 *
 * Las definiciones, medidas contra los datos del 22-sep-2026:
 *  · Una conversación existe si el CLIENTE escribió. Lo que manda el equipo y
 *    nadie contesta es prospección: 56 de 65 hilos de esa quincena eran eso.
 *  · Traspaso = una persona escribió DESPUÉS de que el bot ya había respondido.
 *  · Sin respuesta = el último mensaje es del cliente y nadie le contestó.
 */

export interface MensajeWa {
  id: string
  lead_id: string
  direccion: 'in' | 'out'
  texto: string | null
  es_bot: boolean
  enviado_por: string | null
  created_at: string
}

export interface LeadWa {
  id: string
  nombre_negocio: string | null
  nombre_contacto: string | null
  telefono: string | null
  nicho: string | null
  localidad: string | null
  estado: string | null
  wa_leido_hasta: string | null
  web_capacidades: { capacidades?: unknown } | null
}

/** Cómo se llama cada agente, para traducir `enviado_por` a su id. */
export type IdPorNombre = Map<string, string>

/** Cuántas entradas del hilo se muestran. El resto se abre en la ficha del lead. */
const MAX_HILO = 40

/** Pasado esto sin movimiento, un traspaso ya atendido se da por cerrado. */
const DIAS_PARA_CERRAR = 7

/** Cuántas respuestas del bot se muestran como "ya se intentó". */
const MAX_INTENTOS = 2

const zona = 'America/Santiago'

function hora(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', {
    timeZone: zona,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** "hace 3 min", "hace 2 d". `ahora` se recibe para que el resultado sea reproducible. */
export function hace(iso: string, ahora: number): string {
  const minutos = Math.max(0, Math.round((ahora - new Date(iso).getTime()) / 60000))
  if (minutos < 1) return 'recién'
  if (minutos < 60) return `hace ${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `hace ${horas} h`
  return `hace ${Math.floor(horas / 24)} d`
}

function recortar(texto: string | null, largo: number): string {
  const limpio = (texto ?? '').replace(/\s+/g, ' ').trim()
  if (!limpio) return '(mensaje sin texto: imagen, audio o adjunto)'
  return limpio.length > largo ? `${limpio.slice(0, largo - 1)}…` : limpio
}

/**
 * La ciudad, a partir de lo que haya en `localidad`.
 *
 * A veces es solo la comuna ("Ñuñoa") y a veces la dirección completa que
 * devuelve Google ("Moneda 782, 8320328 Santiago, Región Metropolitana, Chile").
 * En el segundo caso la ciudad es el tercer tramo desde el final, sin el
 * código postal.
 */
export function ciudad(localidad: string | null): string | null {
  if (!localidad) return null
  const tramos = localidad.split(',').map((t) => t.trim()).filter(Boolean)
  if (tramos.length < 3) return localidad.trim()
  return tramos[tramos.length - 3].replace(/^\d+\s*/, '').trim() || localidad.trim()
}

function capacidades(lead: LeadWa | undefined): string[] {
  const valor = lead?.web_capacidades?.capacidades
  return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === 'string') : []
}

/** Agrupa los mensajes por lead, cada grupo ordenado del más viejo al más nuevo. */
export function agruparPorLead(mensajes: MensajeWa[]): Map<string, MensajeWa[]> {
  const grupos = new Map<string, MensajeWa[]>()
  for (const m of mensajes) {
    const grupo = grupos.get(m.lead_id)
    if (grupo) grupo.push(m)
    else grupos.set(m.lead_id, [m])
  }
  for (const grupo of grupos.values()) {
    grupo.sort((a, b) => a.created_at.localeCompare(b.created_at))
  }
  return grupos
}

/** Lo que se sabe de un hilo, calculado una sola vez y compartido por las dos vistas. */
export interface AnalisisHilo {
  clienteEscribio: boolean
  primerBot: MensajeWa | undefined
  /** Personas que escribieron DESPUÉS del bot. Vacío = no hubo traspaso. */
  humanosTrasBot: MensajeWa[]
  ultimo: MensajeWa
  /** El último mensaje es del cliente y nadie le contestó. */
  sinRespuesta: boolean
  /** Nombre del agente que respondió como bot en este hilo. */
  nombreBot: string | null
}

export function analizarHilo(hilo: MensajeWa[]): AnalisisHilo {
  const primerIn = hilo.find((m) => m.direccion === 'in')
  const primerBot = hilo.find(
    (m) => m.direccion === 'out' && m.es_bot && (!primerIn || m.created_at > primerIn.created_at),
  )
  const humanosTrasBot = primerBot
    ? hilo.filter((m) => m.direccion === 'out' && !m.es_bot && m.created_at > primerBot.created_at)
    : []
  const ultimo = hilo[hilo.length - 1]

  return {
    clienteEscribio: Boolean(primerIn),
    primerBot,
    humanosTrasBot,
    ultimo,
    sinRespuesta: ultimo.direccion === 'in',
    nombreBot: hilo.find((m) => m.direccion === 'out' && m.es_bot)?.enviado_por ?? null,
  }
}

function autor(m: MensajeWa, lead: LeadWa | undefined): string {
  if (m.direccion === 'in') return lead?.nombre_contacto || lead?.nombre_negocio || 'Cliente'
  return m.enviado_por || (m.es_bot ? 'Agente' : 'Equipo')
}

/**
 * Las conversaciones con clientes: solo los hilos donde el cliente habló.
 *
 * El modo es HUMANO cuando una persona tomó el control después del bot, que es
 * exactamente lo que el agente del VPS marca como `HUMAN`. Se deriva en vez de
 * preguntarle al VPS porque así no depende de que el VPS esté en línea para
 * mostrar el historial.
 */
export function derivarConversaciones(
  mensajes: MensajeWa[],
  leads: Map<string, LeadWa>,
  idPorNombre: IdPorNombre,
  ahora: number,
): ConversacionCliente[] {
  const resultado: Array<{ conversacion: ConversacionCliente; ultimo: string }> = []

  for (const [leadId, hilo] of agruparPorLead(mensajes)) {
    const a = analizarHilo(hilo)
    if (!a.clienteEscribio) continue

    const lead = leads.get(leadId)
    const leidoHasta = lead?.wa_leido_hasta ?? null

    const entradas: EntradaHilo[] = hilo.slice(-MAX_HILO).map((m) => ({
      clase: 'mensaje',
      de: m.direccion === 'in' ? 'cliente' : m.es_bot ? 'agente' : 'persona',
      autor: autor(m, lead),
      hora: hora(m.created_at),
      texto: m.texto?.trim() || '(mensaje sin texto: imagen, audio o adjunto)',
    }))

    const conversacion: ConversacionCliente = {
      id: leadId,
      cliente: lead?.nombre_contacto || lead?.nombre_negocio || 'Sin nombre',
      telefono: lead?.telefono ?? '',
      canal: 'whatsapp',
      agenteId: (a.nombreBot && idPorNombre.get(a.nombreBot.toLowerCase())) || '',
      modo: a.humanosTrasBot.length > 0 ? 'HUMANO' : 'AI',
      ultimoMensaje: recortar(a.ultimo.texto, 120),
      hace: hace(a.ultimo.created_at, ahora),
      // "Sin leer" usa la marca de lectura real del lead, no una suposición:
      // los mensajes del cliente posteriores a la última vez que alguien abrió
      // el hilo en el CRM.
      sinLeer: hilo.filter(
        (m) => m.direccion === 'in' && (!leidoHasta || m.created_at > leidoHasta),
      ).length,
      hilo: entradas,
      ficha: {
        negocio: lead?.nombre_negocio ?? 'Sin nombre',
        rubro: lead?.nicho ?? 'sin rubro',
        comuna: lead?.localidad ?? 'sin comuna',
        estado: lead?.estado ?? 'sin estado',
        capacidadesWeb: capacidades(lead),
      },
    }
    resultado.push({ conversacion, ultimo: a.ultimo.created_at })
  }

  // Lo más reciente primero: es lo que se mira al abrir la pantalla. La fecha
  // del último mensaje ya se conoce por hilo; ordenar por ella es lineal.
  return resultado
    .sort((x, y) => y.ultimo.localeCompare(x.ultimo))
    .map((r) => r.conversacion)
}

/**
 * Los traspasos: lo que necesita a una persona.
 *
 * Dos casos, los dos medibles sin que nadie los anote:
 *  · `sin_respuesta` — el cliente escribió y nadie le contestó. Es lo más grave:
 *    del otro lado hay alguien creyendo que lo ignoran. Fue lo que pasó el
 *    18-sep, con el número 14 horas sin salida a internet.
 *  · `tomado_por_humano` — una persona tomó el control de algo que atendía el
 *    bot.
 *
 * Los motivos finos (reclamo, precio no autorizado, dato sensible…) solo los
 * conoce el agente en el momento de soltar; mientras no los reporte, no se
 * adivinan leyendo el texto.
 */
export function derivarTraspasos(
  mensajes: MensajeWa[],
  leads: Map<string, LeadWa>,
  idPorNombre: IdPorNombre,
  ahora: number,
): Traspaso[] {
  const resultado: Traspaso[] = []

  for (const [leadId, hilo] of agruparPorLead(mensajes)) {
    const a = analizarHilo(hilo)
    if (!a.clienteEscribio) continue

    const huboTraspaso = a.humanosTrasBot.length > 0
    if (!a.sinRespuesta && !huboTraspaso) continue

    const lead = leads.get(leadId)
    const ultimoIn = [...hilo].reverse().find((m) => m.direccion === 'in')
    const ultimoHumano = a.humanosTrasBot[a.humanosTrasBot.length - 1]

    // Desde cuándo espera: si está sin respuesta, desde el primer mensaje del
    // cliente que quedó sin contestar; si no, desde que la persona entró.
    let desde = a.ultimo.created_at
    if (a.sinRespuesta) {
      const ultimoOut = [...hilo].reverse().find((m) => m.direccion === 'out')
      const pendiente = hilo.find(
        (m) => m.direccion === 'in' && (!ultimoOut || m.created_at > ultimoOut.created_at),
      )
      desde = pendiente?.created_at ?? a.ultimo.created_at
    } else if (a.humanosTrasBot[0]) {
      desde = a.humanosTrasBot[0].created_at
    }

    const diasQuieto = (ahora - new Date(a.ultimo.created_at).getTime()) / 86_400_000
    const estado: Traspaso['estado'] = a.sinRespuesta
      ? 'esperando'
      : diasQuieto > DIAS_PARA_CERRAR
        ? 'cerrado'
        : 'tomado'

    // Lo que el bot ya dijo antes de que entrara una persona: sirve para no
    // repetírselo al cliente.
    const corte = ultimoHumano?.created_at ?? a.ultimo.created_at
    const intentos = hilo
      .filter((m) => m.direccion === 'out' && m.es_bot && m.created_at <= corte)
      .slice(-MAX_INTENTOS)
      .map((m) => `Respondió: “${recortar(m.texto, 140)}”`)

    const negocio = lead?.nombre_negocio ?? 'Sin nombre'
    // El negocio ya va en el título de la tarjeta: repetirlo en el resumen es
    // ruido. La localidad a veces es una dirección completa; se deja solo la
    // parte que sirve para ubicarse.
    const lugar = ciudad(lead?.localidad ?? null)
    const partes = [lead?.nicho, lugar].filter(Boolean)
    const contexto = partes.length > 0 ? `${partes.join(' · ')}. ` : ''

    resultado.push({
      id: `${leadId}-${a.sinRespuesta ? 'sin_respuesta' : 'tomado'}`,
      conversacionId: leadId,
      cliente: lead?.nombre_contacto ? `${lead.nombre_contacto} · ${negocio}` : negocio,
      canal: 'whatsapp_baileys',
      agenteId: (a.nombreBot && idPorNombre.get(a.nombreBot.toLowerCase())) || '',
      motivo: a.sinRespuesta ? 'sin_respuesta' : 'tomado_por_humano',
      resumen: a.sinRespuesta
        ? `${contexto}Escribió y nadie le contestó.`
        : `${contexto}${ultimoHumano?.enviado_por ?? 'Alguien del equipo'} tomó la conversación después del bot.`,
      ultimoMensaje: recortar(ultimoIn?.texto ?? null, 220),
      estado,
      desde,
      tomadoPor: ultimoHumano?.enviado_por ?? undefined,
      intentos,
      clienteEsperando: a.sinRespuesta,
    })
  }

  return resultado
}
