'use client'

import { useState } from 'react'
import { AlertTriangle, Check, Clock, Zap } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { CaraAgente } from './cara-agente'
import type {
  AgenteSala,
  EntradaHilo,
  Herramienta,
  Paso,
  Rutina,
} from '@/lib/types/sala-agentes'

/**
 * El espacio de UN agente: su hilo, sus rutinas y sus llaves.
 *
 * Tres decisiones que vienen de cómo trabaja el equipo, no de la moda:
 *
 *   · El hilo mezcla lo que se dijo con lo que se HIZO. Los pasos («abrió 47
 *     sitios», «escribió 38 filas») no son adorno: son la transcripción que
 *     permite revisar sin ir a buscar un log a otra parte.
 *   · El veredicto se muestra con sus evidencias. Es el gate del loop, y verlo
 *     acá es lo que separa «dijo que lo hizo» de «está hecho».
 *   · Las rutinas viven en la pantalla principal del agente, no escondidas en
 *     ajustes: son su trabajo cuando nadie mira.
 */

interface EspacioAgenteProps {
  agentes: AgenteSala[]
  hilo: EntradaHilo[]
  rutinas: Rutina[]
  herramientas: Herramienta[]
}

type Pestana = 'hilo' | 'rutinas' | 'herramientas'

