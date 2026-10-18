'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Clock, Coffee } from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { enPausa, segundosTrabajados, type JornadaAbiertaDeEquipo } from '@/lib/types/jornada'
import { parseFechaLocal } from '@/lib/utils/fecha-santiago'

/**
 * Lo primero que se ve al abrir el CRM: qué debo yo, y quién está trabajando.
 *
 * Nace de algo que dijo Cristian el 11-sep-2026: *"mis compañeros de Tryvex no
 * hacen sus tareas —y me incluyo— como que no hay algo que nos obliga"*. Hoy
 * una tarea vencida el 8 de septiembre sigue ahí, callada, para siempre: hay
 * que entrar a Tareas y buscarla para enterarse.
 *
 * Dos decisiones suyas sobre el alcance:
 *   · De lo propio se ve el detalle; del equipo, solo el total. Señalar con
 *     nombre y apellido a quién debe qué expone a la gente sin que eso, por sí
 *     solo, haga que la tarea se haga.
 *   · Los conectados SÍ se ven con nombre, porque eso no es una deuda: es
 *     saber con quién cuentas ahora mismo.
 */

interface TareaAtrasada {
  id: string
  titulo: string
  fecha_limite: string | null
  prioridad: 'alta' | 'media' | 'baja'
}

interface PanelAtrasosProps {
  misAtrasadas: TareaAtrasada[]
  /** Total real de mis atrasadas: la lista viene recortada a unas pocas. */
  misAtrasadasTotal: number
  /** Solo el número, por decisión de alcance. `null` = sin permiso de equipo. */
  atrasadasEquipo: number | null
  conectados: JornadaAbiertaDeEquipo[]
  /** Para no contarse a uno mismo entre "los demás". */
  miIntegranteId: string | null
}

/** Días de Santiago que lleva vencida una fecha 'YYYY-MM-DD'. */
function diasDeAtraso(fecha: string): number {
  const hoy = new Date()
  const inicioDeHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  const ms = inicioDeHoy.getTime() - parseFechaLocal(fecha).getTime()
  return Math.max(0, Math.round(ms / 86_400_000))
}

function etiquetaAtraso(fecha: string | null): string {
  if (!fecha) return ''
  const dias = diasDeAtraso(fecha)
  if (dias === 0) return 'vence hoy'
  if (dias === 1) return '1 día'
  if (dias < 30) return `${dias} días`
  const meses = Math.floor(dias / 30)
  return meses === 1 ? '1 mes' : `${meses} meses`
}

/** 'h:mm' — sin segundos: un reloj que parpadea cada segundo pide mirarlo. */
function formatoHoras(segundos: number): string {
  const h = Math.floor(segundos / 3600)
  const m = Math.floor((segundos % 3600) / 60)
  return `${h}:${String(m).padStart(2, '0')}`
}

/**
 * El reloj de cada persona conectada.
 *
 * Se recalcula cada 30 s y no cada segundo a propósito: la portada tiene que
 * poder quedarse abierta sin que nada se mueva. El primer valor se pinta en el
 * servidor y el navegador lo ajusta al montar — la hora del servidor y la del
 * visitante no tienen por qué coincidir al segundo.
 */
function Reloj({ jornada }: { jornada: JornadaAbiertaDeEquipo }) {
  const [segundos, setSegundos] = useState(() =>
    segundosTrabajados(jornada, new Date()),
  )

  useEffect(() => {
    const id = setInterval(
      () => setSegundos(segundosTrabajados(jornada, new Date())),
      30_000,
    )
    return () => clearInterval(id)
  }, [jornada])

  const pausado = enPausa(jornada)
  return (
    <span
      className="flex items-center gap-1 text-[11px] font-medium tabular-nums"
      style={{ color: pausado ? 'var(--tx-ink-muted)' : 'oklch(72% 0.17 145)' }}
      title={pausado ? 'En pausa' : 'Jornada en curso'}
    >
      {pausado ? <Coffee size={11} /> : <Clock size={11} />}
      {formatoHoras(segundos)}
    </span>
  )
}

