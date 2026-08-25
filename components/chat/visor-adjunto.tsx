'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { CodeIcon, DownloadIcon, EyeIcon, LinkIcon, XIcon } from 'lucide-react'
import { copiarTexto } from '@/lib/utils/copiar-texto'
import {
  MAX_BYTES_PREVIEW,
  esExcel,
  esHtml,
  esImagen,
  esOfimatica,
  esPdf,
  esTexto,
  esVideo,
  esWord,
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
  // Solo tiene sentido alternar donde hay algo que leer Y algo que dibujar.
  // Un video o un .docx no tienen "código" que mostrar.
  const alternable = (esHtml(adjunto) || esTexto(adjunto)) && !esOfimatica(adjunto)
  const [modo, setModo] = useState<'ver' | 'codigo'>(
    esHtml(adjunto) ||
      esImagen(adjunto) ||
      esPdf(adjunto) ||
      esVideo(adjunto) ||
      esOfimatica(adjunto)
      ? 'ver'
      : 'codigo',
  )

  // Escape cierra: es lo que la mano hace sola cuando algo se abre encima.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar()
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [onCerrar])

  // Mientras el visor está abierto, el chat de atrás no se mueve.
  useEffect(() => {
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = antes
    }
  }, [])

  // El portal necesita el DOM. Este visor solo se monta al hacer clic, así que
  // en la práctica siempre existe; la guarda es por si alguien lo renderiza
  // desde el servidor.
  if (typeof document === 'undefined') return null

  const copiarEnlace = () => {
    const base = typeof window === 'undefined' ? '' : window.location.origin
    void copiarTexto(`${base}${urlAdjunto(adjunto.id)}`, 'Enlace copiado')
  }

  // Va al <body> por portal, NO dentro de la burbuja del mensaje.
  // Un `position: fixed` deja de referirse a la pantalla si algún ancestro
  // tiene transform/filter/contain — y el hilo del chat los tiene. Sin esto el
  // visor quedaba encajado en una tira dentro del mensaje en vez de abrirse
  // grande, que es justo lo que hacía inservible al HTML incrustado.
  //
  // `overlay-pantalla-movil` (no `inset-0`) es lo que lo hace usable en iPhone:
  // en iOS `inset-0`/`100vh` mide el viewport GRANDE y el visor se cortaba por
  // abajo tras la barra de Safari, y la cabecera con la X quedaba tapada bajo la
  // Dynamic Island. La clase da `100svh` + `env(safe-area-*)`. Es el mismo
  // arreglo que ya se hizo en el chat de WhatsApp del lead (commit 64b981a).
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={adjunto.nombre}
      onClick={onCerrar}
      className="overlay-pantalla-movil fixed inset-x-0 top-0 z-[100] flex flex-col bg-black/80 backdrop-blur-sm"
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
            href={`${urlAdjunto(adjunto.id)}?descargar=1`}
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

        <div className="min-h-0 flex-1 flex flex-col overflow-auto bg-black/20">
          <Cuerpo adjunto={adjunto} modo={modo} />
        </div>
      </div>
    </div>,
    document.body,
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
      <div className="flex flex-1 min-h-0 items-center justify-center p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={urlAdjunto(adjunto.id)}
          alt={adjunto.nombre}
          className="max-h-full max-w-full object-contain"
        />
      </div>
    )
  }

  if (esVideo(adjunto)) {
    return (
      <div className="flex flex-1 min-h-0 items-center justify-center p-2">
        {/* Sin `autoPlay`: un video que arranca solo en medio de una
            conversación es una molestia, no una comodidad. */}
        <video
          src={urlAdjunto(adjunto.id)}
          controls
          preload="metadata"
          className="max-h-full max-w-full"
        />
      </div>
    )
  }

  // Word y Excel se dibujan DENTRO del navegador (texto que fluye / tabla):
  // crisp y con scroll vertical, como una página. El resto de la ofimática
  // —PowerPoint, y los formatos viejos .doc/.ppt— van al visor de Microsoft,
  // que los dibuja fiel (convertirlos del lado nuestro los deforma).
  if (esWord(adjunto)) return <VistaWord adjunto={adjunto} />
  if (esExcel(adjunto)) return <VistaExcel adjunto={adjunto} />
  if (esOfimatica(adjunto)) return <VistaOfimatica adjunto={adjunto} />

  if (esHtml(adjunto)) {
    return (
      <iframe
        src={urlAdjunto(adjunto.id)}
        title={adjunto.nombre}
        // `allow-scripts` sin `allow-same-origin`: la página puede tener botones
        // que funcionen, pero no puede tocar nada de la sesión del CRM. Las dos
        // juntas anularían el aislamiento del sandbox.
        sandbox="allow-scripts allow-popups allow-forms"
        className="w-full flex-1 min-h-0 bg-white"
      />
    )
  }

  return (
    <iframe
      src={urlAdjunto(adjunto.id)}
      title={adjunto.nombre}
      className="w-full flex-1 min-h-0 bg-white"
    />
  )
}