export function EspacioAgente({ agentes, hilo, rutinas, herramientas }: EspacioAgenteProps) {
  const [elegido, setElegido] = useState(agentes[2]?.id ?? agentes[0]?.id ?? '')
  const [pestana, setPestana] = useState<Pestana>('hilo')

  const agente = agentes.find((a) => a.id === elegido) ?? agentes[0]
  if (!agente) return null

  return (
    <div className="grid gap-3 lg:[grid-template-columns:232px_minmax(0,1fr)_290px]">
      {/* Quiénes hay */}
      <aside
        className="flex flex-col overflow-hidden rounded-2xl"
        style={{ border: '1px solid var(--tx-border)', background: 'var(--tx-surface-1)' }}
        aria-label="Agentes"
      >
        {agentes.map((a) => {
          const activo = a.id === agente.id
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => setElegido(a.id)}
              aria-pressed={activo}
              className="flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors"
              style={{
                borderBottom: '1px solid var(--tx-border)',
                background: activo ? 'var(--tx-accent-subtle)' : 'transparent',
                boxShadow: activo ? 'inset 2px 0 0 var(--tx-accent)' : undefined,
              }}
            >
              <CaraAgente nombre={a.nombre} color={a.color} estado={a.estado} tamano={26} />
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-[var(--tx-ink-primary)]">
                  {a.nombre}
                </span>
                <span className="block truncate text-[11px] text-[var(--tx-ink-muted)]">
                  {a.estado === 'esperando_firma' ? 'espera firma' : a.estado.replace('_', ' ')}
                </span>
              </span>
            </button>
          )
        })}
      </aside>

      {/* Su espacio */}
      <section
        className="flex min-h-100 flex-col overflow-hidden rounded-2xl"
        style={{ border: '1px solid var(--tx-border)', background: 'var(--tx-surface-1)' }}
        aria-label={`Espacio de ${agente.nombre}`}
      >
        <header
          className="flex flex-wrap items-center gap-2.5 px-3.5 py-3"
          style={{ borderBottom: '1px solid var(--tx-border)' }}
        >
          <CaraAgente nombre={agente.nombre} color={agente.color} estado={agente.estado} tamano={30} />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-[var(--tx-ink-primary)]">{agente.nombre}</h2>
            <p className="truncate text-xs text-[var(--tx-ink-muted)]">{agente.oficio}</p>
          </div>
        </header>

        <div className="flex gap-1 px-3" style={{ borderBottom: '1px solid var(--tx-border)' }} role="tablist">
          <Solapa activa={pestana === 'hilo'} onClick={() => setPestana('hilo')}>
            Hilo
          </Solapa>
          <Solapa activa={pestana === 'rutinas'} onClick={() => setPestana('rutinas')}>
            Rutinas · {rutinas.length}
          </Solapa>
          <Solapa activa={pestana === 'herramientas'} onClick={() => setPestana('herramientas')}>
            Herramientas · {herramientas.filter((h) => h.concedida).length}
          </Solapa>
        </div>

        {pestana === 'hilo' && (
          <>
            <div className="flex flex-1 flex-col gap-2.5 overflow-auto p-3.5">
              {hilo.map((entrada, i) => (
                <EntradaDelHilo key={i} entrada={entrada} />
              ))}
            </div>
            <div
              className="flex items-center gap-2 p-3"
              style={{ borderTop: '1px solid var(--tx-border)' }}
            >
              <span
                className="flex-1 rounded-xl px-3 py-2 text-xs text-[var(--tx-ink-muted)]"
                style={{ border: '1px solid var(--tx-border-strong)', background: 'var(--tx-surface-2)' }}
              >
                Encargale algo a {agente.nombre}…
              </span>
              <Button size="sm">Encargar</Button>
            </div>
          </>
        )}

        {pestana === 'rutinas' && (
          <div className="flex flex-col gap-2.5 overflow-auto p-3.5">
            {rutinas.map((rutina) => (
              <article
                key={rutina.id}
                className="flex flex-wrap items-center gap-3 rounded-xl p-3"
                style={{ border: '1px solid var(--tx-border)', background: 'var(--tx-surface-2)' }}
              >
                <Badge
                  variant="secondary"
                  style={{ color: rutina.disparo === 'reloj' ? 'var(--tx-blue)' : 'var(--tx-accent)' }}
                >
                  {rutina.disparo === 'reloj' ? <Clock size={11} /> : <Zap size={11} />}
                  {rutina.cuando}
                </Badge>
                <div className="min-w-50 flex-1">
                  <p className="text-xs font-semibold text-[var(--tx-ink-primary)]">{rutina.titulo}</p>
                  <p className="text-[11px] text-[var(--tx-ink-muted)]">{rutina.descripcion}</p>
                </div>
                <span className="text-[11px] text-[var(--tx-ink-secondary)]">{rutina.ultimaCorrida}</span>
                <Switch defaultChecked={rutina.activa} aria-label={rutina.titulo} />
              </article>
            ))}
            <p className="text-[11px] text-[var(--tx-ink-muted)]">
              Las rutinas son lo que el agente hace sin que nadie esté mirando.
            </p>
          </div>
        )}

        {pestana === 'herramientas' && (
          <div className="flex flex-col overflow-auto p-3.5">
            {herramientas.map((h) => (
              <div
                key={h.id}
                className="flex flex-wrap items-center gap-3 py-2.5"
                style={{ borderBottom: '1px solid var(--tx-border)' }}
              >
                <div className="min-w-50 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-xs text-[var(--tx-ink-primary)]">
                    {h.nombre}
                    {h.ruta && (
                      <code
                        className="rounded px-1.5 py-0.5 text-[11px]"
                        style={{ background: 'var(--tx-surface-2)', color: 'var(--tx-accent-2)' }}
                      >
                        {h.ruta}
                      </code>
                    )}
                    {h.exigeFirma && (
                      <Badge variant="secondary" style={{ color: 'var(--tx-accent)' }}>
                        exige firma
                      </Badge>
                    )}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--tx-ink-muted)]">{h.detalle}</p>
                </div>
                <Switch defaultChecked={h.concedida} aria-label={h.nombre} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Su ficha */}
      <aside
        className="flex flex-col gap-3 rounded-2xl p-3.5"
        style={{ border: '1px solid var(--tx-border)', background: 'var(--tx-surface-1)' }}
        aria-label={`Ficha de ${agente.nombre}`}
      >
        <div className="flex items-center gap-3">
          <CaraAgente nombre={agente.nombre} color={agente.color} estado={agente.estado} tamano={52} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--tx-ink-primary)]">{agente.nombre}</p>
            <p className="text-[11px] text-[var(--tx-ink-muted)]">{agente.oficio}</p>
          </div>
        </div>

        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
          <dt className="text-[var(--tx-ink-muted)]">Encargos hoy</dt>
          <dd className="text-[var(--tx-ink-primary)] tabular-nums">{agente.encargosHoy}</dd>
          <dt className="text-[var(--tx-ink-muted)]">A nombre de</dt>
          <dd className="text-[var(--tx-ink-primary)]">{agente.humano ?? 'sí mismo'}</dd>
          <dt className="text-[var(--tx-ink-muted)]">Llave</dt>
          <dd className="text-[var(--tx-ink-primary)]">txa_•••••• · expira 12-oct</dd>
          <dt className="text-[var(--tx-ink-muted)]">Máquina</dt>
          <dd className="text-[var(--tx-ink-primary)]">VPS · usuario propio</dd>
        </dl>

        <div>
          <p className="mb-1.5 text-[10px] uppercase tracking-wider text-[var(--tx-ink-muted)]">
            Lo que recuerda de su oficio
          </p>
          <div className="flex flex-col gap-1.5">
            {[
              'Una capacidad que no se ve en la web es «no sabemos», nunca «no la tiene».',
              'Las barberías de Ñuñoa responden mejor entre 11 y 13.',
              'Los sitios hechos con JavaScript hay que abrirlos con navegador.',
            ].map((linea) => (
              <p
                key={linea}
                className="rounded-r-lg py-1.5 pl-2.5 pr-2 text-[11px] text-[var(--tx-ink-secondary)]"
                style={{
                  borderLeft: '2px solid var(--tx-border-strong)',
                  background: 'var(--tx-surface-2)',
                }}
              >
                {linea}
              </p>
            ))}
          </div>
        </div>
      </aside>
    </div>
  )
}

