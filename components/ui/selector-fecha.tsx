'use client'

import { useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, XIcon } from 'lucide-react'
import { Popover } from '@base-ui/react/popover'

/**
 * Selector de fecha del CRM.
 *
 * Existe porque `<input type="date">` lo dibuja el sistema operativo: ignora
 * los tokens del proyecto y cambia de aspecto entre Windows, macOS y Android.
 * En una interfaz cuidada al detalle, ese es el punto donde más canta.
 *
 * Un mes cabe entero en pantalla, así que se pinta completo: nada de listas
 * desplegables de días. Se navega por meses y se puede saltar a hoy de un
 * toque.
 *
 * Días laborales y fin de semana se distinguen a simple vista — el equipo
 * agenda de lunes a viernes, y ver el sábado apagado evita ponerle plazo a un
 * día en que no hay nadie.
 */

interface SelectorFechaProps {
  /** 'YYYY-MM-DD' o cadena vacía. */
  value: string
  onChange: (valor: string) => void
  /** Texto cuando no hay fecha elegida. */
  placeholder?: string
  disabled?: boolean
  id?: string
}

const DIAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** 'YYYY-MM-DD' de una fecha, en su día local (nunca UTC). */
function aISO(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

/**
 * Convierte 'YYYY-MM-DD' a Date sin pasar por el parser de ISO.
 *
 * `new Date('2026-08-19')` se interpreta como medianoche UTC, que en Santiago
 * es el día 18 por la tarde: el calendario marcaría el día anterior al elegido.
 * Construyéndola por partes, el día es el que dice la cadena.
 */
function desdeISO(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

function mismoDia(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** Las seis semanas de la cuadrícula, empezando en lunes. */
function diasDelMes(ancla: Date): Date[] {
  const primero = new Date(ancla.getFullYear(), ancla.getMonth(), 1)
  // getDay() da 0 el domingo; aquí la semana arranca el lunes.
  const desplazamiento = (primero.getDay() + 6) % 7
  const inicio = new Date(primero)
  inicio.setDate(primero.getDate() - desplazamiento)

  // Seis filas fijas: con cinco, un mes que empieza en domingo se sale de la
  // cuadrícula, y con filas variables el popover cambia de alto al navegar.
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(inicio)
    d.setDate(inicio.getDate() + i)
    return d
  })
}

export function SelectorFecha({
  value,
  onChange,
  placeholder = 'Sin fecha',
  disabled = false,
  id,
}: SelectorFechaProps) {
  const elegida = desdeISO(value)
  const [abierto, setAbierto] = useState(false)
  const [ancla, setAncla] = useState(() => elegida ?? new Date())
  const sinMovimiento = useReducedMotion()

  const hoy = useMemo(() => new Date(), [])
  const dias = useMemo(() => diasDelMes(ancla), [ancla])

  function moverMes(delta: number) {
    setAncla((a) => new Date(a.getFullYear(), a.getMonth() + delta, 1))
  }

  function elegir(d: Date) {
    onChange(aISO(d))
    setAbierto(false)
  }

  const etiqueta = elegida
    ? `${elegida.getDate()} ${MESES[elegida.getMonth()]?.slice(0, 3)} ${elegida.getFullYear()}`
    : placeholder

  return (
    <Popover.Root open={abierto} onOpenChange={setAbierto}>
      <Popover.Trigger
        id={id}
        disabled={disabled}
        className={`flex h-11 w-full items-center gap-2.5 rounded-full border border-white/[0.09]
          px-4 text-left text-[13px] transition-colors
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tx-accent-2)]
          disabled:cursor-not-allowed disabled:opacity-40
          ${elegida ? 'text-[var(--tx-ink-primary)]' : 'text-[var(--tx-ink-muted)]'}
          ${disabled ? '' : 'hover:border-white/[0.16]'}`}
      >
        <CalendarIcon size={15} className="shrink-0 text-[var(--tx-ink-muted)]" aria-hidden="true" />
        <span className="flex-1 truncate">{etiqueta}</span>

        {/* Limpiar va dentro del disparador, no como botón aparte: quitar la
            fecha es parte de elegirla, y un botón suelto al lado ensuciaría
            la fila del formulario. */}
        {elegida && !disabled && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Quitar fecha"
            onClick={(e) => {
              e.stopPropagation()
              onChange('')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation()
                onChange('')
              }
            }}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full
              text-[var(--tx-ink-muted)] transition-colors hover:bg-white/[0.08] hover:text-[var(--tx-ink-primary)]"
          >
            <XIcon size={12} aria-hidden="true" />
          </span>
        )}
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="start">
          <Popover.Popup
            className="z-50 rounded-[22px] border border-white/[0.09] p-3.5 outline-none"
            style={{
              background: 'rgba(20,18,26,.96)',
              backdropFilter: 'blur(28px) saturate(150%)',
              boxShadow: '0 24px 60px rgba(0,0,0,.6)',
            }}
          >
            <div className="mb-3 flex items-center gap-1">
              <p className="flex-1 pl-1.5 text-[13px] font-medium capitalize text-[var(--tx-ink-primary)]">
                {MESES[ancla.getMonth()]} {ancla.getFullYear()}
              </p>
              <button
                type="button"
                onClick={() => moverMes(-1)}
                aria-label="Mes anterior"
                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--tx-ink-secondary)]
                  transition-colors hover:bg-white/[0.07] hover:text-[var(--tx-ink-primary)]"
              >
                <ChevronLeftIcon size={15} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => moverMes(1)}
                aria-label="Mes siguiente"
                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--tx-ink-secondary)]
                  transition-colors hover:bg-white/[0.07] hover:text-[var(--tx-ink-primary)]"
              >
                <ChevronRightIcon size={15} aria-hidden="true" />
              </button>
            </div>

            <div className="mb-1.5 grid grid-cols-7 gap-0.5">
              {DIAS.map((d, i) => (
                <span
                  key={i}
                  className="flex h-7 items-center justify-center text-[10.5px] font-medium
                    uppercase tracking-[0.06em] text-[var(--tx-ink-muted)]"
                >
                  {d}
                </span>
              ))}
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${ancla.getFullYear()}-${ancla.getMonth()}`}
                className="grid grid-cols-7 gap-0.5"
                initial={sinMovimiento ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={sinMovimiento ? undefined : { opacity: 0 }}
                transition={{ duration: 0.12 }}
              >
                {dias.map((d) => {
                  const deOtroMes = d.getMonth() !== ancla.getMonth()
                  const esHoy = mismoDia(d, hoy)
                  const esElegida = elegida !== null && mismoDia(d, elegida)
                  const finDeSemana = d.getDay() === 0 || d.getDay() === 6

                  return (
                    <button
                      key={d.toISOString()}
                      type="button"
                      onClick={() => elegir(d)}
                      aria-current={esHoy ? 'date' : undefined}
                      aria-pressed={esElegida}
                      className="flex h-9 w-9 items-center justify-center rounded-full text-[13px]
                        tabular-nums transition-colors focus-visible:outline-2
                        focus-visible:outline-offset-1 focus-visible:outline-[var(--tx-accent-2)]"
                      style={
                        esElegida
                          ? { background: 'var(--tx-accent-surface)', color: '#ffffff', fontWeight: 500 }
                          : {
                              // Los días de otro mes se ven pero se apagan: quitarlos
                              // dejaría huecos que rompen la lectura de la cuadrícula.
                              color: deOtroMes
                                ? 'oklch(42% .006 240)'
                                : finDeSemana
                                  ? 'var(--tx-ink-muted)'
                                  : 'var(--tx-ink-primary)',
                              // Hoy va con anillo, no relleno: el relleno es de la
                              // fecha elegida, y con los dos rellenos no se sabría
                              // cuál es cuál.
                              boxShadow: esHoy ? 'inset 0 0 0 1px var(--tx-accent)' : undefined,
                            }
                      }
                      onMouseEnter={(e) => {
                        if (!esElegida) e.currentTarget.style.background = 'rgba(255,255,255,.07)'
                      }}
                      onMouseLeave={(e) => {
                        if (!esElegida) e.currentTarget.style.background = 'transparent'
                      }}
                    >
                      {d.getDate()}
                    </button>
                  )
                })}
              </motion.div>
            </AnimatePresence>

            <div className="mt-3 flex items-center gap-2 border-t border-white/[0.06] pt-3">
              <button
                type="button"
                onClick={() => elegir(new Date())}
                className="h-8 rounded-full border border-white/[0.09] px-3.5 text-[12px]
                  font-medium text-[var(--tx-ink-secondary)] transition-colors
                  hover:border-white/[0.16] hover:text-[var(--tx-ink-primary)]"
              >
                Hoy
              </button>
              <button
                type="button"
                onClick={() => {
                  const m = new Date()
                  m.setDate(m.getDate() + 1)
                  elegir(m)
                }}
                className="h-8 rounded-full border border-white/[0.09] px-3.5 text-[12px]
                  font-medium text-[var(--tx-ink-secondary)] transition-colors
                  hover:border-white/[0.16] hover:text-[var(--tx-ink-primary)]"
              >
                Mañana
              </button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
