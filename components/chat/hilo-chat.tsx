'use client'

import { useCallback, useMemo, useState } from 'react'
import { useLlamadas } from '@/components/llamadas/proveedor-llamadas'
import { textoPlano } from '@/lib/markdown/mini'
import { copiarTexto } from '@/lib/utils/copiar-texto'
import { cuerpoDemasiadoGrande, MENSAJE_CUERPO_GRANDE } from '@/lib/chat/limite'
import { toast } from '@/lib/toast'
import type { Conversacion, Mensaje } from '@/lib/types/chat'
import { tituloConversacion } from '@/lib/types/chat'
import type { PresenciaIntegrante } from '@/lib/types/presencia'
import type { AgenteChat } from './chat-workspace'
import { BarraFijados } from './barra-fijados'
import { BurbujaMensaje, type AccionesBurbuja } from './burbuja-mensaje'
import { CapasMensaje, type MenuAbierto } from './capas-mensaje'
import { Composer } from './composer'
import { HeaderConversacion } from './header-conversacion'
import { ListaMensajes } from './lista-mensajes'
import { PanelHilo } from './panel-hilo'
import { useAccionesMensaje } from './use-acciones-mensaje'
import { useEnvio } from './use-envio'
import { useMensajesHilo } from './use-mensajes-hilo'
import { useScrollChat } from './use-scroll-chat'
import { useTecladoIos } from './use-teclado'
import type { AccionesMenuMensaje } from './menu-mensaje'

interface HiloChatProps {
  conversacion: Conversacion
  miIntegranteId: string
  enLinea: Set<string>
  disponibilidad: Map<string, PresenciaIntegrante>
  agentes?: AgenteChat[]
  /** Habilita eliminar cualquier mensaje, no solo el propio. */
  soyAdmin?: boolean
  onMensajeEnviado?: (mensaje: Mensaje) => void
  /** Vuelve a la bandeja. */
  onVolver?: () => void
  /** Quién está escribiendo ahora en esta conversación (id de integrante). */
  escribiendoId?: string
  /** Avisa que yo estoy escribiendo (el workspace lo emite con throttle). */
  onEscribiendo?: (conversacionId: string) => void
  /** Total de no leídos en los OTROS chats, para el chevron de atrás. */
  noLeidosOtros?: number
}

const NADA = () => undefined

