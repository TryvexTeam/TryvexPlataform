'use client'

import { useState, useTransition } from 'react'
import { Check, Hand, Sparkles, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CaraAgente } from './cara-agente'
import type { Mejora } from '@/lib/repos/intelligence-equipo'
import type { AgenteSala } from '@/lib/types/sala-agentes'

/**
 * Lo que los agentes proponen cambiar de sí mismos.
 *
 * Forja genera "mejoras" y deja un botón para aplicarlas. Eso es darle al bot
 * la llave de su propio guion: con el tiempo se reescribe a partir de sus
 * propias conclusiones, sin que nadie las revise.
 *
 * Acá un agente propone, con la evidencia que lo justifica, y una persona
 * decide. Tres pasos que no se saltan: propuesta → aprobada → aplicada. La base
 * impide aprobar sin firma, y la acción de aplicar solo acepta lo aprobado.
 */

type Resultado = { ok: true } | { ok: false; error: string }

interface PanelMejorasProps {
  mejoras: Mejora[]
  agentes: AgenteSala[]
  alAprobar: (id: string) => Promise<Resultado>
  alAplicar: (id: string) => Promise<Resultado>
  alDescartar: (id: string, motivo: string) => Promise<Resultado>
}

const TEXTO_ESTADO: Record<Mejora['estado'], string> = {
  propuesta: 'esperando decisión',
  aprobada: 'aprobada, falta aplicarla',
  aplicada: 'aplicada',
  descartada: 'descartada',
}

export function PanelMejoras({ mejoras, agentes, alAprobar, alAplicar, alDescartar }: PanelMejorasProps) {
  const [aviso, setAviso] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()
  const porId = new Map(agentes.map((a) => [a.id, a]))

  const correr = (accion: () => Promise<Resultado>) =>
    empezar(async () => {
      const r = await accion()
      setAviso(r.ok ? null : r.error)
    })

  const abiertas = mejoras.filter((m) => m.estado === 'propuesta' || m.estado === 'aprobada')
  const cerradas = mejoras.filter((m) => m.estado === 'aplicada' || m.estado === 'descartada')

  return (
    <section aria-labelledby="titulo-mejoras" className="flex flex-col gap-4">
      <header>
        <h2 id="titulo-mejoras" className="text-base font-semibold text-[var(--tx-ink-primary)]">
          Mejoras
        </h2>
        <p className="mt-1 text-xs text-[var(--tx-ink-muted)]">
          Cambios que proponen los agentes a partir de lo que ven fallar. Un agente propone; una
          persona decide.
        </p>
      </header>

      {aviso && (
        <p
          className="rounded-xl px-3 py-2 text-xs"
          role="alert"
          style={{
            border: '1px solid color-mix(in oklab, var(--tx-error) 40%, transparent)',
            background: 'color-mix(in oklab, var(--tx-error) 10%, transparent)',
            color: 'var(--tx-ink-primary)',
          }}
        >
          {aviso}
        </p>
      )}

      {mejoras.length === 0 ? (
        <p
          className="flex flex-col items-center gap-2 rounded-2xl p-8 text-center text-sm text-[var(--tx-ink-muted)]"
          style={{ border: '1px dashed var(--tx-border)' }}
        >
          <Sparkles size={20} />
          Ningún agente ha propuesto mejoras todavía. Las propone el agente con{' '}
          <code>POST /api/agentes/mejoras</code>, siempre con la evidencia que la justifica.
        </p>
      ) : (
        <>
          <Lista
            mejoras={abiertas}
            porId={porId}
            pendiente={pendiente}
            alAprobar={(id) => correr(() => alAprobar(id))}
            alAplicar={(id) => correr(() => alAplicar(id))}
            alDescartar={(id, motivo) => correr(() => alDescartar(id, motivo))}
          />
          {cerradas.length > 0 && (
            <details className="rounded-2xl" style={{ border: '1px solid var(--tx-border)' }}>
              <summary className="cursor-pointer px-3.5 py-2.5 text-xs text-[var(--tx-ink-secondary)]">
                Historial · {cerradas.length}
              </summary>
              <div className="p-2.5">
                <Lista
                  mejoras={cerradas}
                  porId={porId}
                  pendiente={pendiente}
                  alAprobar={() => undefined}
                  alAplicar={() => undefined}
                  alDescartar={() => undefined}
                />
              </div>
            </details>
          )}
        </>
      )}
    </section>
  )
}

