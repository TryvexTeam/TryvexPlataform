'use client'

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  HeadphoneOffIcon,
  HeadphonesIcon,
  MaximizeIcon,
  MicIcon,
  MicOffIcon,
  PhoneOffIcon,
  VideoIcon,
  VideoOffIcon,
} from 'lucide-react'
import type { ParticipanteVivo } from './use-llamada'
import { LADO_MINIMO } from './reproductor-musica'

/**
 * La llamada minimizada: un recuadro con imagen y controles que vive sobre
 * cualquier página del CRM.
 *
 * Sustituye a la píldora de "En llamada" (`boton-en-llamada.tsx`, ya sin uso).
 * Lo que aporta: se ve a quién se está oyendo y se puede silenciar o colgar sin
 * restaurar la llamada entera — que es justo lo que uno necesita cuando
 * minimiza para seguir trabajando.
 *
 * Conserva lo que la píldora hacía bien: se arrastra a donde estorbe menos y
 * recuerda el sitio. Mantiene incluso su misma clave de almacenamiento, así
 * que quien ya había dejado su botón en un rincón se encuentra este ahí mismo.
 */

const STORAGE_KEY = 'tx-boton-en-llamada-pos'
const MARGEN = 12
/** Umbral para no confundir un toque tembloroso con un arrastre. */
const UMBRAL_ARRASTRE = 4

interface PersonaPip {
  id: string
  nombre: string
  avatar_url: string | null
  color: string | null
}

interface PipLlamadaProps {
  onRestaurar: () => void
  participantes: ParticipanteVivo[]
  personas: Map<string, PersonaPip>
  /** Integrantes que están hablando ahora mismo, incluido uno. */
  quienesHablan: Set<string>
  miIntegranteId: string
  micro: boolean
  camara: boolean
  ensordecido: boolean
  streamLocal: MediaStream | null
  onAlternarMicro: () => void
  onAlternarCamara: () => void
  onAlternarEnsordecer: () => void
  onColgar: () => void
  /** La pantalla que uno mismo está compartiendo, si la hay. */
  streamPantallaPropia: MediaStream | null
  /**
   * Si hay un video de música cargado -- no solo el panel abierto, la pista
   * puede estar vacía. Reserva el lugar para el iframe de YouTube, que se
   * reparenta acá adentro (ver `onAnclaMusica`).
   */
  hayMusica: boolean
  /**
   * El iframe de YouTube no es un `MediaStream`, es un DOM real que vive en
   * otro componente (`ReproductorMusica`) y se reposiciona por encima con
   * `position: fixed` midiendo este ancla -- mismo mecanismo que ya usa el
   * modo "grande" del reproductor dentro de la llamada abierta. Sin esto,
   * minimizar mostraba una cajita de música flotante APARTE de esta tarjeta:
   * dos cosas separadas ocupando pantalla en vez de una sola.
   */
  onAnclaMusica: (el: HTMLDivElement | null) => void
  /**
   * Se llama cada vez que la tarjeta cambia de posición (arrastre, o el
   * reacote automático). El iframe de música vive fuera de React, reposicionado
   * con `position: fixed` midiendo el ancla de acá arriba con un
   * `ResizeObserver` -- que solo dispara con cambios de TAMAÑO. Arrastrar
   * mueve la tarjeta escribiendo `style.left/top` directo (por rendimiento,
   * ver el comentario de `colocar`), sin tocar su tamaño, así que el
   * observer nunca se enteraba: el video quedaba pegado en el sitio viejo
   * mientras la tarjeta se movía sola. Este callback fuerza la remedición.
   */
  onMovida?: () => void
}

function iniciales(nombre: string): string {
  return (
    nombre
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || '·'
  )
}

/** Recuadro de video de una persona, con su avatar de respaldo. */
function Recuadro({
  stream,
  persona,
  hablando,
  camaraEncendida,
}: {
  stream: MediaStream | null
  persona: PersonaPip | undefined
  hablando: boolean
  camaraEncendida: boolean
}) {
  const video = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = video.current
    if (!el) return
    // `srcObject` no se puede pasar por props en React: es una referencia viva
    // al MediaStream, no un valor serializable.
    if (el.srcObject !== stream) el.srcObject = stream
  }, [stream])

  const muestraVideo = Boolean(stream) && camaraEncendida

  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-[18px]"
      style={{
        background: persona?.color ? `${persona.color}22` : 'rgba(255,255,255,.06)',
        // El aro de "está hablando" va por `boxShadow` y no por `border`: un
        // borde cambiaría la caja y haría saltar el recuadro cada vez que
        // alguien abre la boca.
        boxShadow: hablando ? '0 0 0 2px var(--tx-accent)' : 'none',
        transition: 'box-shadow 140ms ease',
      }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center text-[15px] font-medium text-[var(--tx-ink-secondary)]"
      >
        {iniciales(persona?.nombre ?? '')}
      </span>

      <video
        ref={video}
        autoPlay
        playsInline
        // Silenciado siempre: el audio de la llamada lo maneja la capa de
        // audio del panel. Sin esto se oiría dos veces, con eco.
        muted
        className="relative h-full w-full object-cover"
        style={{ opacity: muestraVideo ? 1 : 0 }}
      />
    </div>
  )
}

