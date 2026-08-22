'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ImageIcon, SendIcon, XIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/lib/toast'
import { pesoLegible, type Mensaje } from '@/lib/types/chat'
import { AdjuntosMensaje } from '@/components/chat/adjuntos-mensaje'

interface ChatLlamadaProps {
  conversacionId: string
  miIntegranteId: string
  nombrePorId: Map<string, string>
  onCerrar: () => void
  /**
   * Interpreta una línea que empieza con `/` como comando de música y devuelve
   * qué contestar en pantalla. Si no está, los comandos se mandan como mensajes.
   */
  onComando?: (linea: string) => Promise<string>
}

/** Ver `use-datos-vivos`: supabase-js cachea canales por nombre. */
let contadorCanal = 0

/** Los mismos que el hilo: es la misma conversación y el mismo endpoint. */
const MAX_ARCHIVOS = 10

const HORA = new Intl.DateTimeFormat('es-CL', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Santiago',
})

/**
 * El chat de la llamada. No es un chat aparte: escribe en la misma conversación
 * del hilo, con los mismos endpoints.
 *
 * Que sea el mismo y no uno efímero es deliberado. En una llamada se pegan links
 * y se dictan IDs, y eso es justo lo que uno vuelve a buscar al día siguiente. Un
 * chat que se borra al colgar pierde lo único que valía la pena guardar.
 */