export function PanelAtrasos({
  misAtrasadas,
  misAtrasadasTotal,
  atrasadasEquipo,
  conectados,
  miIntegranteId,
}: PanelAtrasosProps) {
  const sinAtrasos = misAtrasadasTotal === 0
  // Los demás primero: en la lista de "quién está trabajando", uno mismo es el
  // dato que menos informa.
  const otros = conectados.filter((c) => c.integrante_id !== miIntegranteId)
  const yoConectado = conectados.find((c) => c.integrante_id === miIntegranteId) ?? null

  return (
    <section className="grid gap-3 md:grid-cols-[1.4fr_1fr]">
      {/* ─── Lo mío atrasado ─────────────────────────────────────────── */}
      <div
        className="min-w-0 rounded-2xl p-4"
        style={{
          background: sinAtrasos ? 'var(--tx-surface-1)' : 'oklch(63% 0.21 22 / 7%)',
          border: sinAtrasos
            ? '1px solid var(--tx-border)'
            : '1px solid oklch(63% 0.21 22 / 25%)',
        }}
      >
        {/* `flex-wrap` + `min-w-0`: en el teléfono el título y el contador del
            equipo no caben en la misma línea y, sin esto, el bloque empujaba la
            página 41px a lo ancho (medido a 390px de viewport). */}
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mb-3">
          <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-[var(--tx-ink-primary)]">
            {sinAtrasos ? (
              <CheckCircle2 size={15} className="shrink-0" style={{ color: 'oklch(72% 0.17 145)' }} />
            ) : (
              <AlertTriangle size={15} className="shrink-0" style={{ color: 'oklch(72% 0.17 22)' }} />
            )}
            <span className="min-w-0 truncate">
              {sinAtrasos
                ? 'No debes nada'
                : `Tienes ${misAtrasadasTotal} atrasada${misAtrasadasTotal === 1 ? '' : 's'}`}
            </span>
          </h2>

          {/* Del equipo solo el número: decisión de alcance, no un olvido. */}
          {atrasadasEquipo !== null && atrasadasEquipo > 0 && (
            <span className="shrink-0 text-[11px] text-[var(--tx-ink-muted)]">
              el equipo debe {atrasadasEquipo}
            </span>
          )}
        </div>

        {sinAtrasos ? (
          <p className="text-xs text-[var(--tx-ink-muted)]">
            Ninguna de tus tareas pasó su fecha.{' '}
            <Link href="/tareas" className="underline underline-offset-2 hover:text-[var(--tx-ink-secondary)]">
              Ver el tablero
            </Link>
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--tx-border)]">
            {misAtrasadas.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/tareas/${t.id}`}
                  className="flex items-center gap-2 py-2 min-w-0 transition-colors hover:bg-white/[0.03] rounded-lg px-1 -mx-1"
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{
                      background:
                        t.prioridad === 'alta'
                          ? 'oklch(63% 0.21 22)'
                          : t.prioridad === 'media'
                            ? 'oklch(74% 0.17 55)'
                            : 'oklch(72% 0.17 145)',
                    }}
                  />
                  <span className="flex-1 min-w-0 truncate text-[13px] text-[var(--tx-ink-primary)]">
                    {t.titulo}
                  </span>
                  <span
                    className="shrink-0 text-[11px] font-medium tabular-nums"
                    style={{ color: 'oklch(72% 0.17 22)' }}
                  >
                    {etiquetaAtraso(t.fecha_limite)}
                  </span>
                </Link>
              </li>
            ))}
            {misAtrasadasTotal > misAtrasadas.length && (
              <li className="pt-2">
                <Link
                  href="/tareas"
                  className="text-[11px] text-[var(--tx-ink-muted)] underline underline-offset-2 hover:text-[var(--tx-ink-secondary)]"
                >
                  y {misAtrasadasTotal - misAtrasadas.length} más
                </Link>
              </li>
            )}
          </ul>
        )}
      </div>

      {/* ─── Quién está trabajando ───────────────────────────────────── */}
      <div className="min-w-0 rounded-2xl p-4 bg-[var(--tx-surface-1)] border border-[var(--tx-border)]">
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-[var(--tx-ink-primary)] mb-3">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{
              background: conectados.length > 0 ? 'oklch(72% 0.17 145)' : 'var(--tx-ink-muted)',
            }}
          />
          {conectados.length === 0
            ? 'Nadie con jornada abierta'
            : `${conectados.length} en jornada`}
        </h2>

        {conectados.length === 0 ? (
          <p className="text-xs text-[var(--tx-ink-muted)]">
            <Link href="/jornada" className="underline underline-offset-2 hover:text-[var(--tx-ink-secondary)]">
              Empezar la mía
            </Link>
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {[...(yoConectado ? [yoConectado] : []), ...otros].map((j) => (
              <li key={j.id} className="flex items-center gap-2 min-w-0">
                <Avatar className="h-6 w-6 shrink-0">
                  <AvatarImage src={j.avatar_url ?? undefined} />
                  <AvatarFallback
                    className="text-[9px] font-bold"
                    style={{ background: 'var(--tx-surface-2)', color: 'var(--tx-ink-secondary)' }}
                  >
                    {j.nombre.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="flex-1 min-w-0 truncate text-[13px] text-[var(--tx-ink-secondary)]">
                  {j.integrante_id === miIntegranteId ? 'Tú' : j.nombre.split(' ')[0]}
                </span>
                <Reloj jornada={j} />
              </li>
            ))}
          </ul>
        )}

        {/* Si el resto trabaja y uno no marcó, que se note sin regañar. */}
        {!yoConectado && conectados.length > 0 && (
          <p className="mt-3 text-[11px] text-[var(--tx-ink-muted)]">
            Tú no has marcado entrada.{' '}
            <Link href="/jornada" className="underline underline-offset-2 hover:text-[var(--tx-ink-secondary)]">
              Empezar jornada
            </Link>
          </p>
        )}
      </div>
    </section>
  )
}