function Lista({
  mejoras,
  porId,
  pendiente,
  alAprobar,
  alAplicar,
  alDescartar,
}: {
  mejoras: Mejora[]
  porId: Map<string, AgenteSala>
  pendiente: boolean
  alAprobar: (id: string) => void
  alAplicar: (id: string) => void
  alDescartar: (id: string, motivo: string) => void
}) {
  return (
    <ul className="flex flex-col gap-2.5">
      {mejoras.map((m) => (
        <Tarjeta
          key={m.id}
          mejora={m}
          agente={m.agenteId ? porId.get(m.agenteId) : undefined}
          pendiente={pendiente}
          alAprobar={alAprobar}
          alAplicar={alAplicar}
          alDescartar={alDescartar}
        />
      ))}
    </ul>
  )
}

function Tarjeta({
  mejora,
  agente,
  pendiente,
  alAprobar,
  alAplicar,
  alDescartar,
}: {
  mejora: Mejora
  agente: AgenteSala | undefined
  pendiente: boolean
  alAprobar: (id: string) => void
  alAplicar: (id: string) => void
  alDescartar: (id: string, motivo: string) => void
}) {
  const [descartando, setDescartando] = useState(false)
  const [motivo, setMotivo] = useState('')

  return (
    <li
      className="flex flex-col gap-2.5 rounded-2xl p-3.5"
      style={{
        border:
          mejora.estado === 'propuesta'
            ? '1px solid color-mix(in oklab, var(--tx-warning) 45%, var(--tx-border))'
            : '1px solid var(--tx-border)',
        background: 'var(--tx-surface-1)',
      }}
    >
      <div className="flex flex-wrap items-start gap-2">
        <p className="mr-auto min-w-0 break-words text-sm font-semibold text-[var(--tx-ink-primary)]">
          {mejora.titulo}
        </p>
        <Badge variant={mejora.estado === 'descartada' ? 'destructive' : 'secondary'}>
          {TEXTO_ESTADO[mejora.estado]}
        </Badge>
      </div>

      {mejora.detalle && (
        <p className="whitespace-pre-wrap break-words text-xs text-[var(--tx-ink-secondary)]">
          {mejora.detalle}
        </p>
      )}

      {mejora.evidencia && (
        <p
          className="rounded-xl px-3 py-2 text-xs text-[var(--tx-ink-secondary)]"
          style={{ background: 'var(--tx-surface-2)', borderLeft: '3px solid var(--tx-blue)' }}
        >
          <span className="text-[var(--tx-ink-muted)]">En qué se basa: </span>
          {mejora.evidencia}
        </p>
      )}

      {mejora.motivoDescarte && (
        <p className="text-xs text-[var(--tx-ink-secondary)]">
          <span className="text-[var(--tx-ink-muted)]">Se descartó porque:</span> {mejora.motivoDescarte}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] text-[var(--tx-ink-muted)]">
        {agente && (
          <span className="flex items-center gap-1.5">
            <CaraAgente nombre={agente.nombre} color={agente.color} estado={agente.estado} agenteId={agente.id} tamano={18} />
            la propuso {agente.nombre}
          </span>
        )}
        <span>{mejora.hace}</span>
        {mejora.aprobadoPor && <span>aprobada por {mejora.aprobadoPor}</span>}

        <span className="ml-auto flex flex-wrap gap-1.5">
          {mejora.estado === 'propuesta' && !descartando && (
            <Button size="sm" className="h-7 gap-1.5 text-[11px]" disabled={pendiente} onClick={() => alAprobar(mejora.id)}>
              <Hand size={12} />
              Aprobar
            </Button>
          )}
          {mejora.estado === 'aprobada' && !descartando && (
            <Button size="sm" className="h-7 gap-1.5 text-[11px]" disabled={pendiente} onClick={() => alAplicar(mejora.id)}>
              <Check size={12} />
              Marcar aplicada
            </Button>
          )}
          {(mejora.estado === 'propuesta' || mejora.estado === 'aprobada') && !descartando && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-[11px]"
              disabled={pendiente}
              onClick={() => setDescartando(true)}
            >
              <X size={12} />
              Descartar
            </Button>
          )}
        </span>
      </div>

      {descartando && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Por qué no se aplica"
            aria-label="Motivo del descarte"
            className="w-full rounded-lg px-2.5 py-1.5 text-xs"
            style={{
              border: '1px solid var(--tx-border)',
              background: 'var(--tx-surface-2)',
              color: 'var(--tx-ink-primary)',
            }}
          />
          <div className="flex gap-1.5">
            <Button
              size="sm"
              className="h-7 text-[11px]"
              disabled={pendiente || motivo.trim().length < 3}
              onClick={() => {
                alDescartar(mejora.id, motivo)
                setDescartando(false)
                setMotivo('')
              }}
            >
              Confirmar
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => setDescartando(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}
