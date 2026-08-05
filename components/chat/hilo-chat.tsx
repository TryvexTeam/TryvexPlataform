'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronLeftIcon, PaperclipIcon, PinIcon, SendIcon, XIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/lib/toast'
import type { Conversacion, Mensaje, MiembroChat } from '@/lib/types/chat'
import { avatarConversacion, pesoLegible, tituloConversacion } from '@/lib/types/chat'
import {
  PRESENCIA_LABEL,
  detallePresencia,
  estadoVisible,
  type PresenciaIntegrante,
} from '@/lib/types/presencia'
import { Markdown } from '@/components/shared/markdown'
import { AvatarChat } from './avatar-chat'
import { AdjuntosMensaje } from './adjuntos-mensaje'
import { AccionesMensaje } from './acciones-mensaje'
import { ReaccionesMensaje } from './reacciones-mensaje'
import { GestosMensaje } from './gestos-mensaje'
import { CitaMensaje } from './cita-mensaje'
import { PanelHilo } from './panel-hilo'
import type { AgenteChat } from './chat-workspace'

interface HiloChatProps {
  conversacion: Conversacion
  miIntegranteId: string
  enLinea: Set<string>
  disponibilidad: Map<string, PresenciaIntegrante>
  agentes?: AgenteChat[]
  /** Habilita eliminar cualquier mensaje, no solo el propio. */
  soyAdmin?: boolean
  onMensajeEnviado?: (mensaje: Mensaje) => void
  /** Vuelve a la bandeja. Solo se ve en móvil, donde el hilo ocupa la pantalla. */
  onVolver?: () => void
}

const MAX_ARCHIVOS = 10

const HORA = new Intl.DateTimeFormat('es-CL', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Santiago',
})