function Solapa({
  activa,
  onClick,
  children,
}: {
  activa: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={activa}
      onClick={onClick}
      className="px-3 py-2.5 text-xs transition-colors"
      style={{
        color: activa ? 'var(--tx-ink-primary)' : 'var(--tx-ink-muted)',
        fontWeight: activa ? 600 : 400,
        borderBottom: `2px solid ${activa ? 'var(--tx-accent)' : 'transparent'}`,
      }}
    >
      {children}
    </button>
  )
}

function EntradaDelHilo({ entrada }: { entrada: EntradaHilo }) {
  if (entrada.clase === 'mensaje') {
    const mia = entrada.de === 'persona'
    return (
      <div
        className="max-w-[78%] rounded-2xl px-3 py-2 text-xs whitespace-pre-wrap"
        style={{
          alignSelf: mia ? 'flex-end' : 'flex-start',
          background: mia ? 'var(--tx-accent-subtle)' : 'var(--tx-surface-2)',
          border: `1px solid ${mia ? 'color-mix(in oklab, var(--tx-accent) 40%, transparent)' : 'var(--tx-border)'}`,
        }}
      >
        <span className="mb-1 block text-[10px] uppercase tracking-wider text-[var(--tx-ink-muted)]">
          {entrada.autor} · {entrada.hora}
        </span>
        <span className="text-[var(--tx-ink-primary)]">{entrada.texto}</span>
      </div>
    )
  }

  if (entrada.clase === 'pasos') {
    return (
      <div
        className="max-w-[78%] self-start overflow-hidden rounded-xl"
        style={{ border: '1px solid var(--tx-border)', background: 'var(--tx-surface-0)' }}
      >
        {entrada.pasos.map((paso) => (
          <PasoDelAgente key={paso.orden} paso={paso} />
        ))}
      </div>
    )
  }

  const pasa = entrada.resultado === 'pasa'
  return (
    <div
      className="flex max-w-[78%] flex-col gap-1.5 self-start rounded-xl p-3"
      style={{
        border: `1px solid ${pasa ? 'var(--tx-success)' : 'var(--tx-error)'}`,
        background: 'var(--tx-surface-2)',
      }}
    >
      <p
        className="flex items-center gap-1.5 text-xs font-semibold"
        style={{ color: pasa ? 'var(--tx-success)' : 'var(--tx-error)' }}
      >
        {pasa ? <Check size={13} /> : <AlertTriangle size={13} />}
        {pasa ? 'Entregado con evidencia' : 'No pasó el veredicto'}
      </p>
      <p className="text-[11px] text-[var(--tx-ink-secondary)]">{entrada.detalle}</p>
      <div className="flex flex-wrap gap-1.5">
        {entrada.evidencias.map((ev) => (
          <span
            key={`${ev.tipo}-${ev.resumen}`}
            className="rounded-md px-1.5 py-0.5 text-[10px] text-[var(--tx-ink-secondary)]"
            style={{ border: '1px solid var(--tx-border)', background: 'var(--tx-surface-1)' }}
          >
            {ev.tipo} · {ev.resumen}
          </span>
        ))}
      </div>
    </div>
  )
}

function PasoDelAgente({ paso }: { paso: Paso }) {
  const color =
    paso.resultado === 'ok'
      ? 'var(--tx-success)'
      : paso.resultado === 'aviso'
        ? 'var(--tx-warning)'
        : 'var(--tx-error)'

  return (
    <div
      className="flex items-center gap-2.5 px-3 py-1.5 text-[11px]"
      style={{ borderBottom: '1px solid var(--tx-border)' }}
    >
      <span
        className="grid size-4 place-items-center rounded text-[9px] text-white"
        style={{ background: color }}
        aria-hidden="true"
      >
        {paso.resultado === 'aviso' ? '!' : paso.orden}
      </span>
      <span className="min-w-0 flex-1 text-[var(--tx-ink-secondary)]">{paso.texto}</span>
      <span className="text-[10px] tabular-nums text-[var(--tx-ink-muted)]">{paso.duracion}</span>
    </div>
  )
}
