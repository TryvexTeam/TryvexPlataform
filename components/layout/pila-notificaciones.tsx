'use client'

import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from 'framer-motion'
import {
  BellIcon,
  CalendarCheckIcon,
  CalendarClockIcon,
  DollarSignIcon,
  FolderKanbanIcon,
  ListChecksIcon,
  UserPlusIcon,
  XIcon,
} from 'lucide-react'
import type { Notificacion } from '@/lib/repos/notificaciones'

/**
 * Pila de notificaciones del mismo tipo, al modo del centro de notificaciones
 * de iOS: las del mismo grupo se apilan una sobre otra y se abren al tocarlas.
 *
 * Por qué apilar en vez de listar todo:
 * ocho avisos de "tarea asignada" en fila entierran el único de "cobro
 * próximo". Apilados, cada tipo ocupa un renglón y la bandeja vuelve a caber
 * de un vistazo — el usuario decide qué grupo abrir.
 *
 * Las tarjetas de atrás se ven asomando, escaladas y desplazadas hacia abajo.
 * Ese asomo es lo que dice "hay más" sin necesidad de un contador aparte,
 * aunque el contador también está para quien no lea la profundidad.
 *
 * Deslizar hacia la izquierda descarta. El umbral mira velocidad además de
 * distancia: un gesto rápido y corto es tan intencional como uno lento y
 * largo, y exigir solo distancia hace que los descartes rápidos reboten.
 */

interface PilaNotificacionesProps {
  tipo: string
  items: Notificacion[]
  onAbrir: (n: Notificacion) => void
  onDescartar: (ids: string[]) => void
}

const ICONOS: Record<string, React.ElementType> = {
  nuevo_cliente: UserPlusIcon,
  proyecto_asignado: FolderKanbanIcon,
  entrega_proxima: CalendarClockIcon,
  cobro_proximo: DollarSignIcon,
  tarea_asignada: ListChecksIcon,
  cita_invitado: CalendarCheckIcon,
}

const ETIQUETAS: Record<string, string> = {
  nuevo_cliente: 'Clientes',
  proyecto_asignado: 'Proyectos',
  entrega_proxima: 'Entregas',
  cobro_proximo: 'Cobros',
  tarea_asignada: 'Tareas',
  cita_invitado: 'Citas',
}

/** Cuántas tarjetas asoman por detrás. Más de dos y el borde inferior se ensucia. */
const ASOMAN = 2

/** Distancia (px) o velocidad (px/s) a partir de la cual el gesto descarta. */
const UMBRAL_DISTANCIA = 80
const UMBRAL_VELOCIDAD = 500

function tiempoRelativo(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  return d === 1 ? 'ayer' : `hace ${d} días`
}

/** Una tarjeta suelta, con su gesto de deslizar. */
function Tarjeta({
  n,
  onAbrir,
  onDescartar,
  compacta = false,
}: {
  n: Notificacion
  onAbrir: (n: Notificacion) => void
  onDescartar: (ids: string[]) => void
  compacta?: boolean
}) {
  const sinMovimiento = useReducedMotion()
  const Icono = ICONOS[n.tipo] ?? BellIcon

  function alSoltar(_: unknown, info: PanInfo) {
    const lejos = info.offset.x < -UMBRAL_DISTANCIA
    const rapido = info.velocity.x < -UMBRAL_VELOCIDAD
    if (lejos || rapido) onDescartar([n.id])
  }

  return (
    <motion.div
      layout={!sinMovimiento}
      drag={sinMovimiento ? false : 'x'}
      dragDirectionLock
      // Solo hacia la izquierda: a la derecha el arrastre se frena en seco,
      // así el gesto se descubre sin ofrecer una dirección que no hace nada.
      dragConstraints={{ left: -260, right: 0 }}
      dragElastic={{ left: 0.6, right: 0 }}
      onDragEnd={alSoltar}
      whileDrag={{ cursor: 'grabbing' }}
      exit={sinMovimiento ? { opacity: 0 } : { x: -340, opacity: 0, transition: { duration: 0.22 } }}
      className="relative"
    >
      <button
        type="button"
        onClick={() => onAbrir(n)}
        className={`flex w-full items-start gap-3 rounded-[20px] border border-white/[0.07] bg-[#1e1c23]
          text-left transition-colors hover:bg-[#25232b]
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tx-accent-2)]
          ${compacta ? 'px-3.5 py-3' : 'px-4 py-3.5'}`}
      >
        <span
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
          style={{
            background: n.leida ? 'rgba(255,255,255,.06)' : 'var(--tx-accent-subtle)',
            color: n.leida ? 'var(--tx-ink-muted)' : 'var(--tx-accent-2)',
          }}
        >
          <Icono size={15} aria-hidden="true" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium leading-snug text-[var(--tx-ink-primary)]">
              {n.titulo}
            </span>
            <span className="shrink-0 text-[10.5px] text-[var(--tx-ink-muted)]">
              {tiempoRelativo(n.created_at)}
            </span>
          </span>
          {n.cuerpo && (
            <span className="mt-1 block line-clamp-2 text-[12px] leading-snug text-[var(--tx-ink-secondary)]">
              {n.cuerpo}
            </span>
          )}
        </span>

        {!n.leida && (
          <span
            aria-label="Sin leer"
            className="mt-2 h-[7px] w-[7px] shrink-0 rounded-full"
            style={{ background: 'var(--tx-accent)' }}
          />
        )}
      </button>
    </motion.div>
  )
}