export function HiloChat({
  conversacion,
  miIntegranteId,
  enLinea,
  disponibilidad,
  agentes = [],
  soyAdmin = false,
  onMensajeEnviado,
  onVolver,
}: HiloChatProps) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [borrador, setBorrador] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [porEnviar, setPorEnviar] = useState<File[]>([])
  const [citando, setCitando] = useState<Mensaje | null>(null)
  const [hiloAbierto, setHiloAbierto] = useState<Mensaje | null>(null)
  const [cargando, setCargando] = useState(true)
  const [fijados, setFijados] = useState<Mensaje[]>([])
  const [fijadosAbiertos, setFijadosAbiertos] = useState(false)
  const finRef = useRef<HTMLDivElement>(null)
  const cajaRef = useRef<HTMLTextAreaElement>(null)
  const archivosRef = useRef<HTMLInputElement>(null)

  const porId = new Map<string, MiembroChat>(conversacion.miembros.map((m) => [m.integrante_id, m]))
  const agentePorId = new Map(agentes.map((a) => [a.id, a]))
  const titulo = tituloConversacion(conversacion, miIntegranteId)
  const otro = conversacion.miembros.find((m) => m.integrante_id !== miIntegranteId)
  const presenciaOtro = otro ? disponibilidad.get(otro.integrante_id) : undefined
  const estadoOtro = otro ? estadoVisible(presenciaOtro, enLinea.has(otro.integrante_id)) : undefined

  // Historial al abrir el hilo.
  useEffect(() => {
    let vigente = true

    fetch(`/api/chat/mensajes?conversacion=${conversacion.id}`)
      .then((r) => r.json())
      .then((json) => {
        if (!vigente) return
        if (json.success) setMensajes(json.data as Mensaje[])
        else toast.error(json.error ?? 'No se pudieron cargar los mensajes')
      })
      .catch(() => vigente && toast.error('Error de red al cargar el chat'))
      .finally(() => vigente && setCargando(false))

    return () => {
      vigente = false
    }
  }, [conversacion.id])

  /**
   * Los fijados van en su propia consulta y no se derivan de `mensajes`: lo fijado
   * suele ser viejo —el link del deploy, el acuerdo de la semana pasada— y quedaría
   * fuera de los últimos 100 mensajes que carga el hilo. Justo lo que se quiere tener
   * a mano es lo que ya no está a la vista.
   */
  useEffect(() => {
    let vigente = true

    fetch(`/api/chat/mensajes?conversacion=${conversacion.id}&fijados=1`)
      .then((r) => r.json())
      .then((json) => {
        if (vigente && json.success) setFijados(json.data as Mensaje[])
      })
      // Sin fijados el chat funciona igual: no vale un toast de error.
      .catch(() => {})

    return () => {
      vigente = false
    }
  }, [conversacion.id])

  // Mensajes nuevos en vivo, sin recargar.
  useEffect(() => {
    const supabase = createClient()
    const canal = supabase
      .channel(`mensajes-${conversacion.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensajes',
          filter: `conversacion_id=eq.${conversacion.id}`,
        },
        (payload) => {
          const nuevo = payload.new as Mensaje
          // El propio ya se agregó al enviar: no duplicarlo.
          setMensajes((previos) => (previos.some((m) => m.id === nuevo.id) ? previos : [...previos, nuevo]))
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(canal)
    }
  }, [conversacion.id])

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes.length])

  /**
   * La caja crece con el texto. Con `rows={1}` fijo, un Shift+Enter metía el salto
   * pero la altura no cambiaba: la línea nueva empujaba a la anterior fuera de
   * vista y parecía que el texto desaparecía.
   *
   * Se baja a 'auto' antes de medir porque scrollHeight nunca decrece por sí solo:
   * sin eso la caja crecería y no volvería a achicarse al borrar.
   */
  useEffect(() => {
    const caja = cajaRef.current
    if (!caja) return
    caja.style.height = 'auto'
    caja.style.height = `${caja.scrollHeight}px`
  }, [borrador])

  const enviar = async () => {
    const contenido = borrador.trim()
    // Una foto sola ya es un mensaje: no hace falta escribir nada.
    if ((!contenido && porEnviar.length === 0) || enviando) return

    setEnviando(true)
    try {
      // Con archivos va como formulario, para que texto y adjuntos entren en un
      // solo viaje y no quede una subida huérfana si el mensaje falla.
      let res: Response
      if (porEnviar.length > 0) {
        const cuerpo = new FormData()
        cuerpo.append('conversacion_id', conversacion.id)
        if (contenido) cuerpo.append('contenido', contenido)
        if (citando) cuerpo.append('responder_a', citando.id)
        for (const f of porEnviar) cuerpo.append('archivos', f)
        res = await fetch('/api/chat/mensajes', { method: 'POST', body: cuerpo })
      } else {
        res = await fetch('/api/chat/mensajes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversacion_id: conversacion.id,
            contenido,
            responder_a: citando?.id,
          }),
        })
      }

      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? 'No se pudo enviar')

      const mensaje = json.data as Mensaje
      setMensajes((previos) => (previos.some((m) => m.id === mensaje.id) ? previos : [...previos, mensaje]))
      setBorrador('')
      setPorEnviar([])
      setCitando(null)
      onMensajeEnviado?.(mensaje)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error enviando el mensaje')
    } finally {
      setEnviando(false)
    }
  }

  /**
   * Pone o saca un emoji.
   *
   * Se pinta antes de que responda el servidor: una reacción que tarda medio segundo
   * en aparecer se siente rota, y es la interacción más liviana del chat. Si el POST
   * falla, se revierte y se avisa.
   */
  const alternarReaccion = async (mensaje: Mensaje, emoji: string) => {
    const aplicar = (lista: Mensaje[], invertir: boolean) =>
      lista.map((m) => {
        if (m.id !== mensaje.id) return m

        const actuales = m.reacciones ?? []
        const existente = actuales.find((r) => r.emoji === emoji)
        const mia = existente?.mia ?? false
        const suma = invertir ? (mia ? 1 : -1) : mia ? -1 : 1

        // Quitar la última reacción de un emoji borra la píldora entera.
        if (existente && existente.cuenta + suma <= 0) {
          return { ...m, reacciones: actuales.filter((r) => r.emoji !== emoji) }
        }

        if (!existente) {
          return {
            ...m,
            reacciones: [...actuales, { emoji, cuenta: 1, mia: true, quienes: ['Tú'] }],
          }
        }

        return {
          ...m,
          reacciones: actuales.map((r) =>
            r.emoji === emoji ? { ...r, cuenta: r.cuenta + suma, mia: !r.mia } : r,
          ),
        }
      })

    setMensajes((previos) => aplicar(previos, false))

    try {
      const res = await fetch(`/api/chat/mensajes/${mensaje.id}/reacciones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? 'No se pudo reaccionar')
    } catch (err) {
      setMensajes((previos) => aplicar(previos, true))
      toast.error(err instanceof Error ? err.message : 'Error al reaccionar')
    }
  }

  /** Fija o suelta un mensaje para toda la conversación, no solo para quien mira. */
  const alternarFijado = async (mensaje: Mensaje) => {
    const fijar = !mensaje.fijado_at
    const marca = fijar ? new Date().toISOString() : null

    setMensajes((previos) =>
      previos.map((m) => (m.id === mensaje.id ? { ...m, fijado_at: marca } : m)),
    )
    // La barra del tope se actualiza en el mismo gesto: si esperara al servidor,
    // el mensaje quedaría marcado como fijado sin aparecer arriba.
    setFijados((previos) =>
      fijar
        ? [{ ...mensaje, fijado_at: marca }, ...previos.filter((f) => f.id !== mensaje.id)]
        : previos.filter((f) => f.id !== mensaje.id),
    )

    try {
      const res = await fetch(`/api/chat/mensajes/${mensaje.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fijar }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? 'No se pudo fijar')
      toast.success(fijar ? 'Mensaje fijado' : 'Ya no está fijado')
    } catch (err) {
      setMensajes((previos) =>
        previos.map((m) => (m.id === mensaje.id ? { ...m, fijado_at: mensaje.fijado_at } : m)),
      )
      setFijados((previos) =>
        fijar
          ? previos.filter((f) => f.id !== mensaje.id)
          : [mensaje, ...previos.filter((f) => f.id !== mensaje.id)],
      )
      toast.error(err instanceof Error ? err.message : 'Error al fijar')
    }
  }

  const borrar = async (mensaje: Mensaje) => {
    const conHilo = (mensaje.respuestas ?? 0) > 0
    const aviso = conHilo
      ? `Se elimina el mensaje y sus ${mensaje.respuestas} respuestas. No se puede deshacer.`
      : 'Se elimina para todos y no se puede deshacer.'
    if (!confirm(aviso)) return
    try {
      const res = await fetch(`/api/chat/mensajes/${mensaje.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? 'No se pudo eliminar')
      // Se va de la lista, no queda tachado: la fila ya no existe en la base.
      // Si abrió un hilo, el CASCADE se llevó también sus respuestas.
      setMensajes((previos) => previos.filter((m) => m.id !== mensaje.id && m.hilo_padre !== mensaje.id))
      if (hiloAbierto?.id === mensaje.id) setHiloAbierto(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error eliminando el mensaje')
    }
  }

  const sumarArchivos = (nuevos: FileList | null) => {
    if (!nuevos?.length) return
    setPorEnviar((previos) => [...previos, ...Array.from(nuevos)].slice(0, MAX_ARCHIVOS))
  }

  return (
    <div className="flex h-full min-h-0 w-full">
    <div className="flex flex-col h-full min-h-0 flex-1 min-w-0">
      <header className="flex items-center gap-3 px-3 sm:px-5 py-3 border-b border-[var(--border)] shrink-0">
        {onVolver && (
          <button
            onClick={onVolver}
            aria-label="Volver a la bandeja"
            className="md:hidden -ml-1 p-1 text-[var(--tx-ink-muted)] hover:text-[var(--tx-ink-primary)]"
          >
            <ChevronLeftIcon className="size-5" />
          </button>
        )}
        <AvatarChat
          nombre={titulo}
          avatarUrl={avatarConversacion(conversacion, miIntegranteId).url}
          color={avatarConversacion(conversacion, miIntegranteId).color}
          estado={conversacion.tipo === 'dm' ? estadoOtro : undefined}
          size={36}
        />
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-[var(--tx-ink-primary)] truncate">{titulo}</p>
          <p className="text-[12px] text-[var(--tx-ink-muted)]">
            {conversacion.tipo !== 'dm'
              ? `${conversacion.miembros.length} integrantes`
              : (detallePresencia(presenciaOtro) ??
                 (estadoOtro ? PRESENCIA_LABEL[estadoOtro] : 'Sin datos'))}
          </p>
        </div>
      </header>

      {/* Fijados: lo que hay que tener a mano sin buscarlo. Se muestra el más
          reciente y, si hay más, se despliegan. Mostrarlos todos siempre le comería
          media pantalla al hilo, que es lo que uno vino a leer. */}
      {fijados.length > 0 && (
        <div className="shrink-0 border-b border-[var(--border)] bg-[oklch(100%_0_0_/_3%)] px-3 sm:px-5 py-2">
          <button
            onClick={() => setFijadosAbiertos((v) => !v)}
            aria-expanded={fijadosAbiertos}
            className="flex w-full items-center gap-2 text-left"
          >
            <PinIcon className="size-3 shrink-0 text-[var(--tx-ink-muted)]" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--tx-ink-muted)]">
              {fijadosAbiertos
                ? `${fijados.length} ${fijados.length === 1 ? 'mensaje fijado' : 'mensajes fijados'}`
                : (fijados[0].contenido ?? 'Adjunto')}
            </span>
            {fijados.length > 1 && (
              <span className="shrink-0 text-[11px] text-[var(--tx-ink-muted)]">
                {fijadosAbiertos ? 'ocultar' : `+${fijados.length - 1}`}
              </span>
            )}
          </button>

          {fijadosAbiertos && (
            <ul className="mt-2 space-y-1.5">
              {fijados.map((f) => (
                <li key={f.id} className="flex items-start gap-2">
                  <span className="min-w-0 flex-1 text-[12px] text-[var(--tx-ink-primary)]">
                    {f.contenido ?? 'Adjunto'}
                  </span>
                  <button
                    onClick={() => alternarFijado(f)}
                    className="shrink-0 text-[11px] text-[var(--tx-ink-muted)] hover:text-[var(--tx-ink-primary)]"
                  >
                    quitar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 sm:px-5 py-4 space-y-2">
        {cargando ? (
          <p className="text-sm text-[var(--tx-ink-muted)]">Cargando…</p>
        ) : mensajes.length === 0 ? (
          <p className="text-sm text-[var(--tx-ink-muted)]">
            Todavía no hay mensajes. Escribe el primero.
          </p>
        ) : (
          mensajes.map((m, i) => {
            const mio = m.autor_id === miIntegranteId
            // Un mensaje lo escribe una persona O un agente, nunca los dos: el
            // constraint de la 024 lo garantiza en la base.
            const agente = m.agente_id ? agentePorId.get(m.agente_id) : undefined
            const persona = m.autor_id ? porId.get(m.autor_id) : undefined
            const autor = agente
              ? { nombre: agente.nombre, avatar_url: agente.avatar_url, color: agente.color }
              : persona
            const previo = mensajes[i - 1]
            const encadenado =
              i > 0 && previo.autor_id === m.autor_id && previo.agente_id === m.agente_id

            return (
              <GestosMensaje
                key={m.id}
                puedeBorrar={mio || soyAdmin}
                onResponder={() => setCitando(m)}
                onAbrirHilo={() => setHiloAbierto(m)}
                onBorrar={() => borrar(m)}
              >
              <div className={`flex gap-2 min-w-0 ${mio ? 'justify-end' : 'justify-start'}`}>
                {/* La foto va en todos los hilos, no solo en grupos: es la cara de
                    quien habla y en un DM también se quiere ver. El hueco de 28px
                    mantiene alineadas las burbujas encadenadas. */}
                {!mio && (
                  <div className="w-7 shrink-0">
                    {!encadenado && (
                      <AvatarChat
                        nombre={autor?.nombre ?? '?'}
                        avatarUrl={autor?.avatar_url}
                        color={autor?.color}
                        size={28}
                      />
                    )}
                  </div>
                )}

                <div className={`max-w-[85%] sm:max-w-[68%] min-w-0 ${mio ? 'items-end' : 'items-start'} flex flex-col group`}>
                  {!mio && conversacion.tipo !== 'dm' && !encadenado && (
                    <span className="flex items-center gap-1.5 text-[11px] text-[var(--tx-ink-muted)] px-1 mb-0.5">
                      {autor?.nombre ?? 'Sin nombre'}
                      {/* Saber si habla una persona o un agente cambia cómo se lee
                          el mensaje. No es decoración. */}
                      {agente && (
                        <span
                          className="rounded px-1 py-px text-[9px] font-semibold uppercase tracking-wide"
                          style={{ background: 'var(--tx-accent-subtle)', color: 'var(--tx-ink-primary)' }}
                        >
                          agente
                        </span>
                      )}
                    </span>
                  )}
                  <div
                    className="px-3.5 py-2 text-[14px] leading-snug break-words max-w-full overflow-hidden"
                    style={{
                      borderRadius: 18,
                      background: mio ? 'var(--tx-accent)' : 'rgba(255,255,255,0.06)',
                      color: mio ? 'var(--tx-accent-fg)' : 'var(--tx-ink-primary)',
                    }}
                  >
                    {m.responder_a && (
                      <CitaMensaje
                        citado={mensajes.find((x) => x.id === m.responder_a)}
                        autor={(() => {
                          const c = mensajes.find((x) => x.id === m.responder_a)
                          return c?.autor_id ? porId.get(c.autor_id) : undefined
                        })()}
                      />
                    )}
                    {m.adjuntos && m.adjuntos.length > 0 && (
                      <div className={m.contenido ? 'mb-1.5' : ''}>
                        <AdjuntosMensaje adjuntos={m.adjuntos} />
                      </div>
                    )}
                    {/* heredaColor: el mensaje propio va sobre el acento y el markdown
                        no puede imponer el suyo o quedaría ilegible. */}
                    {m.eliminado_at ? (
                      <span className="text-[13px] italic opacity-60">Mensaje eliminado</span>
                    ) : (
                      m.contenido && (
                        <Markdown chat heredaColor className="text-[14px]">
                          {m.contenido}
                        </Markdown>
                      )
                    )}
                  </div>
                  {(m.respuestas ?? 0) > 0 && (
                    <button
                      onClick={() => setHiloAbierto(m)}
                      className="mt-1 text-[11px] font-medium text-[var(--tx-accent-2)] hover:underline"
                    >
                      {m.respuestas} {m.respuestas === 1 ? 'respuesta' : 'respuestas'}
                    </button>
                  )}

                  {/* Las reacciones sí se ven y se tocan en el teléfono: son el
                      camino corto para responder sin escribir. */}
                  <ReaccionesMensaje
                    reacciones={m.reacciones ?? []}
                    onAlternar={(emoji) => alternarReaccion(m, emoji)}
                  />

                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-[var(--tx-ink-muted)] px-1">
                      {HORA.format(new Date(m.created_at))}
                    </span>
                    {m.fijado_at && (
                      <span
                        className="flex items-center gap-0.5 text-[10px] text-[var(--tx-ink-muted)]"
                        title="Fijado en la conversación"
                      >
                        <PinIcon className="size-2.5" aria-hidden />
                        fijado
                      </span>
                    )}
                    {/* Solo con mouse: en el teléfono se usa deslizar o mantener
                        presionado, que no requieren apuntar a un botón de 28px. */}
                    <span className="hidden md:contents">
                      <AccionesMensaje
                        puedeBorrar={mio || soyAdmin}
                        fijado={Boolean(m.fijado_at)}
                        onResponder={() => setCitando(m)}
                        onAbrirHilo={() => setHiloAbierto(m)}
                        onBorrar={() => borrar(m)}
                        onReaccionar={(emoji) => alternarReaccion(m, emoji)}
                        onFijar={() => alternarFijado(m)}
                      />
                    </span>
                  </div>
                </div>
              </div>
              </GestosMensaje>
            )
          })
        )}
        <div ref={finRef} />
      </div>

      <div className="shrink-0 border-t border-[var(--border)] p-3">
        {citando && (
          <div
            className="flex items-start gap-2 mb-2 rounded-lg px-3 py-2"
            style={{ background: 'rgba(255,255,255,0.05)' }}
          >
            <div className="min-w-0 flex-1 text-[var(--tx-ink-primary)]">
              <CitaMensaje
                citado={citando}
                autor={citando.autor_id ? porId.get(citando.autor_id) : undefined}
              />
            </div>
            <button
              onClick={() => setCitando(null)}
              aria-label="Cancelar respuesta"
              className="shrink-0 p-0.5 text-[var(--tx-ink-muted)] hover:text-[var(--tx-ink-primary)]"
            >
              <XIcon className="size-4" />
            </button>
          </div>
        )}

        {porEnviar.length > 0 && (
          <ul className="flex flex-wrap gap-2 mb-2">
            {porEnviar.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="flex items-center gap-2 rounded-lg pl-2.5 pr-1.5 py-1 text-[12px]"
                style={{ background: 'rgba(255,255,255,0.06)' }}
              >
                <span className="max-w-[160px] truncate text-[var(--tx-ink-primary)]">{f.name}</span>
                <span className="text-[var(--tx-ink-muted)]">{pesoLegible(f.size)}</span>
                <button
                  onClick={() => setPorEnviar((previos) => previos.filter((_, j) => j !== i))}
                  aria-label={`Quitar ${f.name}`}
                  className="text-[var(--tx-ink-muted)] hover:text-[var(--tx-ink-primary)] p-0.5"
                >
                  <XIcon className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div
          className="flex items-end gap-2 rounded-3xl px-3 sm:px-4 py-2"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)' }}
        >
          <button
            onClick={() => archivosRef.current?.click()}
            disabled={enviando}
            aria-label="Adjuntar archivo"
            className="shrink-0 self-end pb-0.5 text-[var(--tx-ink-muted)] hover:text-[var(--tx-ink-primary)] disabled:opacity-40"
          >
            <PaperclipIcon className="size-5" />
          </button>
          <input
            ref={archivosRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              sumarArchivos(e.target.files)
              e.target.value = ''
            }}
          />
          <textarea
            ref={cajaRef}
            value={borrador}
            onChange={(e) => setBorrador(e.target.value)}
            onKeyDown={(e) => {
              // Enter envía; Shift+Enter hace salto de línea.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                enviar()
              }
            }}
            // Pegar una captura del portapapeles la adjunta, como en Discord.
            onPaste={(e) => {
              const archivos = Array.from(e.clipboardData.files)
              if (archivos.length === 0) return
              e.preventDefault()
              setPorEnviar((previos) => [...previos, ...archivos].slice(0, MAX_ARCHIVOS))
            }}
            rows={1}
            placeholder="Escribe un mensaje…"
            aria-label="Escribe un mensaje"
            // text-base (16px) en móvil: por debajo de 16px iOS hace zoom automático al
            // enfocar el campo, y la pantalla queda descolocada. En escritorio vuelve a 14.
            className="flex-1 bg-transparent resize-none outline-none text-base sm:text-[14px] text-[var(--tx-ink-primary)] max-h-40 overflow-y-auto"
          />
          <button
            onClick={enviar}
            disabled={(!borrador.trim() && porEnviar.length === 0) || enviando}
            aria-label="Enviar mensaje"
            className="shrink-0 disabled:opacity-40 text-[var(--tx-accent)]"
          >
            <SendIcon className="size-5" />
          </button>
        </div>
      </div>
    </div>

      {hiloAbierto && (
        <PanelHilo
          conversacion={conversacion}
          padre={hiloAbierto}
          miembros={porId}
          onCerrar={() => setHiloAbierto(null)}
          onRespondido={(padreId) =>
            setMensajes((previos) =>
              previos.map((m) => (m.id === padreId ? { ...m, respuestas: (m.respuestas ?? 0) + 1 } : m)),
            )
          }
        />
      )}
    </div>
  )
}
