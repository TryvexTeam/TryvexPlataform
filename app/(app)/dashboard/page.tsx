import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { PermisosRepository, puede } from '@/lib/repos/permisos'
import { AsignacionesRepository } from '@/lib/repos/asignaciones'
import { LeadsRepository } from '@/lib/repos/leads'
import { TareasRepository } from '@/lib/repos/tareas'
import { JornadasRepository } from '@/lib/repos/jornadas'
import { ProyectosRepository } from '@/lib/repos/proyectos'
import { PresenciaRepository } from '@/lib/repos/presencia'
import { EventosRepository } from '@/lib/repos/eventos'
import { DashDeck, type LeadTarjeta, type TareaDelDia } from '@/components/dashboard/dash-deck'
import { SkeletonDeck } from '@/components/dashboard/skeleton-deck'
import { AgendaHoy } from '@/components/dashboard/agenda-hoy'
import { ProximaCita } from '@/components/dashboard/proxima-cita'
import { inicioDiaSantiago } from '@/lib/utils/fecha-santiago'
import type { TramoEmbudo } from '@/components/dashboard/embudo-tira'
import type {
  AlertaDash,
  AporteIntegrante,
  BentoPersonalDatos,
  DeckDatos,
  FilaAccionHoy,
  MetricaEquipo,
} from '@/lib/types/dashboard'
import type { Evento } from '@/lib/types/evento'
import type { Lead } from '@/lib/types/lead'
import type { TareaConResponsables } from '@/lib/types/tarea'

export const metadata = {
  title: 'Panel de Mando — Tryvex CRM',
  description: 'Qué hay que atender ahora: leads sin contactar, tareas vencidas y estado del turno.',
}

// Panel vivo: nada que cachear, cada visita mira el estado real de la operación.
export const dynamic = 'force-dynamic'

/**
 * 'YYYY-MM-DD' de hoy en Santiago.
 *
 * `fecha_limite` de tareas se compara contra el día chileno, no contra el UTC del
 * servidor: a las 22:00 de Santiago el UTC ya es el día siguiente y marcaría como
 * vencidas tareas que aún tienen el día por delante.
 */
const FECHA_SANTIAGO = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Santiago',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function hoySantiago(): string {
  return FECHA_SANTIAGO.format(new Date())
}

/** Deck vacío marcado como fallido: se usa cuando una consulta revienta. */
const DECK_FALLIDO: DeckDatos = { alertas: [], fallo: true }

/** Semana del KPI de horas: los mismos 8 h/día de referencia de
 *  `tabla-jornadas`, proyectados a 5 días laborales. No es un límite — una
 *  semana de 50 h simplemente llena la barra. */
const META_HORAS_SEMANA = 40

/** Tarjetas de lead por fila del grid en escritorio (xl:grid-cols-4). */
const MAX_LEADS_TARJETA = 4

/** Tarjetas de tarea: dos filas de tres en escritorio, sin scroll infinito. */
const MAX_TAREAS_TARJETA = 6

/** Estados que forman el embudo, en orden. `perdido` y `descartado` quedan
 *  fuera a propósito: el embudo muestra por dónde avanza la operación, no el
 *  cementerio. Se consultan desde /leads con su propio filtro. */
const ESTADOS_EMBUDO: { estado: Lead['estado']; label: string }[] = [
  { estado: 'sin_contactar', label: 'Sin contactar' },
  { estado: 'contactado', label: 'Contactado' },
  { estado: 'interesado', label: 'Interesado' },
  { estado: 'reunion_agendada', label: 'Reunión' },
  { estado: 'ganado', label: 'Ganado' },
]

/**
 * Días de Santiago que lleva vencida una tarea. Negativo = todavía en plazo.
 *
 * Se compara día contra día, no instante contra instante: una tarea que vence
 * hoy no está "vencida por 0.4 días", está en fecha.
 */
function diasVencida(fechaLimite: string | null, hoy: string): number {
  if (!fechaLimite) return -Infinity
  const ms = new Date(`${hoy}T00:00:00Z`).getTime() - new Date(`${fechaLimite}T00:00:00Z`).getTime()
  return Math.round(ms / 86_400_000)
}

/** Empaqueta tareas con su vencimiento ya calculado, para no hacerlo en el cliente. */
function conVencimiento(tareas: TareaConResponsables[], hoy: string): TareaDelDia[] {
  return tareas.map((tarea) => ({ tarea, diasVencida: diasVencida(tarea.fecha_limite, hoy) }))
}

