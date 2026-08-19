'use client'

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  MaximizeIcon,
  MicIcon,
  MicOffIcon,
  PhoneOffIcon,
  VideoIcon,
  VideoOffIcon,
} from 'lucide-react'
import type { ParticipanteVivo } from './use-llamada'

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
  onColgar: () => void
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
  onAlternarMicro,
  onAlternarCamara,
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
    },
    [acotar],
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
      className="fixed bottom-24 right-3 z-[80] w-[232px] cursor-grab touch-none select-none
        overflow-hidden rounded-[24px] border border-white/[0.09] active:cursor-grabbing
        md:bottom-6 md:right-6"
      style={{
        background: 'rgba(20,18,26,.92)',
        backdropFilter: 'blur(28px) saturate(150%)',
        boxShadow: '0 24px 60px rgba(0,0,0,.6)',
      }}
    >
      <div className="relative h-[124px] p-2">
        <Recuadro
          stream={enPantalla?.stream ?? null}
          persona={persona}
          hablando={Boolean(enPantalla && quienesHablan.has(enPantalla.integranteId))}
          camaraEncendida={enPantalla?.camara ?? false}
        />

        {/* Uno mismo, en miniatura sobre el recuadro grande — el mismo sitio
            donde lo pone cualquier app de videollamada. */}
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

      <div className="flex items-center gap-1.5 px-3 pb-3">
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
