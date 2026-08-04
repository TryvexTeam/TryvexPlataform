'use client'

import { FileIcon, DownloadIcon } from 'lucide-react'
import { esImagen, pesoLegible, urlAdjunto, type AdjuntoMensaje } from '@/lib/types/chat'

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

      {archivos.map((a) => (
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
      ))}
    </div>
  )
}
