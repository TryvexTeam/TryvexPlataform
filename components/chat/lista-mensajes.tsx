'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownIcon, Loader2Icon } from 'lucide-react'
import type { Mensaje, MiembroChat } from '@/lib/types/chat'
import { agruparRachas } from '@/lib/chat/rachas'
import { estadoTicks } from '@/lib/chat/ticks'
import { abreDiaNuevo } from '@/lib/utils/fecha-santiago'
import { BurbujaMensaje, type AccionesBurbuja, type AutorBurbuja } from './burbuja-mensaje'
import { SeparadorFecha, SeparadorNoLeidos } from './separador-fecha'

interface ListaMensajesProps {
  mensajes: Mensaje[]
  miembros: MiembroChat[]
  miIntegranteId: string
  esGrupo: boolean
  agentes: Map<string, { nombre: string; color: string | null }>
  cargando: boolean
  primerNoLeido: number
  noLeidos: number
  acciones: AccionesBurbuja
  contenedor: React.RefObject<HTMLDivElement | null>
  alScroll: () => void
  bajar: (suave?: boolean) => void
  lejosDelFondo: boolean
  pendientes: number
  fechaFlotante: string | null
}

/** IDs que llegaron después de abrir el hilo: solo esos animan su entrada. */
function useIdsNuevos(mensajes: Mensaje[], cargando: boolean): Set<string> {
  const vistos = useRef<Set<string> | null>(null)
  const [nuevos, setNuevos] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (cargando) return
    if (!vistos.current) {
      vistos.current = new Set(mensajes.map((m) => m.id))
      return
    }
    const frescos = mensajes.filter((m) => !vistos.current?.has(m.id))
    if (frescos.length === 0) return
    frescos.forEach((m) => vistos.current?.add(m.id))
    setNuevos((previos) => new Set([...previos, ...frescos.map((m) => m.id)]))
  }, [mensajes, cargando])
  return nuevos
}

export function ListaMensajes(props: ListaMensajesProps) {
  const { mensajes, miembros, miIntegranteId, contenedor, alScroll, bajar, lejosDelFondo, pendientes, fechaFlotante } = props
  const nuevos = useIdsNuevos(mensajes, props.cargando)
  const grupos = useMemo(() => agruparRachas(mensajes), [mensajes])
  const miembroPorId = useMemo(() => new Map(miembros.map((m) => [m.integrante_id, m])), [miembros])
  const porMensaje = useMemo(() => new Map(mensajes.map((m) => [m.id, m])), [mensajes])

  const autorDe = (m: Mensaje): AutorBurbuja | undefined => {
    const agente = m.agente_id ? props.agentes.get(m.agente_id) : undefined
    if (agente) return { nombre: agente.nombre, color: agente.color, esAgente: true }
    const persona = m.autor_id ? miembroPorId.get(m.autor_id) : undefined
    return persona ? { nombre: persona.nombre, color: persona.color, esAgente: false } : undefined
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={contenedor}
        onScroll={alScroll}
        role="log"
        aria-live="polite"
        aria-label="Mensajes de la conversación"
        className="chat-fondo h-full overflow-y-auto overflow-x-hidden pb-2 pt-3"
      >
        <div className="flex min-h-full flex-col justify-end">
          {props.cargando ? (
            <div className="grid flex-1 place-items-center">
              <Loader2Icon size={20} className="animate-spin text-[var(--chat-meta)]" />
            </div>
          ) : mensajes.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-[var(--chat-meta)]">Todavía no hay mensajes. Escribe el primero.</p>
          ) : (
            grupos.map(({ mensaje: m, iniciaRacha }, i) => {
              const diaNuevo = abreDiaNuevo(m.created_at, mensajes[i - 1]?.created_at)
              const mio = m.autor_id === miIntegranteId
              const citado = m.responder_a ? porMensaje.get(m.responder_a) : undefined
              return (
                <Fragment key={m.id}>
                  {diaNuevo && <SeparadorFecha fecha={m.created_at} />}
                  {i === props.primerNoLeido && <SeparadorNoLeidos cantidad={props.noLeidos} />}
                  <BurbujaMensaje
                    mensaje={m}
                    mio={mio}
                    inicioRacha={iniciaRacha || diaNuevo || i === props.primerNoLeido}
                    esGrupo={props.esGrupo}
                    autor={autorDe(m)}
                    tick={mio ? estadoTicks(m, miembros, miIntegranteId) : undefined}
                    citado={citado}
                    autorCitado={citado?.autor_id ? miembroPorId.get(citado.autor_id) : undefined}
                    animar={nuevos.has(m.id)}
                    acciones={props.acciones}
                  />
                </Fragment>
              )
            })
          )}
        </div>
      </div>

      {fechaFlotante && (
        <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
          <span className="chat-fecha-flotante">{fechaFlotante}</span>
        </div>
      )}

      {lejosDelFondo && (
        <button
          onClick={() => bajar(true)}
          aria-label={pendientes ? `Bajar, ${pendientes} mensajes nuevos` : 'Bajar al último mensaje'}
          className="absolute bottom-3 right-3 grid size-11 place-items-center rounded-full border border-[var(--chat-separator)] bg-[var(--tx-bg-secondary)] text-[var(--chat-ink)] shadow-lg"
        >
          <ArrowDownIcon className="size-5" />
          {pendientes > 0 && (
            <span className="absolute -top-2 grid min-w-5 place-items-center rounded-full bg-[var(--chat-accent)] px-1 text-[11px] font-bold text-[var(--tx-accent-fg)]">
              {pendientes > 99 ? '99+' : pendientes}
            </span>
          )}
        </button>
      )}
    </div>
  )
}
