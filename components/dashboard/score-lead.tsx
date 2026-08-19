'use client'

import { motion, useReducedMotion } from 'framer-motion'

/**
 * Score de IA del lead — el que ya calcula el CRM (`score` 1–10, nullable en
 * `lib/types/lead.ts`). No hay campo nuevo ni escala inventada.
 *
 * 8–10 va en acento: vale llamarlo hoy. El resto en blanco. Cuando es `null`
 * se dice "sin calificar" — nunca un cero, que se leería como "score pésimo"
 * cuando en realidad significa "todavía no lo miró nadie".
 *
 * La barra se llena al entrar. Es el único movimiento de la tarjeta y sirve
 * para comparar de un vistazo: cuatro barras llenándose a distinta altura
 * ordenan la fila antes de que se lean los números.
 */

interface ScoreLeadProps {
  score: number | null
  /** Oculta la etiqueta y deja solo cifra + barra (filas compactas). */
  compacto?: boolean
  /** Posición en la lista: escalona el llenado. */
  indice?: number
}

const MAXIMO = 10
const UMBRAL_CALIENTE = 8

export function ScoreLead({ score, compacto = false, indice = 0 }: ScoreLeadProps) {
  const sinMovimiento = useReducedMotion()
  const caliente = score !== null && score >= UMBRAL_CALIENTE
  const descripcion =
    score === null ? 'Sin calificar por la IA' : `Score de IA: ${score} de ${MAXIMO}`

  return (
    <div>
      {!compacto && (
        <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--tx-ink-muted)]">
          Score IA
        </p>
      )}
      <div className={`flex items-center gap-2.5 ${compacto ? '' : 'mt-2'}`} title={descripcion}>
        <p
          className="text-xl font-semibold leading-none tracking-tight tabular-nums"
          style={{ color: caliente ? 'var(--tx-accent-2)' : 'var(--tx-ink-primary)' }}
        >
          {score === null ? (
            <span className="text-[var(--tx-ink-muted)]">—</span>
          ) : (
            <>
              {score}
              <span className="text-xs font-normal text-[var(--tx-ink-muted)]">/{MAXIMO}</span>
            </>
          )}
        </p>
        <div
          className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.08]"
          role="img"
          aria-label={descripcion}
        >
          {score !== null && (
            <motion.div
              className="h-1 rounded-full"
              initial={sinMovimiento ? false : { width: 0 }}
              animate={{ width: `${(score / MAXIMO) * 100}%` }}
              transition={{
                type: 'spring',
                stiffness: 180,
                damping: 24,
                delay: sinMovimiento ? 0 : 0.15 + indice * 0.06,
              }}
              style={{ background: caliente ? 'var(--tx-accent)' : 'rgba(255,255,255,.34)' }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
