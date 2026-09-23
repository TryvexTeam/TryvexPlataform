import 'server-only'

import { estadoEnOficina, type EstadoDeclarable } from '@/lib/agentes/estado-oficina'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgenteSala, Encargo, EstadoAgente, EstadoEncargo } from '@/lib/types/sala-agentes'
import { tablaEncargos } from '@/lib/repos/tabla-encargos'

/**
 * Los datos REALES de Tryvex Intelligence.
 *
 * Hasta el 22-sep la sección leía un archivo de ejemplos: números inventados en
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
  expira_at: string | null
  estado_declarado: EstadoDeclarable | null
  estado_nota: string | null
  estado_hasta: string | null
  // Supabase devuelve el join como objeto o como arreglo según la relación.
  dueno: { nombre: string } | { nombre: string }[] | null
}

/** Lo que muestra la columna lateral del Espacio: datos propios de cada agente. */
export interface FichaAgente {
  /** Cuándo vence su llave. `null` = llave antigua, sin fecha. */
  expiraAt: string | null
  /** Lo último que dejó registrado en el Cerebro. Vacío si nunca escribió. */
  memoria: string[]
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
/** La fila de agente_actividad, en la forma que usa la pantalla. */
export function comoActividad(
  f: { herramienta: string | null; herramienta_at: string | null; turno_desde: string | null; herramientas_turno: number } | undefined,
): AgenteSala['actividad'] {
  if (!f) return null
  return {
    herramienta: f.herramienta,
    herramientaAt: f.herramienta_at,
    turnoDesde: f.turno_desde,
    herramientasTurno: f.herramientas_turno ?? 0,
  }
}

const COLOR_NEUTRO = '#8a8f98'
function esHex(c: string | null): c is string {
  return typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)
}

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
): Promise<{ agentes: AgenteSala[]; encargos: EncargoReal[]; fichas: Record<string, FichaAgente> }> {
  const [resAgentes, resEncargos, resMemoria, resActividad] = await Promise.all([
    supabase
      .from('agentes')
      .select('id, nombre, descripcion, color, activo, ultimo_uso_at, expira_at, estado_declarado, estado_nota, estado_hasta, dueno:creado_por (nombre)')
      .order('nombre'),
    obtenerEncargosReales(supabase),
    // Lo que los agentes escribieron en el Cerebro. Son pocas entradas hoy, y
    // así se muestran: pocas. Antes esta columna tenía tres frases inventadas,
    // iguales para todos los agentes.
    supabase
      .from('cerebro_entradas')
      .select('titulo, autor_externo, created_at')
      .not('autor_externo', 'is', null)
      .order('created_at', { ascending: false })
      .limit(300),
    // Lo que manda el hook de Claude Code. Si la tabla no responde, la oficina
    // simplemente no muestra la herramienta: no es motivo para romper la Sala.
    supabase.from('agente_actividad').select('agente_id, herramienta, herramienta_at, turno_desde, herramientas_turno'),
  ])
  type FilaActividad = {
    agente_id: string
    herramienta: string | null
    herramienta_at: string | null
    turno_desde: string | null
    herramientas_turno: number
  }
  const actividades = new Map(
    ((resActividad.data ?? []) as FilaActividad[]).map((f) => [f.agente_id, f]),
  )

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
      colorHex: esHex(fila.color) ? fila.color : COLOR_NEUTRO,
      actividad: comoActividad(actividades.get(fila.id)),
      estado,
      haciendo: describirQueHace(estado, enCurso, ultimoRespondido, fila, ahora),
      // El integrante que dio de alta al agente: es a nombre de quien trabaja,
      // y a quien se le atribuyen sus reuniones y sus mensajes.
      humano: unNombreDueno(fila.dueno),
      encargosHoy: suyos.filter((e) => esDeHoy(e.creadoAt, ahora)).length,
      // Todavía no existe tabla `rutinas`: no hay de dónde sacarlo.
      proximaRutina: null,
      oficina: estadoEnOficina({
        activo: fila.activo,
        ultimoUsoAt: fila.ultimo_uso_at,
        declarado: fila.estado_declarado,
        declaradoHasta: fila.estado_hasta,
        nota: fila.estado_nota,
        // Solo cuenta lo TOMADO: un encargo aprobado que nadie tomó todavía no
        // es trabajo en curso.
        encargoEnCurso: suyos.find((e) => e.estado === 'en_curso')?.titulo ?? null,
        esperandoPermiso: esperandoFirma,
        ahora,
      }),
    }
  })

  type Entrada = { titulo: string | null; autor_externo: string | null }
  const entradas = (resMemoria.data ?? []) as Entrada[]
  const fichas: Record<string, FichaAgente> = {}
  for (const fila of filas) {
    const nombre = fila.nombre.toLowerCase()
    fichas[fila.id] = {
      expiraAt: fila.expira_at,
      memoria: entradas
        .filter((e) => (e.autor_externo ?? '').toLowerCase().includes(nombre))
        .map((e) => e.titulo?.trim())
        .filter((t): t is string => Boolean(t))
        .slice(0, 3),
    }
  }

  return { agentes, encargos, fichas }
}

function unNombreDueno(v: FilaAgente['dueno']): string | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0]?.nombre ?? null) : v.nombre
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

/**
 * La cola real, traducida al formato que muestra la Sala.
 *
 * Son dos vistas de lo mismo: la Cola sirve para operar (dar permiso, rechazar,
 * archivar) y la Sala para mirar el conjunto. Antes esta tabla se alimentaba de
 * datos inventados, y al conectar la Cola quedó vacía por un descuido — que es
 * peor que la maqueta, porque una tabla vacía parece decir "no hay trabajo".
 *
 * Los rechazados no viajan: dejaron de ser trabajo pendiente y ensuciarían la
 * lectura de qué está pasando ahora.
 */
export function comoEncargosDeSala(encargos: EncargoReal[]): Encargo[] {
  // Un encargo esperando permiso está BLOQUEADO en el sentido literal: no puede
  // avanzar hasta que una persona lo destrabe. Es el mismo concepto.
  const estados: Record<EncargoReal['estado'], EstadoEncargo | null> = {
    encolado: 'bloqueada',
    aprobado: 'sin_empezar',
    en_curso: 'en_curso',
    respondido: 'listo',
    rechazado: null,
  }

  return encargos.flatMap((e): Encargo[] => {
    const estado = estados[e.estado]
    if (!estado) return []

    return [
      {
        id: e.id,
        titulo: e.titulo,
        agenteId: e.agenteId,
        estado,
        // Todavía no hay tabla de evidencias: decir que no hay es honesto,
        // inventar un `exit_code` no lo sería.
        evidencias: [],
        veredicto: null,
        pedidoPor: e.pedidoPor ?? 'alguien del equipo',
        requiereFirma: e.estado === 'encolado',
        porQueIrreversible:
          e.estado === 'encolado'
            ? 'El agente no puede trabajarlo hasta que una persona lo apruebe.'
            : null,
      },
    ]
  })
}
