'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ClockIcon, XIcon } from 'lucide-react'
import { Popover } from '@base-ui/react/popover'

/**
 * Selector de hora del CRM.
 *
 * Como el de fecha, existe para no usar `<input type="time">`, que lo pinta el
 * sistema operativo y no respeta ningún token del proyecto.
 *
 * Es una lista de horas en punto y medias, no dos ruedas de hora y minuto: en
 * un CRM las reuniones y los plazos caen en :00 o :30 casi siempre, y una
 * rueda obliga a girar sesenta minutos para llegar al que uno quiere. Quien
 * necesite las 14:23 puede escribirlo en el campo.
 *
 * La franja empieza a las 8 y termina a las 21: fuera de eso no hay nadie, y
 * ofrecer las 03:00 solo alarga la lista.
 */

interface SelectorHoraProps {
  /** 'HH:MM' o cadena vacía. */
  value: string
  onChange: (valor: string) => void
  placeholder?: string
  disabled?: boolean
  id?: string
}

const HORA_DESDE = 8
const HORA_HASTA = 21

/** Horas en punto y medias del horario laboral. */
function franjas(): string[] {
  const lista: string[] = []
  for (let h = HORA_DESDE; h <= HORA_HASTA; h += 1) {
    lista.push(`${String(h).padStart(2, '0')}:00`)
    if (h !== HORA_HASTA) lista.push(`${String(h).padStart(2, '0')}:30`)
  }
  return lista
}

/** Acepta 'H:M', 'HH:MM' o 'HH:MM:SS' y devuelve 'HH:MM'; null si no es hora. */
function normalizar(texto: string): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(texto.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

export function SelectorHora({
  value,
  onChange,
  placeholder = 'Sin hora',
  disabled = false,
  id,
}: SelectorHoraProps) {
  const [abierto, setAbierto] = useState(false)
  const lista = useMemo(() => franjas(), [])
  const contenedor = useRef<HTMLDivElement>(null)

  /**
   * Lo que se está tecleando, mientras se teclea.
   *
   * `null` significa "no hay nada a medias": el campo muestra `value`, que es
   * la verdad. Solo pasa a texto mientras el usuario escribe, y vuelve a
   * `null` al confirmar o al desistir.
   *
   * Es preferible a copiar `value` en estado y sincronizarlo con un efecto:
   * eso obliga a un `setState` dentro del efecto (render en cascada) y crea
   * dos fuentes de verdad que hay que mantener a la par.
   */
  const [borrador, setBorrador] = useState<string | null>(null)
  const texto = borrador ?? value

  /**
   * Al abrir, la hora elegida queda a la vista sin tener que buscarla.
   *
   * Se hace sobre el DOM y no con estado: aquí no hay nada que re-renderizar,
   * solo mover la vista del contenedor. El `requestAnimationFrame` espera a
   * que el popover esté montado — sin él, el nodo todavía no existe.
   */
  useEffect(() => {
    if (!abierto || !value) return
    const cuadro = requestAnimationFrame(() => {
      contenedor.current
        ?.querySelector('[data-elegida="true"]')
        ?.scrollIntoView({ block: 'center' })
    })
    return () => cancelAnimationFrame(cuadro)
  }, [abierto, value])

  function confirmarTexto() {
    const limpia = normalizar(texto)
    // Si no es una hora válida se descarta y el campo vuelve a `value`, en vez
    // de guardar basura o dejarlo en un estado imposible.
    if (limpia) onChange(limpia)
    setBorrador(null)
  }

  return (
    <Popover.Root open={abierto} onOpenChange={setAbierto}>
      {/* El campo ENTERO es el ancla del popover. Antes el disparador era un
          botón `sr-only`: la lista se posicionaba contra una caja de tamaño
          cero y aparecía descolocada respecto al campo. `render` deja que el
          disparador sea este mismo div sin añadir otro nodo. */}
      <Popover.Trigger
        disabled={disabled}
        render={<div />}
        // El disparador es un div, no un botón: dentro va un `<input>` de
        // texto, y anidar un campo editable dentro de un <button> rompe el
        // foco y las semánticas de formulario. `nativeButton={false}` le dice
        // a Base UI que es deliberado — sin esto avisa en cada render.
        nativeButton={false}
        className={`flex h-11 items-center gap-2 rounded-full border border-white/[0.09] px-4
          transition-colors ${disabled ? 'opacity-40' : 'focus-within:border-white/[0.2] hover:border-white/[0.16]'}`}
      >
        <ClockIcon size={15} className="shrink-0 text-[var(--tx-ink-muted)]" aria-hidden="true" />

        {/* Se puede teclear además de elegir: para una hora poco común como
            las 14:23, buscarla en una lista sería peor que escribirla. */}
        <input
          id={id}
          type="text"
          inputMode="numeric"
          disabled={disabled}
          value={texto}
          placeholder={placeholder}
          onChange={(e) => setBorrador(e.target.value)}
          onBlur={confirmarTexto}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              confirmarTexto()
              setAbierto(false)
            }
          }}
          onFocus={() => setAbierto(true)}
          className="w-[68px] bg-transparent text-[13px] tabular-nums text-[var(--tx-ink-primary)]
            outline-none placeholder:text-[var(--tx-ink-muted)] disabled:cursor-not-allowed"
        />

        {value && !disabled && (
          <button
            type="button"
            aria-label="Quitar hora"
            onClick={() => onChange('')}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full
              text-[var(--tx-ink-muted)] transition-colors hover:bg-white/[0.08] hover:text-[var(--tx-ink-primary)]"
          >
            <XIcon size={12} aria-hidden="true" />
          </button>
        )}

      </Popover.Trigger>

      <Popover.Portal>
        {/* `isolate z-50` en el POSITIONER, no solo en el popup: es el patrón
            que ya usan `select` y `dropdown-menu` del repo, y hace falta para
            que el calendario funcione dentro de un modal. El overlay del
            diálogo lleva `isolate`, que abre un contexto de apilamiento
            propio; sin esto el popover quedaba atrapado DETRÁS del contenido
            del modal — visible a medias y sin poder tocarlo. */}
        <Popover.Positioner sideOffset={8} align="start" className="isolate z-50">
          <Popover.Popup
            className="rounded-[20px] border border-white/[0.09] p-1.5 outline-none"
            style={{
              background: 'rgba(20,18,26,.96)',
              backdropFilter: 'blur(28px) saturate(150%)',
              boxShadow: '0 24px 60px rgba(0,0,0,.6)',
            }}
          >
            <div
              ref={contenedor}
              className="no-scrollbar max-h-[232px] w-[112px] overflow-y-auto"
            >
              {lista.map((h) => {
                const elegida = h === normalizar(value)
                return (
                  <button
                    key={h}
                    type="button"
                    data-elegida={elegida}
                    onClick={() => {
                      onChange(h)
                      setAbierto(false)
                    }}
                    className={`flex h-9 w-full items-center rounded-full px-3.5 text-[13px]
                      tabular-nums transition-colors ${
                        elegida
                          ? 'bg-[var(--tx-accent-surface)] font-medium text-white'
                          : 'text-[var(--tx-ink-secondary)] hover:bg-white/[0.07] hover:text-[var(--tx-ink-primary)]'
                      }`}
                  >
                    {h}
                  </button>
                )
              })}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
