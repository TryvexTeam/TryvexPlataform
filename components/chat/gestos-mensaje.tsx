'use client'

import { useRef, useState } from 'react'
import { CopyIcon, MessageSquareIcon, PinIcon, PinOffIcon, ReplyIcon, Trash2Icon, XIcon } from 'lucide-react'
import { EMOJIS_RAPIDOS } from '@/lib/types/chat'

interface GestosMensajeProps {
  puedeBorrar: boolean
  /** Copiar el mensaje. `undefined` en un adjunto sin pie: no hay qué copiar. */
  onCopiar?: () => void
  /** Si el mensaje ya está fijado, para saber si el gesto fija o desfija. */
  fijado?: boolean
  onResponder: () => void
  onAbrirHilo: () => void
  onBorrar: () => void
  onReaccionar?: (emoji: string) => void
  onFijar?: () => void
  children: React.ReactNode
}

/** Cuánto hay que arrastrar para que el gesto cuente. */
const UMBRAL_DESLIZAR = 60
/** Cuánto hay que sostener para que se abra el menú. */
const MS_PARA_MENU = 450
/** Un dedo nunca queda del todo quieto: por debajo de esto sigue siendo "presionar". */
const TOLERANCIA_MOVIMIENTO = 10

/**
 * Gestos táctiles sobre un mensaje, como en WhatsApp o Telegram.
 *
 *   · Deslizar hacia la derecha → responder.
 *   · Mantener presionado → menú con la fila de emoji, responder, hilo, fijar
 *     y eliminar. Es decir: TODO lo que ofrece la barra de hover.
 *
 * En un teléfono no hay hover, así que los botones que aparecen al pasar el mouse
 * no existen: sin esto, desde el celular no se podía responder, reaccionar,
 * fijar ni borrar nada.
 *
 * Solo escucha eventos táctiles. Con mouse siguen mandando los botones de hover,
 * que son más precisos y no dejan al usuario adivinando cuánto sostener.
 */
export function GestosMensaje({
  puedeBorrar,
  onCopiar,
  fijado,
  onResponder,
  onAbrirHilo,
  onBorrar,
  onReaccionar,
  onFijar,
  children,
}: GestosMensajeProps) {
  const [desplazado, setDesplazado] = useState(0)
  const [menuAbierto, setMenuAbierto] = useState(false)
  const inicio = useRef<{ x: number; y: number } | null>(null)
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)
  const yaDisparo = useRef(false)

  const cancelarEspera = () => {
    if (temporizador.current) clearTimeout(temporizador.current)
    temporizador.current = null
  }

  const alTocar = (e: React.TouchEvent) => {
    const t = e.touches[0]
    inicio.current = { x: t.clientX, y: t.clientY }
    yaDisparo.current = false

    temporizador.current = setTimeout(() => {
      setMenuAbierto(true)
      yaDisparo.current = true
      // Un golpecito confirma que el gesto se registró, sin mirar la pantalla.
      navigator.vibrate?.(15)
    }, MS_PARA_MENU)
  }

  const alMover = (e: React.TouchEvent) => {
    if (!inicio.current) return
    const t = e.touches[0]
    const dx = t.clientX - inicio.current.x
    const dy = t.clientY - inicio.current.y

    // Si el dedo se movió, ya no es "mantener presionado".
    if (Math.abs(dx) > TOLERANCIA_MOVIMIENTO || Math.abs(dy) > TOLERANCIA_MOVIMIENTO) cancelarEspera()

    // Vertical manda: si está scrolleando la conversación, no se arrastra nada.
    if (Math.abs(dy) > Math.abs(dx)) return

    // Solo hacia la derecha, y con freno: pasado el umbral cuesta más seguir, que
    // es como se siente que ya alcanzó.
    if (dx > 0) setDesplazado(Math.min(dx, UMBRAL_DESLIZAR + (dx - UMBRAL_DESLIZAR) * 0.2))
  }

  const alSoltar = () => {
    cancelarEspera()

    if (desplazado >= UMBRAL_DESLIZAR && !yaDisparo.current) {
      navigator.vibrate?.(15)
      onResponder()
    }

    setDesplazado(0)
    inicio.current = null
  }

  const listo = desplazado >= UMBRAL_DESLIZAR

  return (
    <>
      <div className="relative">
        {/* La flecha asoma detrás del mensaje mientras se arrastra. */}
        {desplazado > 0 && (
          <span
            className="absolute left-0 top-1/2 -translate-y-1/2 grid place-items-center size-8 rounded-full transition-colors"
            style={{
              background: listo ? 'var(--tx-accent)' : 'rgba(255,255,255,0.08)',
              color: listo ? 'var(--tx-accent-fg)' : 'var(--tx-ink-muted)',
              opacity: Math.min(desplazado / UMBRAL_DESLIZAR, 1),
            }}
            aria-hidden
          >
            <ReplyIcon className="size-4" />
          </span>
        )}

        <div
          onTouchStart={alTocar}
          onTouchMove={alMover}
          onTouchEnd={alSoltar}
          onTouchCancel={alSoltar}
          style={{
            transform: `translateX(${desplazado}px)`,
            // Sin transición mientras el dedo arrastra: seguirlo con retraso se
            // siente pegajoso. La transición solo aparece al soltar.
            transition: desplazado === 0 ? 'transform 180ms ease-out' : 'none',
          }}
        >
          {children}
        </div>
      </div>

      {menuAbierto && (
        <HojaAcciones
          puedeBorrar={puedeBorrar}
          onCopiar={onCopiar}
          fijado={fijado}
          onCerrar={() => setMenuAbierto(false)}
          onResponder={onResponder}
          onAbrirHilo={onAbrirHilo}
          onBorrar={onBorrar}
          onReaccionar={onReaccionar}
          onFijar={onFijar}
        />
      )}
    </>
  )
}

