'use client'

import { useMemo, useState } from 'react'
import { MessagesSquareIcon } from 'lucide-react'
import { useLlamadas } from '@/components/llamadas/proveedor-llamadas'
import { toast } from '@/lib/toast'
import type { Conversacion } from '@/lib/types/chat'
import { HiloChat } from './hilo-chat'
import { ListaConversaciones } from './lista-conversaciones'
import { useConversaciones } from './use-conversaciones'
import { useDisponibilidad } from './use-disponibilidad'
import { useEscribiendo } from './use-escribiendo'
import { useNavegacionChat } from './use-navegacion-chat'
import { usePresencia } from './use-presencia'
import { useSalasVoz } from './use-salas-voz'
import { useIsNarrowViewport } from '@/lib/hooks/use-is-narrow-viewport'

export interface IntegranteChat {
  id: string
  nombre: string
  avatar_url: string | null
  color: string | null
}

export interface AgenteChat {
  id: string
  nombre: string
  color: string | null
  avatar_url: string | null
}

interface ChatWorkspaceProps {
  conversacionesIniciales: Conversacion[]
  equipo: IntegranteChat[]
  agentes?: AgenteChat[]
  /** Eliminar cualquier mensaje, no solo el propio. */
  soyAdmin?: boolean
  miIntegranteId: string
  /** Conversación a abrir de entrada (viene del ?c= de una notificación push o enlace). */
  conversacionInicialId?: string
}

const estaSilenciada = (c: Conversacion, ahora: number) =>
  Boolean(c.silenciado_hasta && new Date(c.silenciado_hasta).getTime() > ahora)

/**
 * Lista de chats + conversación. En móvil la conversación es una pantalla que entra
 * desde la derecha (push de iOS) y vive en la URL; en escritorio, dos paneles.
 */
export function ChatWorkspace(props: ChatWorkspaceProps) {
  const { miIntegranteId } = props
  const bandeja = useConversaciones(
    props.conversacionesIniciales.map((c) => (c.id === props.conversacionInicialId ? { ...c, no_leidos: 0 } : c)),
  )
  const nav = useNavegacionChat(props.conversacionInicialId)
  const { escribiendo, emitir } = useEscribiendo(miIntegranteId)
  const enSalas = useSalasVoz()
  const enLinea = usePresencia(miIntegranteId)
  const disponibilidad = useDisponibilidad()
  const { llamar } = useLlamadas()
  const [abriendo, setAbriendo] = useState(false)
  const { conversaciones, setConversaciones } = bandeja

  const activa = useMemo(
    () => conversaciones.find((c) => c.id === nav.mostradaId) ?? null,
    [conversaciones, nav.mostradaId],
  )

  // Los no leídos de los OTROS chats, para el chevron de atrás. `ahora` se fija una vez por cambio de lista.
  const noLeidosOtros = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity
    const ahora = Date.now()
    return conversaciones
      .filter((c) => c.id !== nav.mostradaId && c.tipo !== 'voz' && !c.archivado_at && !estaSilenciada(c, ahora))
      .reduce((total, c) => total + c.no_leidos, 0)
  }, [conversaciones, nav.mostradaId])

  const abrir = (id: string) => {
    setConversaciones((previas) => previas.map((c) => (c.id === id && c.no_leidos > 0 ? { ...c, no_leidos: 0 } : c)))
    nav.abrir(id)
  }

  const crear = async (payload: { tipo: 'dm' | 'grupo'; nombre?: string; miembros: string[] }) => {
    setAbriendo(true)
    try {
      const res = await fetch('/api/chat/conversaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? 'No se pudo crear')
      await bandeja.refrescar()
      abrir(json.data.id as string)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error creando la conversación')
    } finally {
      setAbriendo(false)
    }
  }

  // Solo en el teléfono la conversación tapa la lista; en escritorio conviven lado a
  // lado y la lista tiene que seguir recibiendo clics para cambiar de chat.
  const esTelefono = useIsNarrowViewport(768)
  const detras = esTelefono && Boolean(nav.mostradaId) && !nav.saliendo

  return (
    <div className="chat-workspace relative flex h-full min-h-0 md:gap-3">
      <div
        className="chat-lista-empuje h-full min-h-0 w-full overflow-hidden md:w-auto md:rounded-xl md:border md:border-[var(--border)]"
        data-detras={detras}
        inert={detras || undefined}
      >
        <ListaConversaciones
          conversaciones={conversaciones}
          activaId={nav.activaId}
          miIntegranteId={miIntegranteId}
          equipo={props.equipo}
          escribiendo={escribiendo}
          enSalas={enSalas}
          abriendo={abriendo}
          onCrear={crear}
          onAbrir={abrir}
          onSala={(sala) => llamar(sala.id, { titulo: sala.nombre ?? 'Sala de voz' })}
          onPreferencia={bandeja.preferencia}
          onMarcarLeida={bandeja.marcarLeida}
        />
      </div>

      <section
        className={`${nav.mostradaId ? 'chat-conv-pantalla flex' : 'hidden md:flex'} min-h-0 min-w-0 flex-1 overflow-hidden md:rounded-xl md:border md:border-[var(--border)]`}
        data-saliendo={nav.saliendo}
        data-arrastrando={nav.arrastre > 0}
        style={{ ['--chat-arrastre' as string]: `${nav.arrastre}px` }}
        {...nav.gestosAtras}
      >
        {activa ? (
          <HiloChat
            key={activa.id}
            conversacion={activa}
            miIntegranteId={miIntegranteId}
            enLinea={enLinea}
            disponibilidad={disponibilidad}
            agentes={props.agentes}
            soyAdmin={props.soyAdmin}
            onMensajeEnviado={bandeja.alEnviar}
            onVolver={nav.volver}
            escribiendoId={escribiendo.get(activa.id)}
            onEscribiendo={emitir}
            noLeidosOtros={noLeidosOtros}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-[var(--chat-meta)]">
            <MessagesSquareIcon size={32} strokeWidth={1.5} className="opacity-40" />
            <p className="text-[13px]">Elige una conversación para empezar</p>
          </div>
        )}
      </section>
    </div>
  )
}
