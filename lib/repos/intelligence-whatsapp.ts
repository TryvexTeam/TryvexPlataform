import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AnalyticsAgente } from '@/lib/vex/agente'
import type { ResultadoQr } from '@/lib/wa/qr'
import type {
  AgenteSala,
  Canal,
  ConversacionCliente,
  EstadoCanal,
  Traspaso,
} from '@/lib/types/sala-agentes'
import type { MetricasSala } from '@/components/vex/intelligence/panel-metricas'
import {
  derivarConversaciones,
  derivarTraspasos,
  hace,
  type LeadWa,
  type MensajeWa,
} from '@/lib/vex/derivar-whatsapp'

/**
 * Todo lo que Intelligence sabe del trabajo por WhatsApp, leído de la base.
 *
 * Una sola lectura de `mensajes_wa` alimenta cuatro pantallas (Conversaciones,
 * Traspasos, Canales y parte de Métricas). Leer una vez y derivar evita que dos
 * pantallas consulten en momentos distintos y muestren números que no cuadran
 * entre sí.
 *
 * Lo que viene del VPS (estado del número, costo, leads captados, dudas) se
 * recibe ya resuelto: si el VPS no contesta, esas partes dicen "sin dato" y el
 * resto de la pantalla sigue funcionando con lo que hay en la base.
 */

/** Ventana de lectura. Lo anterior se consulta en la ficha del lead. */
const DIAS_VENTANA = 30

/** Tope de mensajes por carga. Hoy son ~330 en total; esto deja holgura años. */
const MAX_MENSAJES = 5000

const zona = 'America/Santiago'

export interface DatosWhatsapp {
  conversaciones: ConversacionCliente[]
  traspasos: Traspaso[]
  /** Mensajes de hoy (hora de Chile), para la tarjeta del canal. */
  mensajesHoy: number
  /** Id del agente que responde como bot, si se pudo identificar. */
  agenteBotId: string | null
}

export async function obtenerDatosWhatsapp(
  supabase: SupabaseClient,
  agentes: AgenteSala[],
): Promise<DatosWhatsapp> {
  const desde = new Date(Date.now() - DIAS_VENTANA * 86_400_000).toISOString()

  const { data: filas, error } = await supabase
    .from('mensajes_wa')
    .select('id, lead_id, direccion, texto, es_bot, enviado_por, created_at')
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(MAX_MENSAJES)

  if (error) throw new Error(`No se pudieron leer los mensajes de WhatsApp: ${error.message}`)
  const mensajes = (filas ?? []) as MensajeWa[]

  // Solo los leads que aparecen en la ventana: no hace falta traer la cartera.
  const ids = [...new Set(mensajes.map((m) => m.lead_id))]
  const leads = new Map<string, LeadWa>()
  if (ids.length > 0) {
    const { data: filasLeads, error: errorLeads } = await supabase
      .from('fact_leads')
      .select(
        'id, nombre_negocio, nombre_contacto, telefono, nicho, localidad, estado, wa_leido_hasta, web_capacidades',
      )
      .in('id', ids)
    if (errorLeads) throw new Error(`No se pudieron leer los leads: ${errorLeads.message}`)
    for (const l of (filasLeads ?? []) as LeadWa[]) leads.set(l.id, l)
  }

  const idPorNombre = new Map(agentes.map((a) => [a.nombre.toLowerCase(), a.id]))
  const ahora = Date.now()

  const hoy = new Date(ahora).toLocaleDateString('en-CA', { timeZone: zona })
  const mensajesHoy = mensajes.filter(
    (m) => new Date(m.created_at).toLocaleDateString('en-CA', { timeZone: zona }) === hoy,
  ).length

  const nombreBot = mensajes.find((m) => m.direccion === 'out' && m.es_bot)?.enviado_por
  const agenteBotId = (nombreBot && idPorNombre.get(nombreBot.toLowerCase())) || null

  return {
    conversaciones: derivarConversaciones(mensajes, leads, idPorNombre, ahora),
    traspasos: derivarTraspasos(mensajes, leads, idPorNombre, ahora),
    mensajesHoy,
    agenteBotId,
  }
}