function HojaAcciones({
  puedeBorrar,
  onCopiar,
  fijado,
  onCerrar,
  onResponder,
  onAbrirHilo,
  onBorrar,
  onReaccionar,
  onFijar,
}: {
  puedeBorrar: boolean
  onCopiar?: () => void
  fijado?: boolean
  onCerrar: () => void
  onResponder: () => void
  onAbrirHilo: () => void
  onBorrar: () => void
  onReaccionar?: (emoji: string) => void
  onFijar?: () => void
}) {
  const elegir = (accion: () => void) => () => {
    onCerrar()
    accion()
  }

  // Sin `md:hidden`: esta hoja solo se abre por un gesto táctil, y un notebook
  // o tablet con pantalla táctil también supera ese breakpoint. Ocultarla por
  // ancho dejaba el gesto disparando un menú invisible.
  return (
    <div className="fixed inset-0 z-50">
      <button
        onClick={onCerrar}
        aria-label="Cerrar"
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.6)' }}
      />

      <div
        className="absolute bottom-0 left-0 right-0 rounded-t-2xl p-3"
        style={{
          background: 'oklch(9% 0.004 240)',
          borderTop: '1px solid var(--tx-border)',
          paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))',
        }}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" aria-hidden />

        {/* La fila de emoji va arriba de todo: reaccionar es lo más frecuente y
            así queda al alcance del pulgar, sin recorrer la lista. */}
        {onReaccionar && (
          <div
            className="flex items-center justify-between gap-1 px-1 pb-3 mb-2"
            style={{ borderBottom: '1px solid var(--tx-border)' }}
          >
            {EMOJIS_RAPIDOS.map((emoji) => (
              <button
                key={emoji}
                onClick={elegir(() => onReaccionar(emoji))}
                aria-label={`Reaccionar con ${emoji}`}
                // 44px: el mínimo tocable, y aquí conviven seis en una fila.
                className="size-11 grid place-items-center rounded-full text-[22px] active:scale-90 transition-transform"
                style={{ background: 'oklch(100% 0 0 / 6%)' }}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        <Fila icono={<ReplyIcon className="size-4.5" />} onClick={elegir(onResponder)}>
          Responder
        </Fila>
        <Fila icono={<MessageSquareIcon className="size-4.5" />} onClick={elegir(onAbrirHilo)}>
          Abrir hilo
        </Fila>
        {/* Un adjunto sin pie no tiene texto que copiar, y una fila que no
            hace nada es peor que no tenerla. */}
        {onCopiar && (
          <Fila icono={<CopyIcon className="size-4.5" />} onClick={elegir(onCopiar)}>
            Copiar mensaje
          </Fila>
        )}
        {onFijar && (
          <Fila
            icono={fijado ? <PinOffIcon className="size-4.5" /> : <PinIcon className="size-4.5" />}
            onClick={elegir(onFijar)}
          >
            {fijado ? 'Dejar de fijar' : 'Fijar en la conversación'}
          </Fila>
        )}
        {puedeBorrar && (
          <Fila icono={<Trash2Icon className="size-4.5" />} onClick={elegir(onBorrar)} peligro>
            Eliminar
          </Fila>
        )}
        <Fila icono={<XIcon className="size-4.5" />} onClick={onCerrar}>
          Cancelar
        </Fila>
      </div>
    </div>
  )
}

function Fila({
  icono,
  onClick,
  peligro,
  children,
}: {
  icono: React.ReactNode
  onClick: () => void
  peligro?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      // 48px: el mínimo cómodo para un pulgar según las guías de ambas plataformas.
      className={`w-full flex items-center gap-3 px-3 min-h-12 rounded-xl text-[14px] ${
        peligro ? 'text-[oklch(70%_0.16_25)]' : 'text-[var(--tx-ink-primary)]'
      }`}
    >
      {icono}
      {children}
    </button>
  )
}
