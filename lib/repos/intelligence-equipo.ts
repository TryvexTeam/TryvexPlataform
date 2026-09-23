import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AnalyticsAgente } from '@/lib/vex/agente'
import type { AgenteSala, EntradaHilo, Herramienta, Rutina } from '@/lib/types/sala-agentes'
import type { CostoAgente } from '@/components/vex/intelligence/panel-costos'
import type { DocumentoConocimiento } from '@/components/vex/intelligence/panel-conocimiento'
import type { Campana } from '@/components/vex/intelligence/panel-campanas'
import { hace } from '@/lib/vex/derivar-whatsapp'

/**
 * Lo que Intelligence sabe del trabajo INTERNO de los agentes: cuánto gastan,
 * qué saben, qué hacen solos, qué se les pidió, y qué proponen cambiar.
 *
 * Cada función lee una tabla real. Cuando una tabla está vacía —porque el
 * agente todavía no reporta— la pantalla lo dice y explica cómo se llena. Nunca
 * se rellena con ejemplos: esa fue la razón de rehacer esta sección.
 */

const zona = 'America/Santiago'
const DIA_MS = 86_400_000

function diaChile(fecha: Date | string | number): string {
  return new Date(fecha).toLocaleDateString('en-CA', { timeZone: zona })
}

function horaChile(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', {
    timeZone: zona,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ─── Tipo de cambio ─────────────────────────────────────────────────────

export interface TasaCLP {
  valor: number
  fecha: string
}

/**
 * Dólar observado del Banco Central, vía mindicador.cl.
 *
 * Se cachea medio día: el valor cambia una vez por día hábil y no tiene sentido
 * pedirlo en cada carga. Si la fuente no responde, se usa `USD_CLP` del entorno
 * si existe; y si tampoco, `null`. Lo que NUNCA se hace es inventar un valor:
 * un costo en pesos con una tasa supuesta es un número falso con cara de exacto.
 */
export async function obtenerTasaCLP(): Promise<TasaCLP | null> {
  try {
    const res = await fetch('https://mindicador.cl/api/dolar', {
      next: { revalidate: 43_200 },
      signal: AbortSignal.timeout(5_000),
    })
    if (res.ok) {
      const cuerpo = (await res.json()) as { serie?: Array<{ fecha: string; valor: number }> }
      const ultimo = cuerpo.serie?.[0]
      if (ultimo && Number.isFinite(ultimo.valor) && ultimo.valor > 0) {
        return {
          valor: ultimo.valor,
          fecha: new Date(ultimo.fecha).toLocaleDateString('es-CL', { timeZone: zona }),
        }
      }
    }
  } catch {
    // Se cae al respaldo de abajo.
  }

  const respaldo = Number(process.env.USD_CLP)
  return Number.isFinite(respaldo) && respaldo > 0
    ? { valor: respaldo, fecha: 'configurado en USD_CLP' }
    : null
}

// ─── Costos ─────────────────────────────────────────────────────────────

interface FilaConsumo {
  agente_id: string
  encargo_id: string | null
  tokens_entrada: number
  tokens_salida: number
  costo_usd: number | string
  created_at: string
}

/**
 * El gasto de cada agente, en pesos.
 *
 * Dos fuentes que NO se solapan: lo que reportan los agentes en
 * `agente_consumo`, y lo que registra el VPS en su tabla `usage` por el bot de
 * WhatsApp. El VPS no escribe en `agente_consumo`, así que sumarlas no duplica.
 */
export async function obtenerCostos(
  supabase: SupabaseClient,
  agentes: AgenteSala[],
  analytics: AnalyticsAgente | null,
  agenteBotId: string | null,
  tasa: TasaCLP | null,
): Promise<{ costos: CostoAgente[]; sinReporte: string[]; aviso?: string }> {
  if (!tasa) {
    return {
      costos: [],
      sinReporte: [],
      aviso:
        'No se pudo obtener el dólar observado y no hay USD_CLP configurado: sin tipo de cambio no se muestran pesos inventados.',
    }
  }

  const ahora = Date.now()
  const hoy = diaChile(ahora)
  const inicioMes = `${hoy.slice(0, 7)}-01`
  const dias14 = Array.from({ length: 14 }, (_, i) => diaChile(ahora - (13 - i) * DIA_MS))
  // Cota de consulta holgada (un día antes del inicio de mes en UTC) y luego se
  // filtra por el día CHILENO de cada fila. Fijar un desfase (-03 o -04) sería
  // un error dos veces al año, cuando Chile cambia de horario.
  const desde = new Date(
    Math.min(new Date(`${inicioMes}T00:00:00Z`).getTime() - DIA_MS, ahora - 15 * DIA_MS),
  )

  const [consumo, encargos, historico] = await Promise.all([
    supabase
      .from('agente_consumo')
      .select('agente_id, encargo_id, tokens_entrada, tokens_salida, costo_usd, created_at')
      .gte('created_at', desde.toISOString())
      .limit(20_000),
    supabase
      .from('agente_encargos')
      .select('agente_id, created_at')
      .gte('created_at', desde.toISOString()),
    // Quién reportó alguna vez: para distinguir "gastó cero" de "no informa".
    supabase.from('agente_consumo').select('agente_id').limit(5_000),
  ])

  if (consumo.error) throw new Error(`No se pudo leer el consumo: ${consumo.error.message}`)

  const filas = (consumo.data ?? []) as FilaConsumo[]
  const reportaron = new Set(
    ((historico.data ?? []) as Array<{ agente_id: string }>).map((f) => f.agente_id),
  )

  type Acumulado = { hoy: number; mes: number; tokens: number; porDia: Map<string, number> }
  const acumulado = new Map<string, Acumulado>()
  const de = (id: string): Acumulado => {
    let a = acumulado.get(id)
    if (!a) {
      a = { hoy: 0, mes: 0, tokens: 0, porDia: new Map() }
      acumulado.set(id, a)
    }
    return a
  }

  for (const f of filas) {
    const dia = diaChile(f.created_at)
    const usd = Number(f.costo_usd) || 0
    const a = de(f.agente_id)
    a.porDia.set(dia, (a.porDia.get(dia) ?? 0) + usd)
    if (dia === hoy) a.hoy += usd
    if (dia >= inicioMes) {
      a.mes += usd
      a.tokens += f.tokens_entrada + f.tokens_salida
    }
  }

  // El bot de WhatsApp: su gasto viene del VPS, día por día.
  const diasVps = (analytics?.days ?? []) as Array<{ day?: string; costUsd?: number }>
  if (agenteBotId && diasVps.length > 0) {
    const a = de(agenteBotId)
    for (const d of diasVps) {
      if (!d.day || typeof d.costUsd !== 'number') continue
      a.porDia.set(d.day, (a.porDia.get(d.day) ?? 0) + d.costUsd)
      if (d.day === hoy) a.hoy += d.costUsd
      if (d.day >= inicioMes) a.mes += d.costUsd
    }
    const totales = analytics?.totals as { inTokens?: number; outTokens?: number } | undefined
    a.tokens += (totales?.inTokens ?? 0) + (totales?.outTokens ?? 0)
    reportaron.add(agenteBotId)
  }

  const encargosPorAgente = new Map<string, number>()
  for (const e of (encargos.data ?? []) as Array<{ agente_id: string; created_at: string }>) {
    if (diaChile(e.created_at) < inicioMes) continue
    encargosPorAgente.set(e.agente_id, (encargosPorAgente.get(e.agente_id) ?? 0) + 1)
  }

  const clp = (usd: number) => Math.round(usd * tasa.valor)

  const costos: CostoAgente[] = agentes
    .filter((a) => reportaron.has(a.id))
    .map((a) => {
      const acc = acumulado.get(a.id) ?? { hoy: 0, mes: 0, tokens: 0, porDia: new Map() }
      return {
        agenteId: a.id,
        nombre: a.nombre,
        color: a.color,
        gastoHoyCLP: clp(acc.hoy),
        gastoMesCLP: clp(acc.mes),
        encargosMes: encargosPorAgente.get(a.id) ?? 0,
        tokensMes: acc.tokens,
        serie: dias14.map((d) => clp(acc.porDia.get(d) ?? 0)),
      }
    })

  const sinReporte = agentes
    .filter((a) => a.estado !== 'sin_latido' && !reportaron.has(a.id))
    .map((a) => a.nombre)

  return { costos, sinReporte }
}

// ─── Conocimiento ───────────────────────────────────────────────────────

/**
 * Los documentos del Cerebro, con quién los usa.
 *
 * Las secciones se cuentan por encabezados del markdown. Las citas son las que
 * los agentes reportan en `agente_citas`: un documento con cero citas en 30
 * días se marca, porque nadie lo está usando.
 */
export async function obtenerDocumentos(
  supabase: SupabaseClient,
): Promise<DocumentoConocimiento[]> {
  const hace30 = new Date(Date.now() - 30 * DIA_MS).toISOString()

  const [docs, citas] = await Promise.all([
    supabase
      .from('cerebro_docs')
      .select('id, titulo, categoria, contenido_md, updated_at')
      .order('orden', { ascending: true })
      .limit(500),
    supabase
      .from('agente_citas')
      .select('documento_id, agente_id, created_at')
      .gte('created_at', hace30)
      .limit(20_000),
  ])

  if (docs.error) throw new Error(`No se pudo leer el Cerebro: ${docs.error.message}`)

  type Cita = { documento_id: string; agente_id: string; created_at: string }
  const porDoc = new Map<string, Cita[]>()
  for (const c of (citas.data ?? []) as Cita[]) {
    const lista = porDoc.get(c.documento_id)
    if (lista) lista.push(c)
    else porDoc.set(c.documento_id, [c])
  }

  type Doc = { id: string; titulo: string; categoria: string | null; contenido_md: string | null; updated_at: string }
  return ((docs.data ?? []) as Doc[]).map((d) => {
    const suyas = porDoc.get(d.id) ?? []
    const secciones = (d.contenido_md ?? '').split('\n').filter((l) => /^#{1,6}\s/.test(l)).length
    const primeraLinea = (d.contenido_md ?? '')
      .split('\n')
      .map((l) => l.replace(/^#+\s*/, '').trim())
      .find((l) => l.length > 0)

    return {
      id: d.id,
      titulo: d.titulo,
      origen: 'manual',
      resumen: d.categoria ? `${d.categoria} · ${primeraLinea ?? 'sin contenido'}` : (primeraLinea ?? 'Sin contenido todavía.'),
      fragmentos: Math.max(1, secciones),
      agentes: [...new Set(suyas.map((c) => c.agente_id))],
      citasMes: suyas.length,
      ultimaCita: suyas.reduce<string | null>((max, c) => (!max || c.created_at > max ? c.created_at : max), null),
      actualizado: d.updated_at,
    }
  })
}

// ─── Espacio del agente: rutinas, hilo, herramientas ────────────────────

/** Una rutina que no corre hace más de esto (y debería) se muestra atrasada. */
export async function obtenerRutinas(supabase: SupabaseClient): Promise<Rutina[]> {
  const { data, error } = await supabase
    .from('agente_rutinas')
    .select('id, agente_id, nombre, tipo, disparador, activa, ultima_at, ultimo_resultado, ultimo_detalle, proxima_at')
    .order('nombre')

  if (error) throw new Error(`No se pudieron leer las rutinas: ${error.message}`)

  const ahora = Date.now()
  type Fila = {
    id: string
    agente_id: string
    nombre: string
    tipo: 'reloj' | 'evento'
    disparador: string
    activa: boolean
    ultima_at: string | null
    ultimo_resultado: 'ok' | 'falla' | null
    ultimo_detalle: string | null
    proxima_at: string | null
  }

  return ((data ?? []) as Fila[]).map((r) => {
    // Una rutina de reloj cuya próxima corrida ya pasó hace más de una hora y
    // no reportó: se atrasó. Es el fallo silencioso que esta pantalla existe
    // para mostrar.
    const atrasada =
      r.activa && r.tipo === 'reloj' && r.proxima_at && new Date(r.proxima_at).getTime() < ahora - 3_600_000

    const ultima = r.ultima_at
      ? `${hace(r.ultima_at, ahora)} · ${r.ultimo_resultado === 'falla' ? 'falló' : 'ok'}`
      : 'todavía no corrió'

    return {
      id: r.id,
      agenteId: r.agente_id,
      titulo: r.nombre,
      descripcion: r.ultimo_detalle ?? r.disparador,
      disparo: r.tipo,
      cuando: r.proxima_at
        ? `${r.disparador} · próxima ${horaChile(r.proxima_at)}`
        : r.disparador,
      ultimaCorrida: atrasada ? `${ultima} · ATRASADA` : ultima,
      activa: r.activa,
    }
  })
}

/**
 * El hilo de cada agente: lo que el equipo le pidió y lo que respondió.
 *
 * Sale de la cola de encargos, incluidos los archivados: el hilo es historia,
 * y la historia no se oculta porque ya se resolvió.
 */
export async function obtenerHilos(
  supabase: SupabaseClient,
  agentes: AgenteSala[],
): Promise<Record<string, EntradaHilo[]>> {
  const { data, error } = await supabase
    .from('agente_encargos')
    .select(
      `agente_id, titulo, detalle, estado, respuesta, respondido_at, motivo_rechazo, aprobado_at, created_at,
       pedido:creado_por (nombre), aprobador:aprobado_por (nombre)`,
    )
    .order('created_at', { ascending: true })
    .limit(1_000)

  if (error) throw new Error(`No se pudo leer el historial de encargos: ${error.message}`)

  const nombreDe = new Map(agentes.map((a) => [a.id, a.nombre]))
  const nombre = (v: unknown): string | null => {
    if (!v) return null
    const x = Array.isArray(v) ? v[0] : v
    return (x as { nombre?: string } | undefined)?.nombre ?? null
  }

  type Fila = {
    agente_id: string
    titulo: string
    detalle: string | null
    estado: string
    respuesta: string | null
    respondido_at: string | null
    motivo_rechazo: string | null
    aprobado_at: string | null
    created_at: string
    pedido: unknown
    aprobador: unknown
  }

  const hilos: Record<string, EntradaHilo[]> = {}
  for (const f of (data ?? []) as Fila[]) {
    const hilo = (hilos[f.agente_id] ??= [])

    hilo.push({
      clase: 'mensaje',
      de: 'persona',
      autor: nombre(f.pedido) ?? 'Alguien del equipo',
      hora: horaChile(f.created_at),
      texto: f.detalle ? `${f.titulo}\n\n${f.detalle}` : f.titulo,
    })

    const aprobador = nombre(f.aprobador)
    if (f.estado === 'rechazado') {
      hilo.push({
        clase: 'pasos',
        pasos: [{ orden: 1, texto: `Rechazado: ${f.motivo_rechazo ?? 'sin motivo'}`, duracion: '', resultado: 'error' }],
      })
    } else if (aprobador) {
      hilo.push({
        clase: 'pasos',
        pasos: [
          {
            orden: 1,
            texto: `${aprobador} dio permiso para ejecutarlo`,
            duracion: f.aprobado_at ? horaChile(f.aprobado_at) : '',
            resultado: 'ok',
          },
        ],
      })
    } else if (f.estado === 'encolado') {
      hilo.push({
        clase: 'pasos',
        pasos: [{ orden: 1, texto: 'Esperando que alguien del equipo lo apruebe', duracion: '', resultado: 'aviso' }],
      })
    }

    if (f.respuesta) {
      hilo.push({
        clase: 'mensaje',
        de: 'agente',
        autor: nombreDe.get(f.agente_id) ?? 'Agente',
        hora: f.respondido_at ? horaChile(f.respondido_at) : '',
        texto: f.respuesta,
      })
    }
  }
  return hilos
}

/**
 * Las llaves que el CRM le da a un agente: las rutas reales de
 * `/api/agentes/*`. No es un inventario inventado — es la lista de puertas que
 * existen en este repositorio, y todas se abren con el mismo token.
 */
export function herramientasDelCRM(): Herramienta[] {
  return [
    { id: 'encargos', nombre: 'Cola de encargos', ruta: '/api/agentes/encargos', detalle: 'Lee lo que tiene aprobado y responde. Lo que espera permiso lo ve, pero no puede tocarlo.', concedida: true, exigeFirma: true },
    { id: 'mensajes', nombre: 'Canal del equipo', ruta: '/api/agentes/mensajes', detalle: 'Escribe en el hilo "Equipo agéntico". Nunca en los mensajes directos del equipo.', concedida: true, exigeFirma: false },
    { id: 'wa-mensaje', nombre: 'Registrar WhatsApp', ruta: '/api/agentes/wa-mensaje', detalle: 'Deja constancia en el CRM de cada mensaje de WhatsApp que entra o sale.', concedida: true, exigeFirma: false },
    { id: 'lead', nombre: 'Leads', ruta: '/api/agentes/lead', detalle: 'Crea o actualiza un lead a partir de una conversación.', concedida: true, exigeFirma: false },
    { id: 'eventos', nombre: 'Agendar', ruta: '/api/agentes/eventos', detalle: 'Agenda una reunión en el CRM y en Google Calendar, y avisa al cliente por correo.', concedida: true, exigeFirma: false },
    { id: 'consumo', nombre: 'Reportar gasto', ruta: '/api/agentes/consumo', detalle: 'Informa tokens y costo de cada llamada a un modelo.', concedida: true, exigeFirma: false },
    { id: 'citas', nombre: 'Conocimiento', ruta: '/api/agentes/citas', detalle: 'Lee el Cerebro y deja constancia de qué documento usó.', concedida: true, exigeFirma: false },
    { id: 'rutinas', nombre: 'Rutinas', ruta: '/api/agentes/rutinas', detalle: 'Declara sus rutinas y reporta cada corrida.', concedida: true, exigeFirma: false },
    { id: 'mejoras', nombre: 'Proponer mejoras', ruta: '/api/agentes/mejoras', detalle: 'Propone un cambio con su evidencia. Aplicarlo requiere que una persona lo apruebe.', concedida: true, exigeFirma: true },
  ]
}

// ─── Campañas ───────────────────────────────────────────────────────────

export async function obtenerCampanas(supabase: SupabaseClient): Promise<Campana[]> {
  const { data, error } = await supabase
    .from('campanas')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) throw new Error(`No se pudieron leer las campañas: ${error.message}`)

  type Fila = {
    id: string
    nombre: string
    publico: string
    estado: Campana['estado']
    canal: string
    canal_oficial: boolean
    plantilla_nombre: string | null
    plantilla_aprobada: boolean
    destinatarios: number
    con_consentimiento: number
    agente_id: string | null
    entregados: number | null
    respondieron: number | null
    reuniones: number | null
    programada_at: string | null
    enviada_at: string | null
  }

  return ((data ?? []) as Fila[]).map((c) => ({
    id: c.id,
    nombre: c.nombre,
    publico: c.publico,
    estado: c.estado,
    canal: c.canal,
    canalOficial: c.canal_oficial,
    plantilla: { nombre: c.plantilla_nombre ?? 'sin plantilla', aprobada: c.plantilla_aprobada },
    destinatarios: c.destinatarios,
    conConsentimiento: c.con_consentimiento,
    agenteId: c.agente_id ?? '',
    resultado:
      c.entregados !== null
        ? { entregados: c.entregados, respondieron: c.respondieron ?? 0, reuniones: c.reuniones ?? 0 }
        : undefined,
    cuando: c.enviada_at
      ? `salió el ${horaChile(c.enviada_at)}`
      : c.programada_at
        ? `sale el ${horaChile(c.programada_at)}`
        : 'sin fecha',
  }))
}

// ─── Mejoras ────────────────────────────────────────────────────────────

export interface Mejora {
  id: string
  agenteId: string | null
  titulo: string
  detalle: string | null
  evidencia: string | null
  estado: 'propuesta' | 'aprobada' | 'aplicada' | 'descartada'
  aprobadoPor: string | null
  motivoDescarte: string | null
  hace: string
}

export async function obtenerMejoras(supabase: SupabaseClient): Promise<Mejora[]> {
  const { data, error } = await supabase
    .from('mejoras')
    .select('id, agente_id, titulo, detalle, evidencia, estado, motivo_descarte, created_at, aprobador:aprobado_por (nombre)')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) throw new Error(`No se pudieron leer las mejoras: ${error.message}`)

  const ahora = Date.now()
  type Fila = {
    id: string
    agente_id: string | null
    titulo: string
    detalle: string | null
    evidencia: string | null
    estado: Mejora['estado']
    motivo_descarte: string | null
    created_at: string
    aprobador: unknown
  }

  return ((data ?? []) as Fila[]).map((m) => {
    const ap = Array.isArray(m.aprobador) ? m.aprobador[0] : m.aprobador
    return {
      id: m.id,
      agenteId: m.agente_id,
      titulo: m.titulo,
      detalle: m.detalle,
      evidencia: m.evidencia,
      estado: m.estado,
      aprobadoPor: (ap as { nombre?: string } | null)?.nombre ?? null,
      motivoDescarte: m.motivo_descarte,
      hace: hace(m.created_at, ahora),
    }
  })
}