export function PilaNotificaciones({
  tipo,
  items,
  onAbrir,
  onDescartar,
}: PilaNotificacionesProps) {
  const [abierta, setAbierta] = useState(false)
  const sinMovimiento = useReducedMotion()

  if (items.length === 0) return null

  // Una sola no es pila: se pinta como tarjeta suelta y se ahorra el
  // desplegable, que sería un clic para no revelar nada.
  if (items.length === 1) {
    return (
      <Tarjeta n={items[0]!} onAbrir={onAbrir} onDescartar={onDescartar} />
    )
  }

  const sinLeer = items.filter((n) => !n.leida).length
  const etiqueta = ETIQUETAS[tipo] ?? 'Avisos'

  return (
    <div>
      {abierta ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 px-1 pb-0.5">
            <p className="text-[11px] font-medium uppercase tracking-[0.09em] text-[var(--tx-ink-muted)]">
              {etiqueta}
            </p>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => onDescartar(items.map((n) => n.id))}
              className="text-[11px] text-[var(--tx-ink-muted)] transition-colors hover:text-[var(--tx-accent-2)]"
            >
              Borrar grupo
            </button>
            <button
              type="button"
              onClick={() => setAbierta(false)}
              aria-label={`Contraer ${etiqueta}`}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-white/[0.09] text-[var(--tx-ink-muted)] transition-colors hover:text-[var(--tx-ink-primary)]"
            >
              <XIcon size={12} aria-hidden="true" />
            </button>
          </div>

          <AnimatePresence initial={false}>
            {items.map((n) => (
              <Tarjeta
                key={n.id}
                n={n}
                onAbrir={onAbrir}
                onDescartar={onDescartar}
                compacta
              />
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAbierta(true)}
          className="block w-full text-left"
          aria-label={`Abrir ${items.length} avisos de ${etiqueta}`}
        >
          {/* El contenedor lo dimensiona la tarjeta de delante; las de atrás
              son absolutas dentro de él, así que asoman por debajo sin alterar
              su altura. Nada de `z-index` negativo: eso las mandaba detrás del
              fondo del panel y desaparecían. Aquí el orden del DOM basta —
              van primero, la tarjeta real va después y queda encima. */}
          <div className="relative">
            {items.slice(1, 1 + ASOMAN).map((n, i) => (
              <div
                key={n.id}
                aria-hidden="true"
                className="absolute inset-0 rounded-[20px] border border-white/[0.06] bg-[#1b1a20]"
                style={{
                  transform: `translateY(${(i + 1) * 7}px) scale(${1 - (i + 1) * 0.035})`,
                }}
              />
            ))}

            <div
              className="relative flex items-start gap-3 rounded-[20px] border border-white/[0.07]
                bg-[#1e1c23] px-4 py-3.5 transition-colors hover:bg-[#25232b]"
            >
              <span
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
                style={{
                  background: sinLeer > 0 ? 'var(--tx-accent-subtle)' : 'rgba(255,255,255,.06)',
                  color: sinLeer > 0 ? 'var(--tx-accent-2)' : 'var(--tx-ink-muted)',
                }}
              >
                {(() => {
                  const Icono = ICONOS[tipo] ?? BellIcon
                  return <Icono size={15} aria-hidden="true" />
                })()}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium leading-snug text-[var(--tx-ink-primary)]">
                    {items[0]!.titulo}
                  </span>
                  <span className="shrink-0 text-[10.5px] text-[var(--tx-ink-muted)]">
                    {tiempoRelativo(items[0]!.created_at)}
                  </span>
                </span>
                <span className="mt-1 block text-[12px] text-[var(--tx-ink-secondary)]">
                  {items.length} avisos de {etiqueta.toLowerCase()}
                  {sinLeer > 0 && ` · ${sinLeer} sin leer`}
                </span>
              </span>

              {sinLeer > 0 && (
                <span
                  aria-hidden="true"
                  className="mt-2 h-[7px] w-[7px] shrink-0 rounded-full"
                  style={{ background: 'var(--tx-accent)' }}
                />
              )}
            </div>
          </div>

          {/* El hueco que dejan las tarjetas asomando por debajo. */}
          <div style={{ height: ASOMAN * 7 }} aria-hidden="true" />
        </button>
      )}

      {/* Sin esto, contraer un grupo largo salta de golpe. */}
      {!sinMovimiento && <motion.div layout />}
    </div>
  )
}
