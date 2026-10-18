import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { TIPOS_QUE_CONTACTAN } from '@/lib/types/lead'
import { tablaEncargos } from '@/lib/repos/tabla-encargos'
import type {
  AsistenteDelIntegrante,
  DatosIntegrante,
  DiaActividad,
  MovimientoIntegrante,
  NumerosIntegrante,
  PerfilIntegrante,
  ProyectoDelIntegrante,
} from '@/lib/types/perfil-integrante'

type SB = SupabaseClient<Database>

/** El calendario cubre 53 semanas, como el de GitHub. */
const DIAS_CALENDARIO = 53 * 7

/** PostgREST corta en 1000 filas por respuesta: se pide por páginas hasta este tope. */
const PAGINA = 1000
const MAX_FILAS = 20_000

const ZONA = 'America/Santiago'

/** YYYY-MM-DD de un instante, en hora de Chile. */
export function diaChile(iso: string | Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(typeof iso === 'string' ? new Date(iso) : iso)
}

/** Los días del calendario, del más viejo a hoy, en hora de Chile. */
export function diasDelCalendario(hoy: Date, dias = DIAS_CALENDARIO): string[] {
  const fechas: string[] = []
  const base = new Date(`${diaChile(hoy)}T12:00:00Z`)
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(base)
    d.setUTCDate(base.getUTCDate() - i)
    fechas.push(d.toISOString().slice(0, 10))
  }
  return fechas
}

/**
 * Días seguidos con actividad. Si hoy todavía no hay nada, la racha no se corta:
 * se cuenta desde ayer (el día no ha terminado).
 */
export function calcularRacha(calendario: DiaActividad[]): number {
  let i = calendario.length - 1
  if (i >= 0 && calendario[i].total === 0) i--
  let racha = 0
  for (; i >= 0 && calendario[i].total > 0; i--) racha++
  return racha
}

