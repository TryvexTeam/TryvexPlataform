'use client'

import { useCallback, type ReactNode } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { DashStrip } from '@/components/dashboard/dash-strip'
import { VistaSelector } from '@/components/dashboard/vista-selector'
import { CifrasCabecera, type Cifra } from '@/components/dashboard/cifras-cabecera'
import { SeccionPanel } from '@/components/dashboard/seccion-panel'
import { CarruselLeads } from '@/components/dashboard/carrusel-leads'
import { LeadScoopCard } from '@/components/dashboard/lead-scoop-card'
import { TareaScoopCard } from '@/components/dashboard/tarea-scoop-card'
import { EmbudoTira, type TramoEmbudo } from '@/components/dashboard/embudo-tira'
import { PanelAnalitica } from '@/components/dashboard/panel-analitica'
import { MarcadorEquipo } from '@/components/dashboard/marcador-equipo'
import { TablaAccion } from '@/components/dashboard/tabla-accion'
import { EstadoVacio } from '@/components/dashboard/estado-vacio'
import { EstadoError } from '@/components/dashboard/estado-error'
import { EstadoSinPermiso } from '@/components/dashboard/estado-sin-permiso'
import { useDatosVivos } from '@/lib/hooks/use-datos-vivos'
import type {
  BentoPersonalDatos,
  DeckDatos,
  FilaAccionHoy,
  MetricaEquipo,
  VistaDashboard,
} from '@/lib/types/dashboard'
import { vistaDesdeParam } from '@/lib/types/dashboard'
import type { Jornada } from '@/lib/types/jornada'
import type { Lead } from '@/lib/types/lead'
import type { PresenciaIntegrante } from '@/lib/types/presencia'
import type { TareaConResponsables } from '@/lib/types/tarea'

export type LeadTarjeta = Pick<
  Lead,
  'id' | 'nombre_negocio' | 'nicho' | 'localidad' | 'score' | 'origen'
>

/** Una tarea con los días que lleva vencida ya calculados en el servidor. */
export interface TareaDelDia {
  tarea: TareaConResponsables
  diasVencida: number
}

interface DashDeckProps {
  nombre: string
  jornadaAbierta: Jornada | null
  presenciaPropia: PresenciaIntegrante | null
  datosLoMio: DeckDatos
  datosEquipo: DeckDatos
  puedeVerFinanzas: boolean
  veEquipo: boolean
  /** Leads sin contactar ordenados por score de IA. */
  leadsLoMio: LeadTarjeta[]
  leadsEquipo: LeadTarjeta[]
  /** Tareas activas ordenadas por urgencia. */
  tareasLoMio: TareaDelDia[]
  tareasEquipo: TareaDelDia[]
  /** Tramos del embudo por estado actual. */
  embudo: TramoEmbudo[]
  /** Agregados de la semana para la sección de analíticas. */
  analitica: BentoPersonalDatos | null
  metaHoras: number
  /** Marcador del equipo. Llega vacío sin permiso: la sección no se pinta. */
  marcadorEquipo: MetricaEquipo[]
  /**
   * Próxima cita de hoy, compuesta por un Server Component desde `page.tsx`.
   * Es `null` cuando no queda nada agendado — y entonces el acento pasa a la
   * primera tarea, porque sin cita esa es la acción siguiente del día.
   */
  proximaCita?: ReactNode
  hayProximaCita: boolean
  /** Agenda completa de hoy (Server Component), al pie de las analíticas. */
  agendaHoy?: ReactNode
  /** Filas de "Requiere acción hoy" (T-012 §5), consultadas por el server. */
  filasAccionHoy: FilaAccionHoy[]
  /** La consulta de la tabla falló: se pinta el estado de error de sección. */
  falloAccionHoy: boolean
}

/**
 * Orquestador del Panel de Mando.
 *
 * La vista activa vive en la URL (`?vista=equipo`), no en estado local: el panel
 * tiene que poder compartirse por link tal como lo está mirando quien lo manda
 * (decisión D6 del PRP-008).
 *
 * Regla de acento: una sola cosa roja por pantalla, la acción siguiente. Si hay
 * cita próxima, es ella; si no, la primera tarea de la lista. Nunca las dos.
 */