/** Pantalla compartida, sin avatar de respaldo -- si no hay imagen, no hay nada que mostrar. */
function VideoPantalla({ stream }: { stream: MediaStream }) {
  const video = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = video.current
    if (!el) return
    if (el.srcObject !== stream) el.srcObject = stream
  }, [stream])

  return (
    <video
      ref={video}
      autoPlay
      playsInline
      muted
      className="h-full w-full object-contain"
      style={{ background: '#000' }}
    />
  )
}

export function PipLlamada({
  onRestaurar,
  participantes,
  personas,
  quienesHablan,
  miIntegranteId,
  micro,
  camara,
  ensordecido,
  streamLocal,
  streamPantallaPropia,
  hayMusica,
  onAnclaMusica,
  onMovida,
  onAlternarMicro,
  onAlternarCamara,
  onAlternarEnsordecer,
  onColgar,
}: PipLlamadaProps) {
  const caja = useRef<HTMLDivElement>(null)
  const arrastre = useRef<{
    x0: number
    y0: number
    ox: number
    oy: number
    movio: boolean
  } | null>(null)
  const sinMovimiento = useReducedMotion()

  /**
   * La posición se escribe directo en el estilo del nodo, no en estado de
   * React. Dos razones, y las dos importan:
   *
   * 1. Arrastrar con estado dispara un render por cada píxel del puntero — con
   *    video en marcha dentro del recuadro, eso se nota.
   * 2. La posición guardada solo se conoce en el cliente. Meterla en estado
   *    obliga a un `setState` en el efecto de montaje (render en cascada) o a
   *    leer `localStorage` durante el render, que rompe la hidratación.
   *
   * El nodo arranca en su esquina por defecto y el efecto lo recoloca antes de
   * pintar, así que no se ve saltar.
   */
  const acotar = useCallback((x: number, y: number) => {
    const el = caja.current
    const w = el?.offsetWidth ?? 232
    const h = el?.offsetHeight ?? 168
    const maxX = Math.max(window.innerWidth - w - MARGEN, MARGEN)
    const maxY = Math.max(window.innerHeight - h - MARGEN, MARGEN)
    return { x: Math.min(Math.max(x, MARGEN), maxX), y: Math.min(Math.max(y, MARGEN), maxY) }
  }, [])

  /** Fija la posición en el nodo y suelta las clases de la esquina por defecto. */
  const colocar = useCallback(
    (x: number, y: number) => {
      const el = caja.current
      if (!el) return
      const p = acotar(x, y)
      el.style.left = `${p.x}px`
      el.style.top = `${p.y}px`
      el.style.right = 'auto'
      el.style.bottom = 'auto'
      // Avisar en cada reposición, no solo al soltar: el video de música
      // (si lo hay) tiene que seguir a la tarjeta mientras se arrastra, no
      // saltar recién al final.
      onMovida?.()
    },
    [acotar, onMovida],
  )

  // `useLayoutEffect` y no `useEffect`: recoloca antes de que el navegador
  // pinte, así el recuadro no se ve aparecer en una esquina y saltar a la otra.
  useLayoutEffect(() => {
    try {
      const guardado = localStorage.getItem(STORAGE_KEY)
      const p = guardado ? JSON.parse(guardado) : null
      if (p && typeof p.x === 'number' && typeof p.y === 'number') colocar(p.x, p.y)
    } catch {
      /* almacenamiento corrupto o bloqueado: queda en su esquina por defecto */
    }
  }, [colocar])

  // Si la posición guardada quedó fuera de pantalla tras achicar la ventana o
  // rotar el dispositivo, no había forma de recuperarla salvo arrastrar a
  // ciegas. Re-acotar contra el tamaño actual la trae de vuelta al viewport.
  useEffect(() => {
    const alRedimensionar = () => {
      const el = caja.current
      if (!el) return
      const r = el.getBoundingClientRect()
      colocar(r.left, r.top)
    }
    window.addEventListener('resize', alRedimensionar)
    window.addEventListener('orientationchange', alRedimensionar)
    return () => {
      window.removeEventListener('resize', alRedimensionar)
      window.removeEventListener('orientationchange', alRedimensionar)
    }
  }, [colocar])

  function alBajar(e: React.PointerEvent<HTMLDivElement>) {
    if (!caja.current) return
    const r = caja.current.getBoundingClientRect()
    arrastre.current = { x0: e.clientX, y0: e.clientY, ox: r.left, oy: r.top, movio: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function alMover(e: React.PointerEvent<HTMLDivElement>) {
    const a = arrastre.current
    if (!a) return
    const dx = e.clientX - a.x0
    const dy = e.clientY - a.y0
    if (!a.movio && Math.abs(dx) < UMBRAL_ARRASTRE && Math.abs(dy) < UMBRAL_ARRASTRE) return
    a.movio = true
    colocar(a.ox + dx, a.oy + dy)
  }

  function alSoltar() {
    const a = arrastre.current
    arrastre.current = null
    if (!a?.movio || !caja.current) return
    const r = caja.current.getBoundingClientRect()
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ x: r.left, y: r.top }))
    } catch {
      /* sin persistencia esta vez, no es grave */
    }
  }

  // Se muestra a quien esté hablando; si no habla nadie, al primero que haya.
  // Mirar un recuadro fijo mientras habla otro es peor que no mostrar ninguno.
  const hablandoAhora = participantes.find((p) => quienesHablan.has(p.integranteId))
  const enPantalla = hablandoAhora ?? participantes[0]
  const persona = enPantalla ? personas.get(enPantalla.integranteId) : undefined
  const total = participantes.length + 1

  /**
   * Si hay una transmisión (propia o ajena) o un video de música cargado, la
   * tarjeta muestra ESO en vez de a quién se está oyendo -- es lo que uno
   * quiere ver minimizado: lo que se está compartiendo, no una cara fija.
   * Con las dos cosas a la vez, la tarjeta crece para que entren juntas en
   * vez de que una tape a la otra.
   */
  const pantallaAjena = participantes.find((p) => p.streamPantalla)?.streamPantalla ?? null
  const pantalla = streamPantallaPropia ?? pantallaAjena
  const hayContenido = hayMusica || Boolean(pantalla)
  const dosCosas = hayMusica && Boolean(pantalla)
  /**
   * El slot de música nunca baja de `LADO_MINIMO`: es el piso que exigen los
   * términos de la API de YouTube (200×200 visibles), y no se lo salta ni
   * acá adentro. Con las dos cosas a la vez, la pantalla compartida se
   * queda con lo que sobra (124px, el mismo alto que ya usaba sola) y la
   * tarjeta crece para que ninguna de las dos quede por debajo de su piso.
   */
  const altoContenido = !hayContenido ? 124 : dosCosas ? LADO_MINIMO + 124 + 8 : hayMusica ? LADO_MINIMO : 124
  /**
   * Con música, la tarjeta se ensancha de 232 a 356px -- a los 232 de
   * siempre, un video 16:9 a la altura mínima de YouTube (200px) queda
   * angosto, con franjas negras a los costados adentro del propio iframe
   * (YouTube las pone él solo para no deformar el video, no algo que se
   * pueda recortar por CSS desde acá afuera). 356×200 sí es 16:9 real.
   * Sin música, se queda en 232 -- una pantalla compartida no tiene esa
   * restricción de por medio.
   */
  const anchoTarjeta = hayMusica ? 356 : 232

  // La tarjeta cambia de alto sola cuando aparece o desaparece una
  // transmisión/video, no solo cuando cambia la ventana -- sin re-acotar
  // acá también, crecer estando cerca del borde inferior la sacaba de
  // pantalla sin que el efecto de arriba se enterara (ese solo escucha
  // resize/orientationchange).
  useEffect(() => {
    const el = caja.current
    if (!el) return
    const r = el.getBoundingClientRect()
    colocar(r.left, r.top)
  }, [colocar, altoContenido])

  return (
    <motion.div
      ref={caja}
      onPointerDown={alBajar}
      onPointerMove={alMover}
      onPointerUp={alSoltar}
      onPointerCancel={() => {
        arrastre.current = null
      }}
      role="dialog"
      aria-label="Llamada minimizada"
      initial={sinMovimiento ? false : { opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
      className="fixed bottom-24 right-3 z-[80] cursor-grab touch-none select-none
        overflow-hidden rounded-[24px] border border-white/[0.09] active:cursor-grabbing
        md:bottom-6 md:right-6"
      style={{
        width: anchoTarjeta,
        transition: 'width 160ms ease, background 160ms ease',
        // El video/pantalla es un elemento aparte que se posiciona DETRÁS de
        // esta tarjeta (ver el comentario de z-index en panel-llamada.tsx),
        // para que estos mismos botones queden por encima sin taparlo. Con
        // fondo y `backdropFilter: blur` acá, ese video se veía "a través
        // del vidrio esmerilado" -- difuminado. Sin contenido de por medio
        // (vista de "quién habla"), el fondo vuelve: no hay nada detrás que
        // deba verse nítido, y sin él el recuadro/avatar quedaría flotando
        // sin ningún marco.
        background: hayContenido ? 'transparent' : 'rgba(20,18,26,.92)',
        backdropFilter: hayContenido ? 'none' : 'blur(28px) saturate(150%)',
        boxShadow: '0 24px 60px rgba(0,0,0,.6)',
      }}
    >
      <div
        // Con contenido, sin padding ni redondeo propio en los hijos: el
        // video ocupa TODO el ancho/alto disponible hasta justo arriba de
        // la fila de botones, con las mismas esquinas de arriba que la
        // tarjeta (este wrapper las recorta por los dos). Antes el `p-2` +
        // el redondeo de cada video dejaba un marco negro alrededor,
        // achicando el video sin necesidad.
        className={hayContenido ? 'relative overflow-hidden rounded-t-[23px]' : 'relative p-2'}
        style={{ height: altoContenido, transition: 'height 160ms ease' }}
      >
        {hayContenido ? (
          <div className="flex h-full w-full flex-col gap-1">
            {/* Con las dos cosas a la vez, la música se queda con su alto
                fijo (el piso de YouTube) y la pantalla compartida con lo que
                sobra -- al revés se arriesgaba a dejar el video de música
                por debajo del mínimo que exigen sus términos. */}
            {pantalla && (
              <div className={dosCosas ? 'flex-1 min-h-0 w-full' : 'h-full w-full'}>
                <VideoPantalla stream={pantalla} />
              </div>
            )}
            {/* El iframe de YouTube se reparenta acá por fuera de React (ver
                `onAnclaMusica` en panel-llamada.tsx) -- este div solo le
                reserva el lugar y el tamaño. */}
            {hayMusica && (
              <div
                ref={onAnclaMusica}
                className="w-full"
                style={{ height: dosCosas ? LADO_MINIMO : '100%', flexShrink: 0 }}
              />
            )}
          </div>
        ) : (
          <>
            <Recuadro
              stream={enPantalla?.stream ?? null}
              persona={persona}
              hablando={Boolean(enPantalla && quienesHablan.has(enPantalla.integranteId))}
              camaraEncendida={enPantalla?.camara ?? false}
            />

            {/* Uno mismo, en miniatura sobre el recuadro grande — el mismo
                sitio donde lo pone cualquier app de videollamada. Solo
                tiene sentido acá: si ya se ve una transmisión o un video,
                la propia cámara en miniatura sobra. */}
            {camara && streamLocal && (
              <div className="absolute bottom-3.5 right-3.5 h-[42px] w-[56px] overflow-hidden rounded-[10px] border border-white/15">
                <Recuadro
                  stream={streamLocal}
                  persona={personas.get(miIntegranteId)}
                  hablando={false}
                  camaraEncendida={camara}
                />
              </div>
            )}
          </>
        )}

        {/* Para el arrastre igual que los controles de abajo. El contenedor
            hace `setPointerCapture` al bajar el puntero, y desde ese momento
            el `pointerup` se entrega al contenedor y no a este botón: el
            navegador dispara el `click` en el ancestro común, así que el
            botón no llegaba a enterarse y la llamada no se restauraba nunca. */}
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onRestaurar}
          aria-label="Volver a la llamada"
          className="absolute left-3.5 top-3.5 flex h-7 w-7 items-center justify-center rounded-full
            border border-white/15 bg-black/45 text-white transition-colors hover:bg-black/70"
        >
          <MaximizeIcon size={12} aria-hidden="true" />
        </button>

        <span
          className="absolute right-3.5 top-3.5 inline-flex items-center gap-1.5 rounded-full
            bg-black/45 px-2 py-1 text-[10px] font-medium text-white"
        >
          <span className="relative flex size-1.5">
            {!sinMovimiento && (
              <span
                className="absolute inline-flex size-full animate-ping rounded-full opacity-70"
                style={{ background: ensordecido ? 'var(--tx-warning)' : 'var(--tx-accent)' }}
              />
            )}
            <span
              className="relative inline-flex size-1.5 rounded-full"
              style={{ background: ensordecido ? 'var(--tx-warning)' : 'var(--tx-accent)' }}
            />
          </span>
          {total}
        </span>
      </div>

      {/* Con contenido, la tarjeta entera perdió su fondo (ver el `style` de
          arriba) para que el video/pantalla se vea nítido detrás -- esta
          fila necesita el suyo propio, si no quedaría transparente sobre lo
          que sea que haya en la página detrás de la tarjeta. */}
      <div
        className="flex items-center gap-1.5 px-3 pb-3 pt-2"
        style={hayContenido ? { background: 'rgba(20,18,26,.92)' } : undefined}
      >
        <p className="min-w-0 flex-1 truncate text-[12px] text-[var(--tx-ink-secondary)]">
          {ensordecido ? 'Ensordecido' : (persona?.nombre ?? 'En llamada')}
        </p>

        {/* Los controles paran el arrastre: sin esto, tocar "colgar" con el
            pulgar tembloroso movía el recuadro en vez de colgar.

            El rojo es EXCLUSIVO de colgar. Micro y cámara apagados se marcan
            en blanco tenue: cuando llevaban acento quedaban dos círculos rojos
            pegados al de colgar y se confundían — y equivocarse ahí corta la
            llamada, que no tiene deshacer. */}
        <div className="flex gap-1.5" onPointerDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={onAlternarMicro}
            aria-label={micro ? 'Silenciar micrófono' : 'Activar micrófono'}
            aria-pressed={!micro}
            className="flex h-8 w-8 items-center justify-center rounded-full border transition-colors"
            style={{
              borderColor: micro ? 'rgba(255,255,255,.12)' : 'transparent',
              background: micro ? 'transparent' : 'rgba(255,255,255,.16)',
              color: micro ? 'var(--tx-ink-secondary)' : '#ffffff',
            }}
          >
            {micro ? <MicIcon size={13} aria-hidden="true" /> : <MicOffIcon size={13} aria-hidden="true" />}
          </button>

          <button
            type="button"
            onClick={onAlternarCamara}
            aria-label={camara ? 'Apagar cámara' : 'Encender cámara'}
            aria-pressed={!camara}
            className="flex h-8 w-8 items-center justify-center rounded-full border transition-colors"
            style={{
              borderColor: camara ? 'rgba(255,255,255,.12)' : 'transparent',
              background: camara ? 'transparent' : 'rgba(255,255,255,.16)',
              color: camara ? 'var(--tx-ink-secondary)' : '#ffffff',
            }}
          >
            {camara ? (
              <VideoIcon size={13} aria-hidden="true" />
            ) : (
              <VideoOffIcon size={13} aria-hidden="true" />
            )}
          </button>

          {/* Ensordecer también aquí y no solo en la llamada abierta: el
              recuadro existe para poder seguir en otra cosa mientras se oye,
              y sin este botón, quien ensordecía tenía que restaurar la llamada
              entera para volver a escuchar — justo lo que venía a evitar. */}
          <button
            type="button"
            onClick={onAlternarEnsordecer}
            aria-label={ensordecido ? 'Volver a escuchar' : 'Dejar de oír a todos'}
            aria-pressed={ensordecido}
            className="flex h-8 w-8 items-center justify-center rounded-full border transition-colors"
            style={{
              borderColor: ensordecido ? 'transparent' : 'rgba(255,255,255,.12)',
              background: ensordecido ? 'rgba(255,255,255,.16)' : 'transparent',
              color: ensordecido ? '#ffffff' : 'var(--tx-ink-secondary)',
            }}
          >
            {ensordecido ? (
              <HeadphoneOffIcon size={13} aria-hidden="true" />
            ) : (
              <HeadphonesIcon size={13} aria-hidden="true" />
            )}
          </button>

          {/* Separado del par anterior: colgar no tiene deshacer y no puede
              quedar pegado a los interruptores que uno toca a cada rato. */}
          <button
            type="button"
            onClick={onColgar}
            aria-label="Colgar"
            className="ml-1 flex h-8 w-8 items-center justify-center rounded-full text-white transition-opacity hover:opacity-85"
            style={{ background: 'var(--tx-accent-surface)' }}
          >
            <PhoneOffIcon size={13} aria-hidden="true" />
          </button>
        </div>
      </div>
    </motion.div>
  )
}