type Pagina<T> = (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>

/** Trae todas las filas de una consulta, por páginas, hasta MAX_FILAS. */
async function todas<T>(pedir: Pagina<T>): Promise<T[]> {
  const filas: T[] = []
  for (let desde = 0; desde < MAX_FILAS; desde += PAGINA) {
    const { data, error } = await pedir(desde, desde + PAGINA - 1)
    if (error) throw new Error(error.message)
    filas.push(...(data ?? []))
    if (!data || data.length < PAGINA) break
  }
  return filas
}

/** Si una fuente falla, su número queda en `null` ("falta"), sin tumbar el perfil. */
async function oNull<T>(promesa: Promise<T>): Promise<T | null> {
  try {
    return await promesa
  } catch (e) {
    console.error('[perfil-integrante]', e instanceof Error ? e.message : e)
    return null
  }
}

function uno<T>(v: T | T[] | null): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

type Contacto = { lead_id: string; fecha: string }
type TareaHecha = { id: string; titulo: string; completada_at: string }
type ClienteGanado = { id: string; nombre: string; fecha: string }
type ProyectoFila = ProyectoDelIntegrante & { fecha: string }

export class PerfilIntegranteRepository {
  private sb: SB

  constructor(supabase: SupabaseClient) {
    this.sb = supabase as SB
  }

  async obtener(integranteId: string, hoy = new Date()): Promise<PerfilIntegrante | null> {
    const datos = await this.datos(integranteId)
    if (!datos) return null

    const fechas = diasDelCalendario(hoy)
    const desde = fechas[0]

    const [interacciones, mensajes, tareas, proyectos, horas, asistentes] = await Promise.all([
      oNull(this.interacciones(integranteId)),
      oNull(this.mensajes(integranteId)),
      oNull(this.tareasCompletadas(integranteId)),
      oNull(this.proyectos(integranteId)),
      oNull(this.horasPorDia(integranteId, desde)),
      oNull(this.asistentes(integranteId)),
    ])

    // Contactó = le escribió o lo llamó al menos una vez, por cualquier canal.
    const contactos = interacciones && mensajes ? [...interacciones, ...mensajes] : null
    const primerContacto = new Map<string, string>()
    for (const c of contactos ?? []) {
      const previo = primerContacto.get(c.lead_id)
      if (!previo || c.fecha < previo) primerContacto.set(c.lead_id, c.fecha)
    }
    const clientes = contactos ? await oNull(this.clientesGanados([...primerContacto.keys()])) : null

    const numeros: NumerosIntegrante = {
      horas: horas ? Math.round([...horas.values()].reduce((a, b) => a + b, 0)) : null,
      leadsContactados: contactos ? primerContacto.size : null,
      clientesGanados: clientes ? clientes.length : null,
      tareasCompletadas: tareas ? tareas.length : null,
      proyectos: proyectos ? proyectos.length : null,
    }

    const calendario = this.armarCalendario(fechas, {
      interacciones: interacciones ?? [],
      mensajes: mensajes ?? [],
      tareas: tareas ?? [],
      horas: horas ?? new Map(),
    })

    const recientes = await this.recientes(primerContacto, tareas ?? [], clientes ?? [], proyectos ?? [])

    return {
      datos,
      numeros,
      calendario,
      racha: calcularRacha(calendario),
      recientes,
      proyectos: (proyectos ?? []).map((p) => ({ id: p.id, nombre: p.nombre, estado: p.estado, esResponsable: p.esResponsable })),
      asistentes,
    }
  }

  private async datos(id: string): Promise<DatosIntegrante | null> {
    const { data, error } = await this.sb
      .from('dim_integrantes')
      .select('id, nombre, avatar_url, color, rol_principal, especialidad, bio, bio_corta, linkedin, portfolio, email, activo, created_at')
      .eq('id', id)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null
    return {
      id: data.id,
      nombre: data.nombre,
      avatarUrl: data.avatar_url,
      color: data.color,
      rol: data.rol_principal,
      especialidad: data.especialidad,
      bio: data.bio ?? data.bio_corta,
      linkedin: data.linkedin,
      portfolio: data.portfolio,
      email: data.email,
      activo: data.activo,
      desde: data.created_at,
    }
  }

  /** Llamadas, WhatsApp, Instagram, Meet y email registrados a mano en el lead. */
  private async interacciones(id: string): Promise<Contacto[]> {
    const filas = await todas<{ lead_id: string; created_at: string }>((a, b) =>
      this.sb
        .from('interacciones_lead')
        .select('lead_id, created_at')
        .eq('integrante_id', id)
        .in('tipo', [...TIPOS_QUE_CONTACTAN])
        .order('created_at')
        .range(a, b),
    )
    return filas.map((f) => ({ lead_id: f.lead_id, fecha: f.created_at }))
  }

  /** WhatsApp que mandó él (no el bot) y mensajes de Vex que aprobó y envió. */
  private async mensajes(id: string): Promise<Contacto[]> {
    const [wa, outreach] = await Promise.all([
      todas<{ lead_id: string | null; created_at: string }>((a, b) =>
        this.sb
          .from('mensajes_wa')
          .select('lead_id, created_at')
          .eq('integrante_id', id)
          .eq('direccion', 'out')
          .eq('es_bot', false)
          .order('created_at')
          .range(a, b),
      ),
      todas<{ lead_id: string; enviado_at: string | null }>((a, b) =>
        this.sb
          .from('outreach_messages')
          .select('lead_id, enviado_at')
          .eq('integrante_id', id)
          .not('enviado_at', 'is', null)
          .order('enviado_at')
          .range(a, b),
      ),
    ])
    return [
      ...wa.filter((f): f is { lead_id: string; created_at: string } => Boolean(f.lead_id))
        .map((f) => ({ lead_id: f.lead_id, fecha: f.created_at })),
      ...outreach.map((f) => ({ lead_id: f.lead_id, fecha: f.enviado_at as string })),
    ]
  }

  private async tareasCompletadas(id: string): Promise<TareaHecha[]> {
    type Fila = {
      tarea: { id: string; titulo: string; completada_at: string | null; eliminado_at: string | null }
        | { id: string; titulo: string; completada_at: string | null; eliminado_at: string | null }[]
        | null
    }
    const filas = await todas<Fila>((a, b) =>
      this.sb
        .from('tarea_responsables')
        .select('tarea:tareas (id, titulo, completada_at, eliminado_at)')
        .eq('integrante_id', id)
        .range(a, b),
    )
    return filas
      .map((f) => uno(f.tarea))
      .filter((t): t is NonNullable<typeof t> & { completada_at: string } =>
        Boolean(t && t.completada_at && !t.eliminado_at),
      )
      .map((t) => ({ id: t.id, titulo: t.titulo, completada_at: t.completada_at }))
  }

  /** Proyectos donde es parte del equipo o el responsable. */
  private async proyectos(id: string): Promise<ProyectoFila[]> {
    type P = { id: string; nombre: string; estado: string; created_at: string; responsable_id: string | null }
    const [miembro, responsable] = await Promise.all([
      this.sb
        .from('proyecto_integrantes')
        .select('created_at, proyecto:dim_proyectos (id, nombre, estado, created_at, responsable_id)')
        .eq('integrante_id', id),
      this.sb
        .from('dim_proyectos')
        .select('id, nombre, estado, created_at, responsable_id')
        .eq('responsable_id', id),
    ])
    if (miembro.error) throw new Error(miembro.error.message)
    if (responsable.error) throw new Error(responsable.error.message)

    const porId = new Map<string, ProyectoFila>()
    for (const p of (responsable.data ?? []) as P[]) {
      porId.set(p.id, { id: p.id, nombre: p.nombre, estado: p.estado, esResponsable: true, fecha: p.created_at })
    }
    type M = { created_at: string; proyecto: P | P[] | null }
    for (const fila of (miembro.data ?? []) as M[]) {
      const p = uno(fila.proyecto)
      if (!p || porId.has(p.id)) continue
      porId.set(p.id, { id: p.id, nombre: p.nombre, estado: p.estado, esResponsable: false, fecha: fila.created_at })
    }
    return [...porId.values()].sort((a, b) => b.fecha.localeCompare(a.fecha))
  }

  /** Horas de jornada por día (función de la migración 126: solo totales, no entradas ni salidas). */
  private async horasPorDia(id: string, desde: string): Promise<Map<string, number>> {
    const { data, error } = await (this.sb as unknown as SupabaseClient).rpc('horas_por_dia_integrante', {
      p_integrante: id,
      p_desde: desde,
    })
    if (error) throw new Error(error.message)
    return new Map(((data ?? []) as { fecha: string; horas: number | string }[]).map((f) => [f.fecha, Number(f.horas)]))
  }

  /** Ganado = un lead que contactó ya es cliente del sistema. */
  private async clientesGanados(leadIds: string[]): Promise<ClienteGanado[]> {
    const clientes: ClienteGanado[] = []
    // De a 100 ids: una lista larga en la URL la rechaza el servidor.
    for (let i = 0; i < leadIds.length; i += 100) {
      const { data, error } = await this.sb
        .from('dim_clientes')
        .select('id, nombre_negocio, nombre_contacto, created_at')
        .in('lead_id', leadIds.slice(i, i + 100))
      if (error) throw new Error(error.message)
      for (const c of data ?? []) {
        clientes.push({ id: c.id, nombre: c.nombre_negocio ?? c.nombre_contacto ?? 'Cliente', fecha: c.created_at })
      }
    }
    return clientes
  }

  /**
   * Los agentes que trabajan a su nombre. `dueno_id` (migración 124) manda; los
   * agentes viejos sin dueño se atribuyen a quien los dio de alta.
   */
  private async asistentes(id: string): Promise<AsistenteDelIntegrante[]> {
    const sb = this.sb as unknown as SupabaseClient
    const { data, error } = await sb
      .from('agentes')
      .select('id, nombre, descripcion, color, activo, ultimo_uso_at')
      .or(`dueno_id.eq.${id},and(dueno_id.is.null,creado_por.eq.${id})`)
      .order('nombre')
    if (error) throw new Error(error.message)
    type A = { id: string; nombre: string; descripcion: string | null; color: string | null; activo: boolean; ultimo_uso_at: string | null }
    const agentes = (data ?? []) as A[]
    if (agentes.length === 0) return []

    const { data: encargos, error: errEnc } = await tablaEncargos(this.sb as SupabaseClient<never>)
      .select('agente_id, estado')
      .in('agente_id', agentes.map((a) => a.id))
    if (errEnc) throw new Error(errEnc.message)
    const filas = (encargos ?? []) as { agente_id: string; estado: string }[]

    return agentes.map((a) => ({
      id: a.id,
      nombre: a.nombre,
      descripcion: a.descripcion,
      color: a.color,
      activo: a.activo,
      ultimoUsoAt: a.ultimo_uso_at,
      encargosRespondidos: filas.filter((e) => e.agente_id === a.id && e.estado === 'respondido').length,
      encargosAbiertos: filas.filter(
        (e) => e.agente_id === a.id && ['encolado', 'aprobado', 'en_curso'].includes(e.estado),
      ).length,
    }))
  }

  private armarCalendario(
    fechas: string[],
    fuentes: { interacciones: Contacto[]; mensajes: Contacto[]; tareas: TareaHecha[]; horas: Map<string, number> },
  ): DiaActividad[] {
    const dias = new Map<string, DiaActividad>(
      fechas.map((fecha) => [fecha, { fecha, total: 0, leads: 0, tareas: 0, mensajes: 0, horas: 0 }]),
    )
    const sumar = (iso: string, campo: 'leads' | 'tareas' | 'mensajes') => {
      const dia = dias.get(diaChile(iso))
      if (dia) dia[campo] += 1
    }
    fuentes.interacciones.forEach((c) => sumar(c.fecha, 'leads'))
    fuentes.mensajes.forEach((c) => sumar(c.fecha, 'mensajes'))
    fuentes.tareas.forEach((t) => sumar(t.completada_at, 'tareas'))
    for (const [fecha, horas] of fuentes.horas) {
      const dia = dias.get(fecha)
      if (dia) dia.horas = Math.round(horas * 10) / 10
    }
    // Una hora de jornada pesa como una acción: así un día de trabajo sin leads
    // (diseño, reuniones) también se pinta.
    for (const dia of dias.values()) {
      dia.total = dia.leads + dia.tareas + dia.mensajes + Math.round(dia.horas)
    }
    return fechas.map((f) => dias.get(f) as DiaActividad)
  }

  private async recientes(
    primerContacto: Map<string, string>,
    tareas: TareaHecha[],
    clientes: ClienteGanado[],
    proyectos: ProyectoFila[],
  ): Promise<MovimientoIntegrante[]> {
    const LIMITE = 12
    const ultimosLeads = [...primerContacto.entries()]
      .sort((a, b) => b[1].localeCompare(a[1]))
      .slice(0, LIMITE)

    const nombres = new Map<string, string>()
    if (ultimosLeads.length > 0) {
      const { data } = await this.sb
        .from('fact_leads')
        .select('id, nombre_negocio')
        .in('id', ultimosLeads.map(([id]) => id))
      for (const l of data ?? []) nombres.set(l.id, l.nombre_negocio)
    }

    const movimientos: MovimientoIntegrante[] = [
      ...ultimosLeads.map(([id, fecha]) => ({
        tipo: 'lead' as const,
        texto: `Contactó a ${nombres.get(id) ?? 'un lead'}`,
        fecha,
        href: `/leads/${id}`,
      })),
      ...tareas.map((t) => ({ tipo: 'tarea' as const, texto: `Completó «${t.titulo}»`, fecha: t.completada_at, href: null })),
      ...clientes.map((c) => ({ tipo: 'cliente' as const, texto: `Ganó a ${c.nombre} como cliente`, fecha: c.fecha, href: `/clientes/${c.id}` })),
      ...proyectos.map((p) => ({
        tipo: 'proyecto' as const,
        texto: p.esResponsable ? `Responsable de ${p.nombre}` : `Se sumó a ${p.nombre}`,
        fecha: p.fecha,
        href: `/proyectos/${p.id}`,
      })),
    ]
    return movimientos.sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, LIMITE)
  }
}