/**
 * Un documento (HTML ya armado) dibujado en un marco AISLADO.
 *
 * `sandbox=""` —sin `allow-scripts` ni `allow-same-origin`— es la clave: el
 * contenido viene de un archivo que subió alguien, así que aunque trajera un
 * script o un enlace `javascript:`, adentro del marco no puede ejecutar nada ni
 * tocar la sesión del CRM. Word y Excel no necesitan scripts para verse.
 * El marco trae su propio estilo para que se lea como una página, con scroll.
 */
function DocumentoEnMarco({ html, titulo }: { html: string; titulo: string }) {
  const doc = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { color-scheme: light; }
  body { margin:0 auto; padding:20px; max-width:820px; background:#fff; color:#111;
    font:15px/1.6 -apple-system,system-ui,'Segoe UI',Roboto,sans-serif;
    overflow-wrap:break-word; }
  img { max-width:100%; height:auto; }
  table { border-collapse:collapse; width:100%; margin:12px 0; font-size:13px; }
  td,th { border:1px solid #ccc; padding:6px 8px; text-align:left; vertical-align:top; }
  h1,h2,h3 { line-height:1.25; }
  a { color:#0645ad; }
</style></head><body>${html}</body></html>`
  return (
    <iframe
      title={titulo}
      srcDoc={doc}
      sandbox=""
      className="w-full flex-1 min-h-0 bg-white"
    />
  )
}

/**
 * Word (.docx) dibujado DENTRO del navegador: texto que fluye, crisp y con
 * scroll vertical como una página. Nada sale del CRM.
 *
 * Se baja el archivo del endpoint propio (que ya revisó pertenencia) y `mammoth`
 * lo pasa a HTML acá mismo. Se importa dinámico para no cargar la librería hasta
 * que de verdad se abre un Word. Si algo falla, cae a descargar.
 */
function VistaWord({ adjunto }: { adjunto: AdjuntoMensaje }) {
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let vigente = true
    ;(async () => {
      try {
        // @ts-expect-error el bundle de navegador de mammoth no trae tipos en este subpath
        const mod = await import('mammoth/mammoth.browser')
        const mammoth = mod.default ?? mod
        const resp = await fetch(urlAdjunto(adjunto.id))
        if (!resp.ok) throw new Error('descarga')
        const arrayBuffer = await resp.arrayBuffer()
        const { value } = await mammoth.convertToHtml({ arrayBuffer })
        if (vigente) setHtml(value)
      } catch {
        if (vigente) setError(true)
      }
    })()
    return () => {
      vigente = false
    }
  }, [adjunto.id])

  if (error) return <OfimaticaDescarga adjunto={adjunto} />
  if (html === null)
    return <p className="px-4 py-3 text-[12px] opacity-70">Abriendo el documento…</p>
  return <DocumentoEnMarco html={html} titulo={adjunto.nombre} />
}

/**
 * Excel (.xlsx) dibujado como tabla en el navegador. Muestra la primera hoja;
 * si hay más, lo dice. Igual que Word: la librería se importa dinámico y todo
 * pasa acá, sin salir del CRM.
 */
function VistaExcel({ adjunto }: { adjunto: AdjuntoMensaje }) {
  const [html, setHtml] = useState<string | null>(null)
  const [nota, setNota] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let vigente = true
    ;(async () => {
      try {
        const XLSX = await import('xlsx')
        const resp = await fetch(urlAdjunto(adjunto.id))
        if (!resp.ok) throw new Error('descarga')
        const arrayBuffer = await resp.arrayBuffer()
        const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' })
        const primera = wb.SheetNames[0]
        const tabla = XLSX.utils.sheet_to_html(wb.Sheets[primera])
        if (vigente) {
          setHtml(tabla)
          if (wb.SheetNames.length > 1) {
            setNota(
              `Mostrando la hoja "${primera}". El archivo tiene ${wb.SheetNames.length} hojas — descárgalo para ver el resto.`,
            )
          }
        }
      } catch {
        if (vigente) setError(true)
      }
    })()
    return () => {
      vigente = false
    }
  }, [adjunto.id])

  if (error) return <OfimaticaDescarga adjunto={adjunto} />
  if (html === null)
    return <p className="px-4 py-3 text-[12px] opacity-70">Abriendo la planilla…</p>
  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <DocumentoEnMarco html={html} titulo={adjunto.nombre} />
      {nota && (
        <p className="shrink-0 px-3 py-1.5 text-center text-[11px] text-[var(--tx-ink-muted)] border-t border-[var(--border)]">
          {nota}
        </p>
      )}
    </div>
  )
}

/**
 * PowerPoint (y los formatos viejos .doc/.ppt) dibujados dentro del chat.
 *
 * A diferencia de Word/Excel, estos NO se dibujan bien en el navegador por su
 * cuenta, así que se apoya en el visor online de Microsoft Office
 * (`view.officeapps.live.com`), que los renderiza fiel. Se le pide al endpoint
 * una URL firmada de vida corta (`?firmar=1`, 10 min) y se le pasa al visor.
 *
 * ⚠️ Es la única parte donde un archivo del chat sale hacia un tercero
 * (Microsoft, mientras lo dibuja). Convertirlo del lado nuestro (LibreOffice)
 * deforma los pptx, así que el visor de Office es lo que mejor los muestra.
 */
function VistaOfimatica({ adjunto }: { adjunto: AdjuntoMensaje }) {
  const [urlVisor, setUrlVisor] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let vigente = true
    fetch(`${urlAdjunto(adjunto.id)}?firmar=1`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('firma'))))
      .then((d: { success?: boolean; url?: string }) => {
        if (!vigente) return
        if (d?.success && d.url) {
          setUrlVisor(
            `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(d.url)}`,
          )
        } else {
          setError(true)
        }
      })
      .catch(() => vigente && setError(true))
    return () => {
      vigente = false
    }
  }, [adjunto.id])

  if (error) return <OfimaticaDescarga adjunto={adjunto} />

  if (!urlVisor) {
    return <p className="px-4 py-3 text-[12px] opacity-70">Cargando vista previa…</p>
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <iframe
        src={urlVisor}
        title={adjunto.nombre}
        className="w-full flex-1 min-h-0 bg-white"
      />
      <p className="shrink-0 px-3 py-1.5 text-center text-[11px] text-[var(--tx-ink-muted)] border-t border-[var(--border)]">
        Vista previa con el visor de Microsoft Office ·{' '}
        <a href={`${urlAdjunto(adjunto.id)}?descargar=1`} className="underline">
          descargar el original
        </a>
      </p>
    </div>
  )
}

/** Respaldo cuando el visor de Office no está disponible: descargar y abrirlo. */
function OfimaticaDescarga({ adjunto }: { adjunto: AdjuntoMensaje }) {
  return (
    <div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-[13px] text-[var(--tx-ink-primary)]">
        No se pudo cargar la vista previa de este archivo.
      </p>
      <p className="text-[12px] text-[var(--tx-ink-muted)] max-w-sm">
        Descárgalo y ábrelo con tu programa de siempre.
      </p>
      <a
        href={`${urlAdjunto(adjunto.id)}?descargar=1`}
        className="rounded-lg px-3 py-1.5 text-[13px] bg-[var(--tx-accent)] text-black"
      >
        Descargar {adjunto.nombre}
      </a>
    </div>
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
