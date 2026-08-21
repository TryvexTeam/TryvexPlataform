'use client'

import { useState } from 'react'
import {
  FileIcon,
  FileTextIcon,
  FileCodeIcon,
  FileSpreadsheetIcon,
  PlayIcon,
  DownloadIcon,
  LinkIcon,
} from 'lucide-react'
import { copiarTexto } from '@/lib/utils/copiar-texto'
import {
  esHtml,
  esImagen,
  esOfimatica,
  esPdf,
  esTexto,
  esVideo,
  pesoLegible,
  urlAdjunto,
  type AdjuntoMensaje,
} from '@/lib/types/chat'
import { VisorAdjunto } from './visor-adjunto'

/**
 * Los archivos de un mensaje.
 *
 * La idea de fondo: **no debería hacer falta descargar algo para saber qué es,
 * ni salir de la conversación para mirarlo.** Todo se abre en el mismo visor,
 * grande y encima del chat — imágenes, páginas HTML, PDF y texto.
 *
 * Antes cada tipo se abría a su manera: la imagen te mandaba a otra pestaña, el
 * texto se desplegaba en una tira, el PDF había que bajarlo. Tener una sola
 * puerta es lo que evita que uno de los casos se quede sin arreglar.
 */
export function AdjuntosMensaje({ adjuntos }: { adjuntos: AdjuntoMensaje[] }) {
  const [abierto, setAbierto] = useState<AdjuntoMensaje | null>(null)

  if (adjuntos.length === 0) return null

  const imagenes = adjuntos.filter(esImagen)
  const archivos = adjuntos.filter((a) => !esImagen(a))

  return (
    <div className="space-y-1.5">
      {imagenes.length > 0 && (
        <div className={`grid gap-1.5 ${imagenes.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {imagenes.map((a) => (
            <button
              key={a.id}
              onClick={() => setAbierto(a)}
              title={`Ver ${a.nombre}`}
              className="block rounded-xl overflow-hidden text-left"
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
            </button>
          ))}
        </div>
      )}

      {archivos.map((a) => (
        <TarjetaArchivo key={a.id} adjunto={a} onAbrir={() => setAbierto(a)} />
      ))}

      {abierto && <VisorAdjunto adjunto={abierto} onCerrar={() => setAbierto(null)} />}
    </div>
  )
}

function TarjetaArchivo({
  adjunto,
  onAbrir,
}: {
  adjunto: AdjuntoMensaje
  onAbrir: () => void
}) {
  const Icono = esVideo(adjunto)
    ? PlayIcon
    : esHtml(adjunto)
      ? FileCodeIcon
      : esOfimatica(adjunto)
        ? FileSpreadsheetIcon
        : esPdf(adjunto) || esTexto(adjunto)
          ? FileTextIcon
          : FileIcon

  // La ofimática NO se puede dibujar en un navegador: se dice "descargar" y el
  // clic descarga. Un botón que abre algo que no se ve es peor que no tenerlo.
  const sePuedeVer =
    esVideo(adjunto) || esHtml(adjunto) || esPdf(adjunto) || esTexto(adjunto)
  const soloDescarga = esOfimatica(adjunto) || !sePuedeVer

  const copiarEnlace = () => {
    const base = typeof window === 'undefined' ? '' : window.location.origin
    void copiarTexto(`${base}${urlAdjunto(adjunto.id)}`, 'Enlace copiado')
  }

  return (
    <div className="flex items-center gap-2.5 rounded-xl px-3 py-2 bg-black/20">
      {soloDescarga ? (
        <a
          href={`${urlAdjunto(adjunto.id)}?descargar=1`}
          className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
        >
          <Icono size={18} className="shrink-0 opacity-80" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] truncate">{adjunto.nombre}</span>
            <span className="block text-[11px] opacity-70">
              {pesoLegible(adjunto.bytes)} · descargar
            </span>
          </span>
        </a>
      ) : (
        <button
          onClick={onAbrir}
          className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
        >
          <Icono size={18} className="shrink-0 opacity-80" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] truncate">{adjunto.nombre}</span>
            <span className="block text-[11px] opacity-70">
              {pesoLegible(adjunto.bytes)} · {esVideo(adjunto) ? 'reproducir' : 'abrir'}
            </span>
          </span>
        </button>
      )}

      <button
        onClick={copiarEnlace}
        aria-label={`Copiar enlace de ${adjunto.nombre}`}
        title="Copiar enlace"
        className="shrink-0 p-1 opacity-70 hover:opacity-100"
      >
        <LinkIcon size={14} />
      </button>
      <a
        href={`${urlAdjunto(adjunto.id)}?descargar=1`}
        aria-label={`Descargar ${adjunto.nombre}`}
        title="Descargar"
        className="shrink-0 p-1 opacity-70 hover:opacity-100"
      >
        <DownloadIcon size={15} />
      </a>
    </div>
  )
}
