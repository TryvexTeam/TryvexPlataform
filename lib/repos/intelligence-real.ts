import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgenteSala, EstadoAgente } from '@/lib/types/sala-agentes'
import { tablaEncargos } from '@/lib/repos/tabla-encargos'

/**
 * Los datos REALES de Tryvex Intelligence.
 *
 * Hasta ahora la sección leía `lib/vex/sala-ejemplo.ts`: números inventados en
 * el código, que no cambiaban pasara lo que pasara en la empresa. Esto lo
 * reemplaza por lo que hay en la base.
 *
 * Una advertencia que conviene no perder de vista: la tabla `agentes` no fue
 * pensada como "agentes de IA con estado de trabajo", sino como credenciales de
 * API (tiene `token_hash`, `expira_at`, `activo`). Lo que sí sirve, y mucho, es
 * `ultimo_uso_at`: es un latido real: dice cuándo fue la última vez que ese
 * token llamó al CRM. De ahí sale el estado que se muestra, y por eso el estado
 * es una DERIVACIÓN honesta y no un campo inventado.
 *
 * Lo que NO se inventa acá: si algo no tiene fuente, no aparece. Las pantallas
 * sin tabla (Conocimiento, Campañas, Costos) se marcan como no conectadas en
 * vez de rellenarse con datos falsos.
 */

/** Pasado este tiempo sin llamar al CRM, un agente ya no está "trabajando". */
const MINUTOS_PARA_ESTAR_VIVO = 15

/** Y pasado este, directamente no da señales. */
const HORAS_PARA_SIN_LATIDO = 48

/** Lo que devuelve la tabla `agentes`. */
interface FilaAgente {
  id: string
  nombre: string
  descripcion: string | null
  color: string | null
  activo: boolean
  ultimo_uso_at: string | null
}

/** Un encargo de la cola, tal como viene de `agente_encargos`. */
export interface EncargoReal {
  id: string
  agenteId: string
  tipo: 'tarea' | 'duda'
  titulo: string
  detalle: string | null
  estado: 'encolado' | 'aprobado' | 'en_curso' | 'respondido' | 'rechazado'
  prioridad: 'baja' | 'media' | 'alta'
  /** Quién lo pidió. Nombre ya resuelto, no un uuid. */
  pedidoPor: string | null
  /** Quién dio el permiso. Sin esto, el agente no puede ejecutarlo. */
  aprobadoPor: string | null
  aprobadoAt: string | null
  respuesta: string | null
  respondidoAt: string | null
  motivoRechazo: string | null
  creadoAt: string
}

/**
 * En qué estado está un agente, deducido de su latido.
 *
 * No hay un campo `estado` en la base, y está bien que no lo haya: un campo así
 * se queda pegado en "trabajando" cuando el proceso muere sin avisar. Un latido
 * no miente, porque para decir "estoy vivo" hay que estar vivo.
 */
function estadoSegunLatido(
  fila: FilaAgente,
  esperandoFirma: boolean,
  ahora: number,
): EstadoAgente {
  // Lo primero es lo primero: si hay algo esperando que una persona lo apruebe,
  // ese es el estado que importa, porque es el único que pide una acción.
  if (esperandoFirma) return 'esperando_firma'

  if (!fila.activo) return 'sin_latido'
  if (!fila.ultimo_uso_at) return 'sin_latido'

  const minutos = (ahora - new Date(fila.ultimo_uso_at).getTime()) / 60000
  if (minutos <= MINUTOS_PARA_ESTAR_VIVO) return 'trabajando'
  if (minutos > HORAS_PARA_SIN_LATIDO * 60) return 'sin_latido'
  return 'en_reposo'
}

