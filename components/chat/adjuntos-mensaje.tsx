'use client'

import { useEffect, useState } from 'react'
import {
  FileIcon,
  FileTextIcon,
  DownloadIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  LinkIcon,
} from 'lucide-react'
import { copiarTexto } from '@/lib/utils/copiar-texto'
import {
  MAX_BYTES_PREVIEW,
  esImagen,
  esPdf,
  esTexto,
  pesoLegible,
  urlAdjunto,
  type AdjuntoMensaje,
} from '@/lib/types/chat'

/**
 * Los archivos de un mensaje.
 *
 * La idea de fondo: **no debería hacer falta descargar algo para saber qué es.**
 * Las imágenes se ven, los textos se despliegan, los PDF se abren acá mismo, y
 * lo que no se puede mostrar al menos dice su nombre y su peso.
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
        ) : esPdf(a) ? (
          <ArchivoPdf key={a.id} adjunto={a} />
        ) : (
          <div
            key={a.id}
            className="flex items-center gap-2.5 rounded-xl px-3 py-2 bg-black/20"
          >
            <FileIcon size={18} className="shrink-0 opacity-80" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] truncate">{a.nombre}</span>
              <span className="block text-[11px] opacity-70">{pesoLegible(a.bytes)}</span>
            </span>
            <AccionesAdjunto adjunto={a} />
          </div>
        ),
      )}
    </div>
  )
}

/**
 * Descargar y copiar el enlace, en todos los adjuntos por igual.
 *
 * El enlace copiado apunta al endpoint propio, no a una URL firmada: la firmada
 * vence en 60 segundos, así que pegarla en otro chat entrega algo que ya no
 * abre. Esta revalida el permiso en cada pedido y sirve mientras la persona
 * siga siendo del equipo.
 */
function AccionesAdjunto({ adjunto }: { adjunto: AdjuntoMensaje }) {
  const copiarEnlace = () => {
    const base = typeof window === 'undefined' ? '' : window.location.origin
    void copiarTexto(`${base}${urlAdjunto(adjunto.id)}`, 'Enlace copiado')
  }

  return (
    <span className="flex shrink-0 items-center gap-1">
      <button
        onClick={copiarEnlace}
        aria-label={`Copiar enlace de ${adjunto.nombre}`}
        title="Copiar enlace"
        className="p-1 opacity-70 hover:opacity-100"
      >
        <LinkIcon size={14} />
      </button>
      <a
        href={urlAdjunto(adjunto.id)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Descargar ${adjunto.nombre}`}
        title="Descargar"
        className="p-1 opacity-70 hover:opacity-100"
      >
        <DownloadIcon size={15} />
      </a>
    </span>
  )
}

/**
 * Un PDF se mira acá mismo, sin bajarlo.
 *
 * Es el archivo que más circula después de las imágenes —cotizaciones,
 * informes— y hasta ahora había que descargarlo solo para saber si era el que
 * uno buscaba.
 *
 * Va cerrado por defecto y el visor se monta recién al abrirlo: un `<iframe>`
 * por cada PDF del historial le pediría al navegador cargar documentos que
 * nadie va a mirar.
 */
function ArchivoPdf({ adjunto }: { adjunto: AdjuntoMensaje }) {
  const [abierto, setAbierto] = useState(false)

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
          <FileTextIcon size={18} className="shrink-0 opacity-80" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] truncate">{adjunto.nombre}</span>
            <span className="block text-[11px] opacity-70">
              {pesoLegible(adjunto.bytes)} · {abierto ? 'ocultar' : 'ver acá'}
            </span>
          </span>
        </button>
        <AccionesAdjunto adjunto={adjunto} />
      </div>

      {abierto && (
        <div className="border-t border-current/10">
          <iframe
            src={urlAdjunto(adjunto.id)}
            title={adjunto.nombre}
            className="w-full h-[420px] bg-white"
          />
        </div>
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
  const [errorAlLeer, setErrorAlLeer] = useState<string | null>(null)

  // Que el archivo sea muy grande NO es estado: se sabe del propio adjunto
  // antes de intentar nada. Estaba puesto con `setError` dentro del efecto, lo
  // que dispara un render en cascada (y es lo que marcaba el lint). Derivarlo
  // es además más honesto: no es algo que pasó, es algo que ya era así.
  const demasiadoGrande = adjunto.bytes > MAX_BYTES_PREVIEW
  const error = demasiadoGrande ? 'Muy grande para mostrarlo acá — descargalo' : errorAlLeer

  useEffect(() => {
    if (!abierto || demasiadoGrande || texto !== null || errorAlLeer) return
    let vigente = true

    fetch(urlAdjunto(adjunto.id))
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error('No se pudo leer'))))
      .then((t) => vigente && setTexto(t))
      .catch(() => vigente && setErrorAlLeer('No se pudo leer el archivo'))

    return () => {
      vigente = false
    }
  }, [abierto, demasiadoGrande, adjunto.id, texto, errorAlLeer])

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
        <AccionesAdjunto adjunto={adjunto} />
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