/**
 * Arma una métrica del marcador del equipo.
 *
 * Filtra a quien no tiene aporte y ordena de mayor a menor. Ese filtro es una
 * decisión de producto, no una optimización: publicar un cero junto a un
 * nombre expone a la persona sin dar contexto de por qué su semana fue así.
 */
function armarMetrica(
  id: MetricaEquipo['id'],
  label: string,
  unidad: string,
  valores: Map<string, number>,
  personas: { id: string; nombre: string; avatar_url: string | null; color: string | null }[],
  miIntegranteId: string | null,
  decimales = 0,
  semanal = true,
): MetricaEquipo {
  const aportes: AporteIntegrante[] = personas
    .map((persona) => ({
      integranteId: persona.id,
      nombre: persona.nombre,
      valor: valores.get(persona.id) ?? 0,
      avatarUrl: persona.avatar_url,
      color: persona.color,
      esMio: persona.id === miIntegranteId,
    }))
    .filter((aporte) => aporte.valor > 0)
    .sort((a, b) => b.valor - a.valor)

  return {
    id,
    label,
    unidad,
    total: aportes.reduce((acc, aporte) => acc + aporte.valor, 0),
    aportes,
    decimales,
    semanal,
  }
}

function armarAlertas(sinContactar: number, vencidas: number, ambito: 'mias' | 'equipo'): AlertaDash[] {
  const mio = ambito === 'mias'
  return [
    {
      id: 'leads-sin-contactar',
      label: mio ? 'Mis leads sin contactar' : 'Leads sin contactar',
      valor: sinContactar,
      detalle: sinContactar === 0 ? 'Nada esperando respuesta' : 'Esperan un primer mensaje',
      href: '/leads?estado=sin_contactar',
      tono: sinContactar > 0 ? 'alerta' : 'ok',
    },
    {
      id: 'tareas-vencidas',
      label: mio ? 'Mis tareas vencidas' : 'Tareas vencidas del equipo',
      valor: vencidas,
      detalle: vencidas === 0 ? 'Ninguna pasada de fecha' : 'Pasaron su fecha límite',
      href: '/tareas',
      tono: vencidas > 0 ? 'alerta' : 'ok',
    },
  ]
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [integrante, perfil] = await Promise.all([
    new IntegrantesRepository(supabase).getByAuthUser(user.id),
    new PermisosRepository(supabase).misPermisos(user.id),
  ])

  const veEquipo = puede(perfil, 'ver_jornadas_equipo')
  const puedeVerFinanzas = puede(perfil, 'ver_finanzas')

  const leads = new LeadsRepository(supabase)
  const tareas = new TareasRepository(supabase)
  const hoy = hoySantiago()
  // Ventana "esta semana" = últimos 7 días de Santiago incluido hoy (el KPI
  // de T-003 §5 #7 es "esta semana", no "desde lunes": una ventana móvil de
  // 7 días refleja la actividad reciente sin resetearse a cero los domingos).
  const ahora = new Date()
  const desdeSemana = inicioDiaSantiago(6)

  // Sin integrante no hay "lo mío" posible: el usuario está autenticado pero no
  // pertenece al equipo. Se muestra el deck con lo que sí se puede leer.
  const integranteId = integrante?.id ?? null

  const [
    jornadaAbierta,
    presenciaPropia,
    datosLoMio,
    datosEquipo,
    bentoPersonalDatos,
    accionHoy,
    tarjetas,
    citaProxima,
    marcadorEquipo,
  ] = await Promise.all([
    integranteId
      ? new JornadasRepository(supabase).getAbierta(integranteId).catch(() => null)
      : Promise.resolve(null),
    integranteId
      ? new PresenciaRepository(supabase).miPresencia(integranteId).catch(() => null)
      : Promise.resolve(null),
    (async (): Promise<DeckDatos> => {
      if (!integranteId) return { alertas: armarAlertas(0, 0, 'mias'), fallo: false }
      try {
        const asignados = await new AsignacionesRepository(supabase).leadsDeIntegrante(integranteId)
        const misLeadIds = asignados.map((a) => a.lead_id)
        const [sinContactar, vencidas] = await Promise.all([
          leads.contarPorEstado('sin_contactar', misLeadIds),
          tareas.contarVencidas(hoy, integranteId),
        ])
        return { alertas: armarAlertas(sinContactar, vencidas, 'mias'), fallo: false }
      } catch {
        return DECK_FALLIDO
      }
    })(),
    (async (): Promise<DeckDatos> => {
      if (!veEquipo) return { alertas: [], fallo: false }
      try {
        const [sinContactar, vencidas] = await Promise.all([
          leads.contarPorEstado('sin_contactar'),
          tareas.contarVencidas(hoy),
        ])
        return { alertas: armarAlertas(sinContactar, vencidas, 'equipo'), fallo: false }
      } catch {
        return DECK_FALLIDO
      }
    })(),
    // Bento personal (fase 5.2). Cada agregado cae por su cuenta: una
    // consulta fallida no tumba las demás vitrinas.
    (async (): Promise<BentoPersonalDatos | null> => {
      if (!integranteId) return null
      const [carga, serieInteracciones, jornadasSemana] = await Promise.all([
        tareas.contarActivasPorPrioridad(integranteId).catch(() => null),
        leads
          .contarInteraccionesPorDia(desdeSemana.toISOString(), ahora.toISOString(), integranteId)
          .catch(() => null),
        new JornadasRepository(supabase)
          .listPropias(integranteId, desdeSemana.toISOString(), ahora.toISOString())
          .catch(() => null),
      ])
      return {
        carga,
        interacciones: serieInteracciones
          ? {
              total: serieInteracciones.reduce((acc, punto) => acc + punto.total, 0),
              serie: serieInteracciones,
            }
          : null,
        // `jornadas_resumen` incluye la jornada abierta (así la consume
        // tabla-jornadas con su barra "en curso"); una jornada abierta antes
        // de la ventana queda fuera de la suma.
        horas:
          jornadasSemana === null
            ? null
            : jornadasSemana.reduce((acc, fila) => acc + Number(fila.horas ?? 0), 0),
      }
    })(),
    // "Requiere acción hoy" (T-012 §4): la tabla principal de "Lo mío".
    // Cae por su cuenta: si falla, el resto del panel sigue en pie y solo
    // esta sección pinta su estado de error.
    (async (): Promise<{ filas: FilaAccionHoy[]; fallo: boolean }> => {
      if (!integranteId) return { filas: [], fallo: false }
      try {
        return { filas: await leads.listarRequiereAccionHoy(integranteId, hoy), fallo: false }
      } catch {
        return { filas: [], fallo: true }
      }
    })(),
    // Tarjetas del panel: leads por score, tareas por urgencia y el embudo.
    // Cada consulta cae por su cuenta — una sección caída no tumba el resto.
    (async (): Promise<{
      leadsLoMio: LeadTarjeta[]
      leadsEquipo: LeadTarjeta[]
      tareasLoMio: TareaDelDia[]
      tareasEquipo: TareaDelDia[]
      embudo: TramoEmbudo[]
    }> => {
      const [misLeads, leadsDelEquipo, misTareas, tareasDelEquipo, ...conteos] = await Promise.all([
        integranteId
          ? leads.listSinContactarPorScore(integranteId, MAX_LEADS_TARJETA).catch(() => [])
          : Promise.resolve([]),
        veEquipo
          ? leads.listSinContactarPorScore(null, MAX_LEADS_TARJETA).catch(() => [])
          : Promise.resolve([]),
        integranteId
          ? tareas.listDelDia(integranteId, MAX_TAREAS_TARJETA).catch(() => [])
          : Promise.resolve([]),
        veEquipo
          ? tareas.listDelDia(undefined, MAX_TAREAS_TARJETA).catch(() => [])
          : Promise.resolve([]),
        ...ESTADOS_EMBUDO.map((tramo) => leads.contarPorEstado(tramo.estado).catch(() => 0)),
      ])

      return {
        leadsLoMio: misLeads,
        leadsEquipo: leadsDelEquipo,
        tareasLoMio: conVencimiento(misTareas, hoy),
        tareasEquipo: conVencimiento(tareasDelEquipo, hoy),
        embudo: ESTADOS_EMBUDO.map((tramo, i) => ({ ...tramo, count: conteos[i] ?? 0 })),
      }
    })(),
    // La próxima cita de hoy: la tarjeta de acento de la cabecera. Se consulta
    // aquí, no dentro del componente, porque el deck necesita saber si existe
    // para no pintar dos acentos en la misma pantalla.
    (async (): Promise<Evento | null> => {
      try {
        const ahoraISO = new Date().toISOString()
        // El fin del día de Santiago: hoy menos (-1) = mañana a medianoche.
        const finDeHoy = inicioDiaSantiago(-1).toISOString()
        const eventos = await new EventosRepository(supabase).listRango(ahoraISO, finDeHoy, user.id)
        return (
          eventos.find(
            (evento) =>
              evento.es_mio ||
              (integranteId !== null &&
                evento.asistentes.some((a) => a.integrante_id === integranteId)),
          ) ?? null
        )
      } catch {
        // Silencio deliberado: la sección "Resto del día" ya pinta su propio
        // estado de error. Dos avisos del mismo fallo en la misma pantalla no
        // informan más, solo alarman el doble.
        return null
      }
    })(),
    // Marcador del equipo: horas, contactos y reuniones de la semana. Solo se
    // consulta con permiso de equipo — sin él la sección ni se ofrece, así que
    // pedir los datos sería trabajo tirado (y la RLS los negaría igual).
    (async (): Promise<MetricaEquipo[]> => {
      if (!veEquipo) return []
      try {
        const desdeISO = desdeSemana.toISOString()
        const hastaISO = ahora.toISOString()

        const [personas, jornadas, contactos, reuniones, tareasListas, proyectosActivos] =
          await Promise.all([
            new IntegrantesRepository(supabase).listActivos(),
            new JornadasRepository(supabase).listEquipo(desdeISO, hastaISO).catch(() => []),
            leads.contarInteraccionesPorIntegrante(desdeISO, hastaISO).catch(() => new Map()),
            new EventosRepository(supabase)
              .contarPorIntegrante(desdeISO, hastaISO)
              .catch(() => new Map()),
            tareas.contarCompletadasPorIntegrante(desdeISO, hastaISO).catch(() => new Map()),
            // Sin ventana de fechas: son los proyectos que cada uno tiene
            // encima AHORA, no los que tocó esta semana.
            new ProyectosRepository(supabase).proyectosActivosPorIntegrante().catch(() => new Map()),
          ])

        // Las horas llegan por jornada, no por persona: se suman aquí.
        const horas = new Map<string, number>()
        for (const jornada of jornadas) {
          horas.set(
            jornada.integrante_id,
            (horas.get(jornada.integrante_id) ?? 0) + Number(jornada.horas ?? 0),
          )
        }

        const nombres = personas.map((persona) => ({
          id: persona.id,
          nombre: persona.nombre,
          avatar_url: persona.avatar_url,
          color: persona.color,
        }))

        return [
          armarMetrica('horas', 'Horas', 'h', horas, nombres, integranteId, 1),
          armarMetrica('contactos', 'Leads contactados', 'contactos', contactos, nombres, integranteId),
          armarMetrica('reuniones', 'Reuniones', 'reuniones', reuniones, nombres, integranteId),
          armarMetrica('tareas', 'Tareas completadas', 'tareas', tareasListas, nombres, integranteId),
          armarMetrica(
            'proyectos',
            'Proyectos en curso',
            'proyectos',
            proyectosActivos,
            nombres,
            integranteId,
            0,
            false,
          ),
        ]
      } catch {
        // Sin marcador el resto del panel sigue en pie: la sección
        // simplemente no se pinta.
        return []
      }
    })(),
  ])

  const nombre = integrante?.nombre?.split(' ')[0] ?? 'por aquí'
  return (
    <div className="h-full w-full p-4 md:p-8">
      {/* El h1 es de lectores de pantalla: en pantalla, el saludo con la fecha
          cumple ese papel y repetir "Panel de Mando" encima solo agregaba una
          línea que nadie lee dos veces. La landmark sigue anunciada. */}
      <h1 className="sr-only">Panel de Mando</h1>
      <Suspense fallback={<SkeletonDeck />}>
        <DashDeck
          nombre={nombre}
          jornadaAbierta={jornadaAbierta}
          presenciaPropia={presenciaPropia}
          datosLoMio={datosLoMio}
          datosEquipo={datosEquipo}
          puedeVerFinanzas={puedeVerFinanzas}
          veEquipo={veEquipo}
          leadsLoMio={tarjetas.leadsLoMio}
          leadsEquipo={tarjetas.leadsEquipo}
          tareasLoMio={tarjetas.tareasLoMio}
          tareasEquipo={tarjetas.tareasEquipo}
          embudo={tarjetas.embudo}
          proximaCita={citaProxima ? <ProximaCita cita={citaProxima} /> : null}
          hayProximaCita={citaProxima !== null}
          analitica={bentoPersonalDatos}
          marcadorEquipo={marcadorEquipo}
          metaHoras={META_HORAS_SEMANA}
          agendaHoy={<AgendaHoy authUserId={user.id} integranteId={integranteId} />}
          filasAccionHoy={accionHoy.filas}
          falloAccionHoy={accionHoy.fallo}
        />
      </Suspense>
    </div>
  )
}
