'use client'

import { useCallback, useEffect, useState } from 'react'
import { CodeIcon, DownloadIcon, EyeIcon, LinkIcon, XIcon } from 'lucide-react'
import { copiarTexto } from '@/lib/utils/copiar-texto'
import {
  MAX_BYTES_PREVIEW,
  esHtml,
  esImagen,
  esPdf,
  esTexto,
  pesoLegible,
  urlAdjunto,
  type AdjuntoMensaje,
} from '@/lib/types/chat'

/**
 * El visor de adjuntos: se abre GRANDE y encima del chat, sin sacarte de la
 * conversación.
 *
 * Nace de dos cosas que ya se habían aprendido en otro chat de la casa y que
 * acá volvían a pasar:
 *
 *  1. **Tocar una imagen te mandaba a otra pestaña.** Perdías el hilo por mirar
 *     una foto, y volver era tarea aparte.
 *  2. **Un HTML incrustado chico no sirve.** Cuando se mostró embebido en una
 *     tira baja, los botones de la propia página quedaban fuera del pedazo
 *     visible y parecía que no respondían — el bug no era el HTML, era el
 *     tamaño. Por eso acá se abre casi a pantalla completa.
 *
 * Un solo visor para todo: imagen, HTML, PDF y texto. Que cada tipo tuviera su
 * propia forma de abrirse era justo lo que hacía que uno de ellos se olvidara.
 */
export function VisorAdjunto({
  adjunto,
  onCerrar,
}: {
  adjunto: AdjuntoMensaje
  onCerrar: () => void
}) {
  // Los que se pueden mirar de dos formas empiezan por la dibujada: quien abre
  // un HTML quiere ver la página, y el código es la segunda intención.
  const alternable = esHtml(adjunto) || esTexto(adjunto)
  const [modo, setModo] = useState<'ver' | 'codigo'>(
    esHtml(adjunto) || esImagen(adjunto) || esPdf(adjunto) ? 'ver' : 'codigo',
  )

  // Escape cierra: es lo que la mano hace sola cuando algo se abre encima.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar()
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [onCerrar])

  const copiarEnlace = () => {
    const base = typeof window === 'undefined' ? '' : window.location.origin
    void copiarTexto(`${base}${urlAdjunto(adjunto.id)}`, 'Enlace copiado')
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={adjunto.nombre}
      onClick={onCerrar}
      className="fixed inset-0 z-50 flex flex-col bg-black/80 backdrop-blur-sm p-2 sm:p-6"
    >
      {/* El clic en el fondo cierra; adentro no, o se cerraría al usarlo. */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col min-h-0 flex-1 w-full max-w-5xl mx-auto rounded-2xl overflow-hidden"
        style={{ background: 'var(--tx-bg-elevated, #16181d)', border: '1px solid var(--border)' }}
      >
        <header className="flex items-center gap-2 px-3 sm:px-4 py-2.5 border-b border-[var(--border)]">
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] truncate text-[var(--tx-ink-primary)]">
              {adjunto.nombre}
            </span>
            <span className="block text-[11px] text-[var(--tx-ink-muted)]">
              {pesoLegible(adjunto.bytes)}
            </span>
          </span>

          {alternable && (
            <div className="flex shrink-0 rounded-lg overflow-hidden border border-[var(--border)]">
              <BotonModo activo={modo === 'ver'} onClick={() => setModo('ver')}>
                <EyeIcon size={13} /> Vista previa
              </BotonModo>
              <BotonModo activo={modo === 'codigo'} onClick={() => setModo('codigo')}>
                <CodeIcon size={13} /> Código
              </BotonModo>
            </div>
          )}

          <button
            onClick={copiarEnlace}
            aria-label="Copiar enlace"
            title="Copiar enlace"
            className="shrink-0 p-1.5 text-[var(--tx-ink-muted)] hover:text-[var(--tx-ink-primary)]"
          >
            <LinkIcon size={16} />
          </button>
          <a
            href={urlAdjunto(adjunto.id)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Descargar"
            title="Descargar"
            className="shrink-0 p-1.5 text-[var(--tx-ink-muted)] hover:text-[var(--tx-ink-primary)]"
          >
            <DownloadIcon size={16} />
          </a>
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            className="shrink-0 p-1.5 text-[var(--tx-ink-muted)] hover:text-[var(--tx-ink-primary)]"
          >
            <XIcon size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto bg-black/20">
          <Cuerpo adjunto={adjunto} modo={modo} />
        </div>
      </div>
    </div>
  )
}

function BotonModo({
  activo,
  onClick,
  children,
}: {
  activo: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={activo}
      className={`flex items-center gap-1 px-2.5 py-1 text-[12px] ${
        activo
          ? 'bg-[var(--tx-accent)] text-black'
          : 'text-[var(--tx-ink-muted)] hover:text-[var(--tx-ink-primary)]'
      }`}
    >
      {children}
    </button>
  )
}

function Cuerpo({ adjunto, modo }: { adjunto: AdjuntoMensaje; modo: 'ver' | 'codigo' }) {
  if (modo === 'codigo') return <CodigoDelArchivo adjunto={adjunto} />

  if (esImagen(adjunto)) {
    return (
      <div className="flex h-full items-center justify-center p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={urlAdjunto(adjunto.id)}
          alt={adjunto.nombre}
          className="max-h-full max-w-full object-contain"
        />
      </div>
    )
  }

  if (esHtml(adjunto)) {
    return (
      <iframe
        src={urlAdjunto(adjunto.id)}
        title={adjunto.nombre}
        // `allow-scripts` sin `allow-same-origin`: la página puede tener botones
        // que funcionen, pero no puede tocar nada de la sesión del CRM. Las dos
        // juntas anularían el aislamiento del sandbox.
        sandbox="allow-scripts allow-popups allow-forms"
        className="w-full h-full min-h-[70vh] bg-white"
      />
    )
  }

  return (
    <iframe
      src={urlAdjunto(adjunto.id)}
      title={adjunto.nombre}
      className="w-full h-full min-h-[70vh] bg-white"
    />
  )
}

/** El contenido crudo, para cuando se quiere leer el código y no verlo dibujado. */
function CodigoDelArchivo({ adjunto }: { adjunto: AdjuntoMensaje }) {
  const [texto, setTexto] = useState<string | null>(null)
  const [errorAlLeer, setErrorAlLeer] = useState<string | null>(null)

  const demasiadoGrande = adjunto.bytes > MAX_BYTES_PREVIEW
  const error = demasiadoGrande ? 'Muy grande para mostrarlo acá — descárgalo' : errorAlLeer

  const traer = useCallback(() => {
    if (demasiadoGrande || texto !== null || errorAlLeer) return
    let vigente = true
    fetch(urlAdjunto(adjunto.id))
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error('No se pudo leer'))))
      .then((t) => vigente && setTexto(t))
      .catch(() => vigente && setErrorAlLeer('No se pudo leer el archivo'))
    return () => {
      vigente = false
    }
  }, [adjunto.id, demasiadoGrande, texto, errorAlLeer])

  useEffect(() => traer(), [traer])

  if (error) return <p className="px-4 py-3 text-[12px] opacity-70">{error}</p>
  if (texto === null) return <p className="px-4 py-3 text-[12px] opacity-70">Leyendo…</p>

  return (
    <pre className="px-4 py-3 text-[12px] leading-snug whitespace-pre-wrap break-words">
      {texto}
    </pre>
  )
}
