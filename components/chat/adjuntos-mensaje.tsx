'use client'

import { useEffect, useState } from 'react'
import { FileIcon, DownloadIcon, ChevronDownIcon, ChevronRightIcon } from 'lucide-react'
import {
  MAX_BYTES_PREVIEW,
  esImagen,
  esTexto,
  pesoLegible,
  urlAdjunto,
  type AdjuntoMensaje,
} from '@/lib/types/chat'

/**
 * Los archivos de un mensaje. Las imágenes se ven; el resto va como tarjeta con
 * su nombre y peso, que es lo que hace falta para decidir si abrirlo.
 */
export function AdjuntosMensaje({ adjuntos }: { adjuntos: AdjuntoMensaje[] }) {
  if (adjuntos.length === 0) return null

  const imagenes = adjuntos.filter(esImagen)
  const archivos = adjuntos.filter((a) => !esImagen(a))

  return (
    <div className="space-y-1.5">
      {imagenes.length > 0 && (
        <div className={`grid gap-1.5 ${imagenes.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {imagenes.map((a) => (
            <a
              key={a.id}
              href={urlAdjunto(a.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-xl overflow-hidden"
              title={a.nombre}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={urlAdjunto(a.id)}
                alt={a.nombre}
                // Las medidas se guardan al subir cuando se conocen: sin ellas la
                // burbuja salta de tamaño al terminar de cargar la imagen.
                width={a.ancho ?? undefined}
                height={a.alto ?? undefined}
                loading="lazy"
                className="w-full max-h-72 object-cover bg-black/20"
              />
            </a>
          ))}
        </div>
      )}

      {archivos.map((a) =>
        esTexto(a) ? (
          <ArchivoDeTexto key={a.id} adjunto={a} />
        ) : (
        <a
          key={a.id}
          href={urlAdjunto(a.id)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 rounded-xl px-3 py-2 bg-black/20 hover:bg-black/30 transition-colors"
        >
          <FileIcon size={18} className="shrink-0 opacity-80" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] truncate">{a.nombre}</span>
            <span className="block text-[11px] opacity-70">{pesoLegible(a.bytes)}</span>
          </span>
          <DownloadIcon size={15} className="shrink-0 opacity-70" />
        </a>
        ),
      )}
    </div>
  )
}

/**
 * Un .txt, un .md o un .log se leen acá mismo. Antes había que descargarlos para
 * saber qué decían, que es exactamente lo que nadie hace en medio de una
 * conversación.
 *
 * Se trae solo al abrirlo y con tope de tamaño: un log grande no puede meterse
 * entero en el navegador solo porque alguien lo mandó.
 */
function ArchivoDeTexto({ adjunto }: { adjunto: AdjuntoMensaje }) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto || texto !== null || error) return
    let vigente = true

    if (adjunto.bytes > MAX_BYTES_PREVIEW) {
      setError('Muy grande para mostrarlo acá — descargalo')
      return
    }

    fetch(urlAdjunto(adjunto.id))
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error('No se pudo leer'))))
      .then((t) => vigente && setTexto(t))
      .catch(() => vigente && setError('No se pudo leer el archivo'))

    return () => {
      vigente = false
    }
  }, [abierto, adjunto.id, adjunto.bytes, texto, error])

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(0,0,0,0.2)' }}>
      <div className="flex items-center gap-2.5 px-3 py-2">
        <button
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
        >
          {abierto ? (
            <ChevronDownIcon size={16} className="shrink-0 opacity-70" />
          ) : (
            <ChevronRightIcon size={16} className="shrink-0 opacity-70" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] truncate">{adjunto.nombre}</span>
            <span className="block text-[11px] opacity-70">{pesoLegible(adjunto.bytes)}</span>
          </span>
        </button>
        <a
          href={urlAdjunto(adjunto.id)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Descargar ${adjunto.nombre}`}
          className="shrink-0 opacity-70 hover:opacity-100"
        >
          <DownloadIcon size={15} />
        </a>
      </div>

      {abierto && (
        <div className="border-t border-current/10">
          {error ? (
            <p className="px-3 py-2 text-[12px] opacity-70">{error}</p>
          ) : texto === null ? (
            <p className="px-3 py-2 text-[12px] opacity-70">Leyendo…</p>
          ) : (
            <pre className="px-3 py-2 max-h-72 overflow-auto text-[12px] leading-snug whitespace-pre-wrap break-words">
              {texto}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