export function HiloChat(props: HiloChatProps) {
  const { conversacion, miIntegranteId, soyAdmin = false } = props
  useTecladoIos()
  const hilo = useMensajesHilo(conversacion, miIntegranteId)
  const { mensajes, setMensajes, miembros } = hilo
  const miNombre = miembros.find((m) => m.integrante_id === miIntegranteId)?.nombre ?? 'Tú'
  const envio = useEnvio({ conversacionId: conversacion.id, miIntegranteId, setMensajes, onEnviado: props.onMensajeEnviado })
  const acc = useAccionesMensaje(mensajes, setMensajes, hilo.recargar, miNombre)
  const { llamar, conversacionActiva } = useLlamadas()

  const [cita, setCita] = useState<Mensaje | null>(null)
  const [editando, setEditando] = useState<Mensaje | null>(null)
  const [hiloAbierto, setHiloAbierto] = useState<Mensaje | null>(null)
  const [menu, setMenu] = useState<MenuAbierto | null>(null)
  const [borrando, setBorrando] = useState<Mensaje | null>(null)
  const [info, setInfo] = useState<Mensaje | null>(null)
  const [reenviando, setReenviando] = useState<Mensaje | null>(null)

  const ultimo = mensajes[mensajes.length - 1]
  const scroll = useScrollChat({
    cantidad: mensajes.length,
    ultimoEsMio: ultimo?.autor_id === miIntegranteId,
    cargando: hilo.cargando,
    primerNoLeido: hilo.primerNoLeido,
  })
  const { irAMensaje } = scroll

  const agentes = useMemo(() => new Map((props.agentes ?? []).map((a) => [a.id, a])), [props.agentes])
  const titulo = tituloConversacion(conversacion, miIntegranteId)

  const fijar = useCallback(async (m: Mensaje) => {
    await acc.fijar(m)
    await hilo.recargarFijados()
  }, [acc, hilo])

  const abrirMenu = useCallback((mensaje: Mensaje, el: HTMLElement, punto?: { x: number; y: number }) => {
    const r = el.getBoundingClientRect()
    setMenu({ mensaje, rect: { top: r.top, left: r.left, right: r.right, width: r.width, height: r.height }, punto })
  }, [])

  const acciones: AccionesBurbuja = useMemo(() => ({
    responder: (m) => { setEditando(null); setCita(m) },
    abrirHilo: setHiloAbierto,
    reaccionar: (m, emoji) => void acc.reaccionar(m, emoji),
    abrirMenu,
    reintentar: envio.reintentar,
    irA: irAMensaje,
  }), [acc, abrirMenu, envio.reintentar, irAMensaje])

  const accionesMenu = (m: Mensaje): AccionesMenuMensaje => ({
    reaccionar: (emoji) => void acc.reaccionar(m, emoji),
    responder: () => acciones.responder(m),
    hilo: () => setHiloAbierto(m),
    reenviar: () => setReenviando(m),
    copiar: () => void copiarTexto(textoPlano(m.contenido ?? ''), 'Mensaje copiado'),
    editar: () => { setCita(null); setEditando(m) },
    fijar: () => void fijar(m),
    info: () => setInfo(m),
    eliminar: () => setBorrando(m),
  })

  const enviar = (datos: { contenido: string; archivos: File[] }) => {
    if (cuerpoDemasiadoGrande(datos.contenido)) {
      toast.error(MENSAJE_CUERPO_GRANDE)
      return false
    }
    void envio.enviar({ ...datos, responder_a: cita?.id })
    setCita(null)
    return true
  }

  const quienEscribe = miembros.find((m) => m.integrante_id === props.escribiendoId)
  const textoEscribiendo = !props.escribiendoId
    ? undefined
    : conversacion.tipo === 'dm' ? 'escribiendo…' : `${quienEscribe?.nombre ?? 'Alguien'} está escribiendo…`

  const porId = useMemo(() => new Map(miembros.map((m) => [m.integrante_id, m])), [miembros])
  const nombreCita = cita ? (cita.autor_id === miIntegranteId ? 'Tú' : porId.get(cita.autor_id ?? '')?.nombre) : undefined

  return (
    <div className="flex h-full min-h-0 w-full">
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-[var(--chat-bg)]">
        <HeaderConversacion
          conversacion={{ ...conversacion, miembros }}
          miIntegranteId={miIntegranteId}
          enLinea={props.enLinea}
          disponibilidad={props.disponibilidad}
          escribiendo={textoEscribiendo}
          noLeidosOtros={props.noLeidosOtros ?? 0}
          hayLlamada={conversacionActiva === conversacion.id}
          onVolver={props.onVolver ?? NADA}
          onLlamar={(conVideo) => llamar(conversacion.id, { titulo, conVideo })}
        />
        <BarraFijados mensajes={hilo.fijados} onIr={irAMensaje} onQuitar={(m) => void fijar(m)} />
        <ListaMensajes
          mensajes={mensajes}
          miembros={miembros}
          miIntegranteId={miIntegranteId}
          esGrupo={conversacion.tipo !== 'dm'}
          agentes={agentes}
          cargando={hilo.cargando}
          primerNoLeido={hilo.primerNoLeido}
          noLeidos={hilo.noLeidosIniciales}
          acciones={acciones}
          contenedor={scroll.contenedor}
          alScroll={scroll.alScroll}
          bajar={scroll.bajar}
          lejosDelFondo={scroll.lejosDelFondo}
          pendientes={scroll.pendientes}
          fechaFlotante={scroll.fechaFlotante}
        />
        <Composer
          cita={cita}
          nombreCita={nombreCita}
          editando={editando}
          subiendo={envio.subiendo}
          onCancelarCita={() => setCita(null)}
          onCancelarEdicion={() => setEditando(null)}
          onEnviar={enviar}
          onEditar={acc.editar}
          onEscribiendo={() => props.onEscribiendo?.(conversacion.id)}
        />
      </div>

      {hiloAbierto && (
        <PanelHilo
          conversacion={conversacion}
          padre={hiloAbierto}
          miembros={porId}
          onCerrar={() => setHiloAbierto(null)}
          onRespondido={(padreId) =>
            setMensajes((prev) => prev.map((m) => (m.id === padreId ? { ...m, respuestas: (m.respuestas ?? 0) + 1 } : m)))
          }
        />
      )}

      <CapasMensaje
        menu={menu}
        miIntegranteId={miIntegranteId}
        soyAdmin={soyAdmin}
        miembros={miembros}
        borrando={borrando}
        info={info}
        reenviando={reenviando}
        accionesMenu={accionesMenu}
        renderBurbuja={(m) => (
          <BurbujaMensaje
            mensaje={m}
            mio={m.autor_id === miIntegranteId}
            inicioRacha
            esGrupo={conversacion.tipo !== 'dm'}
            animar={false}
            acciones={acciones}
          />
        )}
        onCerrarMenu={() => setMenu(null)}
        onCerrarBorrado={() => setBorrando(null)}
        onConfirmarBorrado={(m) => void acc.eliminar(m)}
        onCerrarInfo={() => setInfo(null)}
        onCerrarReenvio={() => setReenviando(null)}
        onReenviar={acc.reenviar}
      />
    </div>
  )
}