/** "hace 3 minutos", "hace 2 días". Para decir cuándo se le vio por última vez. */
function hace(iso: string | null, ahora: number): string {
  if (!iso) return 'nunca'
  const minutos = Math.max(0, Math.round((ahora - new Date(iso).getTime()) / 60000))
  if (minutos < 1) return 'recién'
  if (minutos < 60) return `hace ${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `hace ${horas} h`
  return `hace ${Math.floor(horas / 24)} d`
}

/**
 * El color del agente, traducido a los tokens del CRM.
 *
 * En la base los colores son hex sueltos (`#c9463d`). La sala usa tokens para
 * que respeten el tema claro y oscuro, así que se mapean los conocidos y el
 * resto cae en un token neutro — nunca en un hex crudo, que se vería mal en uno
 * de los dos temas.
 */
function colorDeToken(hex: string | null): string {
  const mapa: Record<string, string> = {
    '#c9463d': 'var(--tx-accent)',
    '#4a7ec9': 'var(--tx-blue)',
    '#33ffcc': 'var(--tx-green)',
    '#f4c430': 'var(--tx-warning)',
  }
  return mapa[(hex ?? '').toLowerCase()] ?? 'var(--tx-ink-muted)'
}

/**
 * Los agentes del equipo, con su estado real.
 *
 * Trae de una sola vez la cola de encargos para no hacer una consulta por
 * agente: con ocho agentes serían nueve viajes a la base en cada carga.
 */
export async function obtenerAgentesReales(
  supabase: SupabaseClient,
): Promise<{ agentes: AgenteSala[]; encargos: EncargoReal[] }> {
  const [resAgentes, resEncargos] = await Promise.all([
    supabase
      .from('agentes')
      .select('id, nombre, descripcion, color, activo, ultimo_uso_at')
      .order('nombre'),
    obtenerEncargosReales(supabase),
  ])

  if (resAgentes.error) throw new Error(`No se pudieron leer los agentes: ${resAgentes.error.message}`)

  const ahora = Date.now()
  const encargos = resEncargos
  const filas = (resAgentes.data ?? []) as FilaAgente[]

  const agentes = filas.map((fila): AgenteSala => {
    const suyos = encargos.filter((e) => e.agenteId === fila.id)
    const esperandoFirma = suyos.some((e) => e.estado === 'encolado')
    const enCurso = suyos.find((e) => e.estado === 'en_curso' || e.estado === 'aprobado')
    const ultimoRespondido = suyos.find((e) => e.estado === 'respondido')

    const estado = estadoSegunLatido(fila, esperandoFirma, ahora)

    return {
      id: fila.id,
      nombre: fila.nombre,
      oficio: fila.descripcion ?? 'Sin oficio declarado',
      color: colorDeToken(fila.color),
      estado,
      haciendo: describirQueHace(estado, enCurso, ultimoRespondido, fila, ahora),
      // La base no registra a nombre de quién trabaja hoy. Antes esto decía un
      // nombre inventado; ahora dice la verdad: no se sabe.
      humano: null,
      encargosHoy: suyos.filter((e) => esDeHoy(e.creadoAt, ahora)).length,
      // Todavía no existe tabla `rutinas`: no hay de dónde sacarlo.
      proximaRutina: null,
    }
  })

  return { agentes, encargos }
}

/** Qué mostrar en la línea de "ahora mismo" de cada tarjeta. */
function describirQueHace(
  estado: EstadoAgente,
  enCurso: EncargoReal | undefined,
  ultimoRespondido: EncargoReal | undefined,
  fila: FilaAgente,
  ahora: number,
): string {
  if (estado === 'esperando_firma') return 'Tiene trabajo encolado esperando que alguien lo apruebe.'
  if (enCurso) return enCurso.titulo
  if (estado === 'sin_latido') {
    return fila.activo
      ? `Sin señales desde ${hace(fila.ultimo_uso_at, ahora)}.`
      : 'Desactivado: su credencial no está habilitada.'
  }
  if (ultimoRespondido) return `Último: ${ultimoRespondido.titulo}`
  return `Conectado ${hace(fila.ultimo_uso_at, ahora)}. Sin encargos en la cola.`
}

function esDeHoy(iso: string, ahora: number): boolean {
  const hoy = new Date(ahora)
  const fecha = new Date(iso)
  return (
    fecha.getFullYear() === hoy.getFullYear() &&
    fecha.getMonth() === hoy.getMonth() &&
    fecha.getDate() === hoy.getDate()
  )
}

/**
 * La cola de encargos activa: lo que el equipo le pidió a los agentes.
 *
 * Lo archivado no se trae. Está en la base —nunca se borra— pero no es lo que
 * alguien necesita ver al abrir la pantalla.
 */
export async function obtenerEncargosReales(
  supabase: SupabaseClient,
): Promise<EncargoReal[]> {
  const { data, error } = await tablaEncargos(supabase)
    .select(
      `id, agente_id, tipo, titulo, detalle, estado, prioridad,
       respuesta, respondido_at, motivo_rechazo, aprobado_at, created_at,
       pedido:creado_por (nombre),
       aprobador:aprobado_por (nombre)`,
    )
    .is('archivado_at', null)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) throw new Error(`No se pudo leer la cola de encargos: ${error.message}`)

  type FilaEncargo = {
    id: string
    agente_id: string
    tipo: 'tarea' | 'duda'
    titulo: string
    detalle: string | null
    estado: EncargoReal['estado']
    prioridad: EncargoReal['prioridad']
    respuesta: string | null
    respondido_at: string | null
    motivo_rechazo: string | null
    aprobado_at: string | null
    created_at: string
    // Supabase devuelve el join como objeto o como arreglo según la relación.
    pedido: { nombre: string } | { nombre: string }[] | null
    aprobador: { nombre: string } | { nombre: string }[] | null
  }

  const unNombre = (v: FilaEncargo['pedido']): string | null => {
    if (!v) return null
    return Array.isArray(v) ? (v[0]?.nombre ?? null) : v.nombre
  }

  return ((data ?? []) as unknown as FilaEncargo[]).map((f) => ({
    id: f.id,
    agenteId: f.agente_id,
    tipo: f.tipo,
    titulo: f.titulo,
    detalle: f.detalle,
    estado: f.estado,
    prioridad: f.prioridad,
    pedidoPor: unNombre(f.pedido),
    aprobadoPor: unNombre(f.aprobador),
    aprobadoAt: f.aprobado_at,
    respuesta: f.respuesta,
    respondidoAt: f.respondido_at,
    motivoRechazo: f.motivo_rechazo,
    creadoAt: f.created_at,
  }))
}