/** Lo que devuelve la función `intelligence_metricas` de la base. */
interface MetricasBase {
  conversaciones: number
  atendidasPorBot: number
  resueltasSinHumano: number
  traspasos: number
  sinRespuesta: number
  prospeccionSinRespuesta: number
  segundosPrimeraRespuesta: number | null
  serieConversaciones: number[]
  serieResueltas: number[]
}

/**
 * Las métricas, con cada número de una fuente real o marcado como no medido.
 *
 *  · Conversaciones, resueltas, traspasos, tiempos → `intelligence_metricas`
 *  · Leads captados → el VPS (herramienta `guardarLead` del agente)
 *  · Reuniones → `eventos.agente_id` (lo marca /api/agentes/eventos)
 *  · Frenos → nadie los registra todavía: `null`, que se muestra "sin medir"
 */
export async function obtenerMetricas(
  supabase: SupabaseClient,
  dias: number,
  analytics: AnalyticsAgente | null,
  traspasos: Traspaso[],
): Promise<MetricasSala> {
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString()

  const [rpc, reuniones] = await Promise.all([
    supabase.rpc('intelligence_metricas', { p_dias: dias }),
    supabase
      .from('eventos')
      .select('id', { count: 'exact', head: true })
      .not('agente_id', 'is', null)
      .gte('created_at', desde),
  ])

  if (rpc.error) throw new Error(`No se pudieron calcular las métricas: ${rpc.error.message}`)
  const m = rpc.data as MetricasBase

  // Los leads salen de los días del VPS dentro de la ventana, no de su total:
  // la analítica se pide una sola vez con 31 días (la usa también Costos), y
  // sumar su total contaría 31 días donde la tarjeta dice 14.
  const diasVps = (analytics?.days ?? []) as Array<{ day?: string; leads?: number }>
  const corte = new Date(desde).toLocaleDateString('en-CA', { timeZone: zona })
  const leads =
    diasVps.length > 0
      ? diasVps
          .filter((d) => typeof d.day === 'string' && d.day >= corte)
          .reduce((t, d) => t + (typeof d.leads === 'number' ? d.leads : 0), 0)
      : null

  // Los motivos salen de los mismos traspasos que ve la pantalla de Traspasos:
  // así las dos pantallas no pueden contradecirse.
  // Misma ventana que el resto de la métrica: sin este filtro el gráfico
  // contaría 30 días mientras el número de al lado cuenta 14.
  const conteo = new Map<string, number>()
  for (const t of traspasos.filter((x) => x.desde >= desde)) {
    const texto = t.motivo === 'sin_respuesta' ? 'Nadie le respondió' : 'Una persona tomó la conversación'
    conteo.set(texto, (conteo.get(texto) ?? 0) + 1)
  }

  return {
    conversaciones: m.conversaciones,
    resueltasSinHumano: m.resueltasSinHumano,
    traspasos: m.traspasos,
    atendidasPorBot: m.atendidasPorBot,
    sinRespuesta: m.sinRespuesta,
    prospeccionSinRespuesta: m.prospeccionSinRespuesta,
    leadsCaptados: leads,
    reuniones: reuniones.error ? null : (reuniones.count ?? 0),
    segundosPrimeraRespuesta: m.segundosPrimeraRespuesta,
    frenosAplicados: null,
    serieConversaciones: m.serieConversaciones ?? [],
    serieResueltas: m.serieResueltas ?? [],
    motivosTraspaso: [...conteo].map(([motivo, veces]) => ({ motivo, veces })),
  }
}

/**
 * El número de WhatsApp como canal, con su estado real.
 *
 * Solo existe este canal: no hay API oficial, ni web, ni Instagram conectados.
 * Antes la pantalla mostraba seis canales de ejemplo; ahora muestra uno, que es
 * la verdad y además la mejor alerta posible: todo el negocio entra por un solo
 * número que se puede bloquear.
 */