export function DashDeck({
  nombre,
  jornadaAbierta,
  presenciaPropia,
  datosLoMio,
  datosEquipo,
  puedeVerFinanzas,
  veEquipo,
  leadsLoMio,
  leadsEquipo,
  tareasLoMio,
  tareasEquipo,
  embudo,
  analitica,
  metaHoras,
  marcadorEquipo,
  proximaCita,
  hayProximaCita,
  agendaHoy,
  filasAccionHoy,
  falloAccionHoy,
}: DashDeckProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Los datos los arma el server; realtime solo pide un re-render cuando algo cambia.
  useDatosVivos(['fact_leads', 'tareas', 'jornadas', 'lead_asignaciones', 'interacciones_lead'])

  const vista = vistaDesdeParam(searchParams.get('vista'), veEquipo)

  const cambiarVista = useCallback(
    (nueva: VistaDashboard) => {
      const params = new URLSearchParams(searchParams.toString())
      if (nueva === 'loMio') params.delete('vista')
      else params.set('vista', nueva)
      const query = params.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    },
    [pathname, router, searchParams],
  )

  const esEquipo = vista === 'equipo'
  const datos = esEquipo ? datosEquipo : datosLoMio
  const leads = esEquipo ? leadsEquipo : leadsLoMio
  const tareas = esEquipo ? tareasEquipo : tareasLoMio

  const sinContactar = datos.alertas.find((a) => a.id === 'leads-sin-contactar')
  const vencidas = datos.alertas.find((a) => a.id === 'tareas-vencidas')

  // Las cifras son texto, no tarjetas: tres números no necesitan tres cajas.
  const cifras: Cifra[] = [
    {
      id: 'sin-contactar',
      valor: sinContactar?.valor ?? 0,
      label: esEquipo ? 'Sin contactar' : 'Mis leads sin contactar',
      href: '/leads?estado=sin_contactar',
    },
    {
      id: 'vencidas',
      valor: vencidas?.valor ?? 0,
      label: esEquipo ? 'Tareas vencidas' : 'Mis tareas vencidas',
      href: '/tareas',
      alerta: (vencidas?.valor ?? 0) > 0,
    },
    {
      id: 'embudo',
      valor: embudo.reduce((acc, t) => acc + t.count, 0),
      label: 'Leads en el embudo',
      href: '/leads',
    },
  ]

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-12 pb-nav-movil md:gap-14">
      {/* Cabecera: saludo, presencia, reloj y —si la hay— la cita de ahora. */}
      <div className="flex flex-col gap-8">
        <DashStrip
          nombre={nombre}
          jornadaAbierta={jornadaAbierta}
          presenciaPropia={presenciaPropia}
        />

        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          {datos.fallo ? (
            <EstadoError mensaje="Las cifras no respondieron. Los números que verías podrían estar desactualizados." />
          ) : (
            <CifrasCabecera cifras={cifras} />
          )}
          {proximaCita}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <VistaSelector vista={vista} onChange={cambiarVista} veEquipo={veEquipo} />
          {!puedeVerFinanzas && <EstadoSinPermiso seccion="El saldo del mes" />}
        </div>
      </div>

      {/* Leads sin contactar, ordenados por el score de IA que ya calcula el
          CRM. En celular es un carril deslizable; desde `md`, grilla. */}
      <SeccionPanel
        id="dash-leads-titulo"
        titulo={esEquipo ? 'Leads sin contactar' : 'Tus leads sin contactar'}
        contador={sinContactar ? String(sinContactar.valor) : undefined}
        contadorAlerta={(sinContactar?.valor ?? 0) > 0}
      >
        {datos.fallo ? (
          <EstadoError mensaje="Los leads no respondieron. Vuelve a cargar el panel." />
        ) : leads.length === 0 ? (
          <EstadoVacio
            titulo="Nada esperando respuesta"
            descripcion="No hay leads sin contactar ahora mismo."
            ctaLabel="Ir a leads"
            ctaHref="/leads"
          />
        ) : (
          <CarruselLeads etiqueta="Leads sin contactar">
            {leads.map((lead, i) => (
              <LeadScoopCard key={lead.id} lead={lead} indice={i} />
            ))}
          </CarruselLeads>
        )}
      </SeccionPanel>

      {/* Tareas del día: dos por fila en celular, tres desde escritorio.
          Sin cita próxima, la primera se lleva el acento. */}
      <SeccionPanel
        id="dash-tareas-titulo"
        titulo={esEquipo ? 'Tareas del equipo' : 'Tus tareas de hoy'}
        contador={tareas.length > 0 ? String(tareas.length) : undefined}
      >
        {tareas.length === 0 ? (
          <EstadoVacio
            titulo="Sin tareas pendientes"
            descripcion="No queda nada activo asignado ahora mismo."
            ctaLabel="Ir a tareas"
            ctaHref="/tareas"
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 md:gap-5 lg:grid-cols-3">
            {tareas.map((fila, i) => (
              <TareaScoopCard
                key={fila.tarea.id}
                tarea={fila.tarea}
                diasVencida={fila.diasVencida}
                acento={!hayProximaCita && i === 0 && fila.diasVencida >= 0}
                mostrarResponsable={esEquipo}
                indice={i}
              />
            ))}
          </div>
        )}
      </SeccionPanel>

      {/* Analíticas: el embudo a ancho completo y, debajo, las tres métricas
          de la semana con el mismo peso — son comparables entre sí. */}
      <SeccionPanel
        id="dash-analitica-titulo"
        titulo="Analíticas"
        contador={esEquipo ? 'Equipo' : 'Tu semana'}
      >
        <div className="flex flex-col gap-8">
          <EmbudoTira tramos={embudo} />
          {esEquipo
            ? marcadorEquipo.length > 0 && <MarcadorEquipo metricas={marcadorEquipo} />
            : analitica && <PanelAnalitica datos={analitica} metaHoras={metaHoras} />}
        </div>
      </SeccionPanel>

      {/* "Requiere acción hoy" (T-012 §5): la tabla de leads que se enfrían. */}
      {!esEquipo && (
        <SeccionPanel id="dash-accion-titulo" titulo="Requiere acción hoy">
          {falloAccionHoy ? (
            <EstadoError mensaje="La tabla de acción no respondió. Los leads que verías podrían estar desactualizados." />
          ) : (
            <TablaAccion filas={filasAccionHoy} />
          )}
        </SeccionPanel>
      )}

      {/* Agenda del resto del día. Va al final a propósito: lo inmediato ya
          está arriba en la tarjeta de acento. */}
      {!esEquipo && agendaHoy && (
        <SeccionPanel id="dash-agenda-titulo" titulo="Resto del día">
          <div className="rounded-[28px] border border-white/[0.07] bg-white/[0.038] p-5">
            {agendaHoy}
          </div>
        </SeccionPanel>
      )}
    </div>
  )
}