export function ChatLlamada({
  conversacionId,
  miIntegranteId,
  nombrePorId,
  onCerrar,
  onComando,
}: ChatLlamadaProps) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [borrador, setBorrador] = useState('')
  const [enviando, setEnviando] = useState(false)
  /**
   * La respuesta del último comando de música.
   *
   * Va en el panel y NO en el hilo a propósito: "En cola: Bohemian Rhapsody" le
   * importa a quien lo escribió y en ese momento. Publicarlo dejaría la
   * conversación llena de acuses de recibo que mañana no le sirven a nadie.
   */
  const [respuestaComando, setRespuestaComando] = useState<string | null>(null)
  /** Fotos y archivos elegidos que todavía no se mandan. */
  const [porEnviar, setPorEnviar] = useState<File[]>([])
  const finRef = useRef<HTMLDivElement>(null)
  const archivosRef = useRef<HTMLInputElement>(null)

  /**
   * Los últimos 30: en una llamada nadie se pone a leer el historial, y montar
   * cien burbujas encima del video cuesta caro en el teléfono.
   */
  const recargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/mensajes?conversacion=${conversacionId}`)
      const json = await res.json()
      if (json.success) setMensajes((json.data as Mensaje[]).slice(-30))
    } catch {
      // Silencioso: lo que ya está en pantalla sigue sirviendo, y el próximo
      // mensaje vuelve a intentarlo.
    }
  }, [conversacionId])

  useEffect(() => {
    // El `setState` de `recargar` ocurre después de un await, no en el cuerpo del
    // efecto; la regla no puede verlo a través de la función asíncrona.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void recargar()
  }, [recargar])

  useEffect(() => {
    const supabase = createClient()
    const canal = supabase
      .channel(`chat-llamada-${++contadorCanal}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensajes',
          filter: `conversacion_id=eq.${conversacionId}`,
        },
        (payload) => {
          const nuevo = payload.new as Mensaje
          setMensajes((previos) => (previos.some((m) => m.id === nuevo.id) ? previos : [...previos, nuevo]))

          /**
           * Los adjuntos viven en otra tabla (`mensaje_adjuntos`), así que el aviso
           * de Realtime sobre `mensajes` llega SIN ellos: una foto ajena saldría
           * como burbuja vacía hasta recargar la página.
           *
           * La fila tampoco trae una marca de "lleva archivos" que permita pedir
           * la lista solo cuando hace falta, así que se recarga con cualquier
           * mensaje ajeno. El chat de una llamada mueve pocos mensajes; el propio
           * no gatilla nada porque ya llega completo por la respuesta del POST.
           */
          if (nuevo.autor_id !== miIntegranteId) void recargar()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(canal)
    }
  }, [conversacionId, miIntegranteId, recargar])

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes.length])

  const sumarArchivos = (nuevos: FileList | File[] | null) => {
    if (!nuevos || (nuevos instanceof FileList && nuevos.length === 0)) return
    setPorEnviar((previos) => [...previos, ...Array.from(nuevos)].slice(0, MAX_ARCHIVOS))
  }

  const enviar = async () => {
    const contenido = borrador.trim()
    // Una foto sola ya es un mensaje: no hace falta escribir nada.
    if ((!contenido && porEnviar.length === 0) || enviando) return

    /**
     * Una línea que empieza con `/` es un comando, no un mensaje.
     *
     * Se corta acá y no se manda al hilo. Es lo que evita que un `/plya` mal
     * escrito quede para siempre en la conversación: si el comando no existe se
     * avisa en pantalla, pero tampoco se publica.
     */
    if (onComando && porEnviar.length === 0 && contenido.startsWith('/')) {
      setBorrador('')
      setEnviando(true)
      try {
        setRespuestaComando(await onComando(contenido))
      } catch (err) {
        setRespuestaComando(err instanceof Error ? err.message : 'No se pudo ejecutar el comando')
      } finally {
        setEnviando(false)
      }
      return
    }

    setEnviando(true)
    try {
      // Con archivos va como formulario, para que texto y fotos entren en un solo
      // viaje y no quede una subida huérfana si el mensaje falla.
      let res: Response
      if (porEnviar.length > 0) {
        const cuerpo = new FormData()
        cuerpo.append('conversacion_id', conversacionId)
        if (contenido) cuerpo.append('contenido', contenido)
        for (const f of porEnviar) cuerpo.append('archivos', f)
        res = await fetch('/api/chat/mensajes', { method: 'POST', body: cuerpo })
      } else {
        res = await fetch('/api/chat/mensajes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversacion_id: conversacionId, contenido }),
        })
      }
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? 'No se pudo enviar')

      const mensaje = json.data as Mensaje
      setMensajes((previos) => (previos.some((m) => m.id === mensaje.id) ? previos : [...previos, mensaje]))
      setBorrador('')
      setPorEnviar([])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error enviando el mensaje')
    } finally {
      setEnviando(false)
    }
  }

  return (
    /*
      En el teléfono ocupa toda la fila (la pestaña "Chat" de panel-llamada.tsx
      ya esconde el video y la música mientras esta está activa, así que no
      hace falta flotar sobre nada) -- antes era una hoja `fixed` de 58vh
      sobre el video, y compartir esa franja con video+gente hacía que no se
      distinguiera bien ninguno de los dos. En escritorio es la columna
      angosta de siempre, al lado del video.
    */
    <aside
      className="flex flex-1 min-h-0 flex-col w-full md:w-[320px] md:flex-none md:shrink-0"
      style={{ borderLeft: '1px solid var(--tx-border)', background: 'oklch(10% 0.004 240 / 96%)' }}
      aria-label="Chat de la llamada"
    >
      <header className="flex items-center justify-between px-3 py-2.5 shrink-0"
              style={{ borderBottom: '1px solid var(--tx-border)' }}>
        <p className="text-[13px] font-semibold text-[var(--tx-ink-primary)]">Chat</p>
        <button
          onClick={onCerrar}
          aria-label="Cerrar el chat"
          className="p-1 text-[var(--tx-ink-muted)] hover:text-[var(--tx-ink-primary)]"
        >
          <XIcon className="size-4" />
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-2">
        {mensajes.length === 0 && (
          <p className="text-[12px] text-[var(--tx-ink-muted)] py-4">
            Lo que escriban acá queda en la conversación después de colgar.
          </p>
        )}

        {mensajes.map((m) => {
          const mio = m.autor_id === miIntegranteId
          return (
            <div key={m.id} className={mio ? 'text-right' : ''}>
              {!mio && (
                <p className="text-[11px] text-[var(--tx-ink-muted)] mb-0.5">
                  {nombrePorId.get(m.autor_id ?? '') ?? 'Alguien'}
                </p>
              )}
              <div
                className="inline-block max-w-[85%] rounded-xl px-2.5 py-1.5 text-left"
                style={{
                  background: mio ? 'var(--tx-accent)' : 'oklch(100% 0 0 / 8%)',
                  color: mio ? 'var(--tx-accent-fg)' : 'var(--tx-ink-primary)',
                }}
              >
                {/* Texto plano a propósito: el markdown del hilo trae su propio
                    renderizador y acá lo que se manda son links y códigos cortos. */}
                {m.adjuntos && m.adjuntos.length > 0 && (
                  <div className="mb-1">
                    <AdjuntosMensaje adjuntos={m.adjuntos} />
                  </div>
                )}
                {m.contenido && <p className="text-[13px] whitespace-pre-wrap break-words">{m.contenido}</p>}
                <p className="text-[10px] opacity-60 mt-0.5">{HORA.format(new Date(m.created_at))}</p>
              </div>
            </div>
          )
        })}
        <div ref={finRef} />
      </div>

      {/* La respuesta del comando, solo para quien lo escribió. */}
      {respuestaComando && (
        <p
          role="status"
          className="mx-2 mb-1 shrink-0 rounded-lg px-2.5 py-1.5 text-[11px]"
          style={{ background: 'oklch(100% 0 0 / 6%)', color: 'var(--tx-ink-muted)' }}
        >
          {respuestaComando}
        </p>
      )}

      {porEnviar.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 px-2 pb-1 shrink-0">
          {porEnviar.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center gap-1.5 rounded-lg pl-2 pr-1 py-1 text-[11px]"
              style={{ background: 'oklch(100% 0 0 / 6%)' }}
            >
              <span className="max-w-[110px] truncate text-[var(--tx-ink-primary)]">{f.name}</span>
              <span className="text-[var(--tx-ink-muted)]">{pesoLegible(f.size)}</span>
              <button
                onClick={() => setPorEnviar((previos) => previos.filter((_, j) => j !== i))}
                aria-label={`Quitar ${f.name}`}
                className="p-0.5 text-[var(--tx-ink-muted)] hover:text-[var(--tx-ink-primary)]"
              >
                <XIcon className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-end gap-2 p-2 shrink-0" style={{ borderTop: '1px solid var(--tx-border)' }}>
        <button
          onClick={() => archivosRef.current?.click()}
          disabled={enviando}
          aria-label="Adjuntar una foto o un archivo"
          className="shrink-0 self-end p-2 text-[var(--tx-ink-muted)] hover:text-[var(--tx-ink-primary)] disabled:opacity-40"
        >
          <ImageIcon className="size-4" />
        </button>
        <input
          ref={archivosRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            sumarArchivos(e.target.files)
            // Sin esto, elegir dos veces la misma foto no dispara `change`.
            e.target.value = ''
          }}
        />
        <textarea
          value={borrador}
          onChange={(e) => setBorrador(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void enviar()
            }
          }}
          // Pegar una captura del portapapeles la adjunta, como en el chat del CRM.
          // En una llamada es el caso más común: se comparte pantalla, se recorta y
          // se pega, sin pasar por guardar el archivo.
          onPaste={(e) => {
            const archivos = Array.from(e.clipboardData.files)
            if (archivos.length === 0) return
            e.preventDefault()
            sumarArchivos(archivos)
          }}
          rows={1}
          placeholder={onComando ? 'Escribe… o /play para música' : 'Escribe…'}
          className="flex-1 resize-none rounded-lg px-2.5 py-2 text-[13px] outline-none"
          style={{
            background: 'oklch(100% 0 0 / 6%)',
            color: 'var(--tx-ink-primary)',
            maxHeight: 96,
          }}
        />
        <button
          onClick={() => void enviar()}
          disabled={(!borrador.trim() && porEnviar.length === 0) || enviando}
          aria-label="Enviar"
          className="inline-flex size-9 items-center justify-center rounded-lg disabled:opacity-40"
          style={{ background: 'var(--tx-accent)', color: 'var(--tx-accent-fg)' }}
        >
          <SendIcon className="size-4" />
        </button>
      </div>
    </aside>
  )
}