export function construirCanales(
  qr: ResultadoQr,
  mensajesHoy: number,
  agenteBotId: string | null,
  sinRespuesta: number,
): Canal[] {
  const estados: Record<ResultadoQr['estado'], EstadoCanal> = {
    conectado: 'conectado',
    qr_listo: 'esperando_qr',
    esperando_qr: 'esperando_qr',
    sin_latido: 'sin_latido',
    posible_baneo: 'bloqueado',
    sin_respuesta: 'apagado',
    token_invalido: 'apagado',
    no_configurado: 'apagado',
  }
  const estado = estados[qr.estado]

  const aviso: Canal['aviso'] =
    qr.estado === 'posible_baneo'
      ? {
          texto: 'WhatsApp puede haber bloqueado el número. No lo vuelva a vincular sin revisar.',
          cuando: 'ahora',
          severidad: 'critico',
        }
      : estado !== 'conectado'
        ? {
            texto:
              qr.estado === 'sin_latido'
                ? `El agente dejó de dar señales${qr.sinLatidoHace ? ` hace ${Math.round(qr.sinLatidoHace / 60)} min` : ''}: nadie está respondiendo.`
                : qr.estado === 'sin_respuesta'
                  ? 'El VPS no responde: el número no está atendiendo a nadie.'
                  : qr.estado === 'token_invalido'
                    ? 'El CRM y el agente no comparten la misma credencial.'
                    : qr.estado === 'no_configurado'
                      ? 'Faltan VEX_AGENT_URL y VEX_AGENT_TOKEN en el CRM.'
                      : 'El número está desvinculado: hay que escanear el QR.',
            cuando: 'ahora',
            severidad: 'critico',
          }
        : sinRespuesta > 0
          ? {
              texto: `${sinRespuesta} ${sinRespuesta === 1 ? 'cliente escribió y nadie le contestó' : 'clientes escribieron y nadie les contestó'}. Revise Traspasos.`,
              cuando: 'últimas 2 semanas',
              severidad: 'aviso',
            }
          : undefined

  return [
    {
      id: 'whatsapp-numero-propio',
      tipo: 'whatsapp_baileys',
      etiqueta: qr.telefono ? `+${qr.telefono.replace(/^\+/, '')}` : 'Número comercial',
      agenteId: agenteBotId ?? '',
      estado,
      desde: estado === 'conectado' ? 'en línea' : 'sin conexión',
      riesgo: 'alto',
      nota:
        'Número propio conectado por WhatsApp Web. No cuesta nada por mensaje, pero si WhatsApp lo bloquea se pierde para siempre: por aquí se atiende a quien escribe, nunca se sale a buscar.',
      mensajesHoy,
      aviso,
    },
  ]
}

/** Una duda que los clientes repiten, y de dónde salió. */
export interface Insight {
  texto: string
  veces: number
  /** Un mensaje real que lo pregunta. Vale más que el resumen de la IA. */
  ejemplo?: string
  fuente: 'clientes' | 'equipo'
}

/**
 * Lo que la gente pregunta y no está resuelto.
 *
 * Dos fuentes reales: las dudas frecuentes que el VPS clasifica con IA a partir
 * de los mensajes de los clientes, y las dudas que el propio equipo le encoló a
 * los agentes. Juntas dicen qué falta en la base de conocimiento.
 */
export function construirInsights(
  analytics: AnalyticsAgente | null,
  dudasDelEquipo: Array<{ titulo: string }>,
): Insight[] {
  const deClientes = (analytics?.dudas ?? [])
    .filter((d) => typeof d.tema === 'string' && typeof d.count === 'number')
    .map((d) => ({
      texto: d.tema,
      veces: d.count,
      ejemplo: d.ejemplo,
      fuente: 'clientes' as const,
    }))

  const conteo = new Map<string, number>()
  for (const d of dudasDelEquipo) conteo.set(d.titulo, (conteo.get(d.titulo) ?? 0) + 1)
  const delEquipo = [...conteo].map(([texto, veces]) => ({ texto, veces, fuente: 'equipo' as const }))

  return [...deClientes, ...delEquipo].sort((a, b) => b.veces - a.veces)
}

export { hace }
