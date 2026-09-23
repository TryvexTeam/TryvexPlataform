'use client'

import { useState, useTransition } from 'react'
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

type Resultado = { ok: true } | { ok: false; error: string }

interface EspacioAgenteProps {
  agentes: AgenteSala[]
  /** El hilo de CADA agente. Antes era uno solo, igual para los ocho. */
  hilos: Record<string, EntradaHilo[]>
  /** Todas las rutinas; se filtran por el agente elegido. */
  rutinas: Rutina[]
  herramientas: Herramienta[]
  /** Datos propios de cada agente para la columna lateral. */
  fichas: Record<string, { expiraAt: string | null; memoria: string[] }>
  /** Encolarle algo al agente elegido. Nace esperando permiso. */
  alEncolar: (datos: {
    agenteId: string
    tipo: 'tarea' | 'duda'
    titulo: string
    prioridad: 'baja' | 'media' | 'alta'
  }) => Promise<Resultado>
  /** Prender o apagar una rutina. Se guarda en la base, no solo en pantalla. */
  alCambiarRutina: (id: string, activa: boolean) => Promise<Resultado>
}

type Pestana = 'hilo' | 'rutinas' | 'herramientas'

export function EspacioAgente({
  agentes,
  hilos,
  rutinas: todasLasRutinas,
  herramientas,
  fichas,
  alEncolar,
  alCambiarRutina,
}: EspacioAgenteProps) {
  const [elegido, setElegido] = useState(agentes[0]?.id ?? '')
  const [pestana, setPestana] = useState<Pestana>('hilo')
  const [texto, setTexto] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()

  const agente = agentes.find((a) => a.id === elegido) ?? agentes[0]
  if (!agente) return null

  const hilo = hilos[agente.id] ?? []
  const rutinas = todasLasRutinas.filter((r) => r.agenteId === agente.id)
  const ficha = fichas[agente.id]

  const encargar = () => {
    const titulo = texto.trim()
    if (titulo.length < 3) return
    empezar(async () => {
      const r = await alEncolar({ agenteId: agente.id, tipo: 'tarea', titulo, prioridad: 'media' })
      if (r.ok) {
        setTexto('')
        setAviso(`Encolado. ${agente.nombre} lo verá, pero no lo trabajará hasta que alguien lo apruebe en la Cola.`)
      } else {
        setAviso(r.error)
      }
    })
  }

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
              {hilo.length === 0 ? (
                <p className="m-auto max-w-xs text-center text-xs text-[var(--tx-ink-muted)]">
                  Nadie le ha encargado nada a {agente.nombre} todavía. Lo que se le pida acá
                  aparece en este hilo, junto con su respuesta.
                </p>
              ) : (
                hilo.map((entrada, i) => <EntradaDelHilo key={i} entrada={entrada} />)
              )}
            </div>
            {aviso && (
              <p className="px-3 pt-2 text-[11px] text-[var(--tx-ink-secondary)]" role="status">
                {aviso}
              </p>
            )}
            <form
              className="flex items-center gap-2 p-3"
              style={{ borderTop: '1px solid var(--tx-border)' }}
              onSubmit={(e) => {
                e.preventDefault()
                encargar()
              }}
            >
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder={`Encárguele algo a ${agente.nombre}…`}
                maxLength={200}
                aria-label={`Encargo para ${agente.nombre}`}
                className="min-w-0 flex-1 rounded-xl px-3 py-2 text-xs"
                style={{
                  border: '1px solid var(--tx-border-strong)',
                  background: 'var(--tx-surface-2)',
                  color: 'var(--tx-ink-primary)',
                }}
              />
              <Button size="sm" type="submit" disabled={pendiente || texto.trim().length < 3}>
                Encargar
              </Button>
            </form>
          </>
        )}

        {pestana === 'rutinas' && (
          <div className="flex flex-col gap-2.5 overflow-auto p-3.5">
            {rutinas.length === 0 && (
              <p className="text-xs text-[var(--tx-ink-muted)]">
                {agente.nombre} no ha declarado rutinas. Las declara el propio agente con{' '}
                <code>PUT /api/agentes/rutinas</code>, y desde ahí se ve si corren a tiempo.
              </p>
            )}
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
                <span
                  className="text-[11px]"
                  style={{
                    color:
                      rutina.ultimaCorrida.includes('ATRASADA') || rutina.ultimaCorrida.includes('falló')
                        ? 'var(--tx-error)'
                        : 'var(--tx-ink-secondary)',
                  }}
                >
                  {rutina.ultimaCorrida}
                </span>
                <Switch
                  checked={rutina.activa}
                  disabled={pendiente}
                  onCheckedChange={(activa) =>
                    empezar(async () => {
                      const r = await alCambiarRutina(rutina.id, activa)
                      if (!r.ok) setAviso(r.error)
                    })
                  }
                  aria-label={`${rutina.activa ? 'Apagar' : 'Prender'} ${rutina.titulo}`}
                />
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
                {/*
                  Indicador, no interruptor: todas las rutas se abren con el mismo
                  token del agente. Un interruptor que se mueve y no guarda nada
                  enseña a desconfiar de toda la pantalla.
                */}
                <Badge
                  variant="secondary"
                  style={{ color: h.concedida ? 'var(--tx-success)' : 'var(--tx-ink-muted)' }}
                >
                  {h.concedida ? 'con su llave' : 'sin acceso'}
                </Badge>
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
          <dd className="text-[var(--tx-ink-primary)]">{agente.humano ?? 'sin integrante asociado'}</dd>
          <dt className="text-[var(--tx-ink-muted)]">Llave</dt>
          <dd className="text-[var(--tx-ink-primary)]">
            {ficha?.expiraAt
              ? `txa_•••••• · vence ${new Date(ficha.expiraAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}`
              : 'txa_•••••• · sin vencimiento'}
          </dd>
        </dl>

        <div>
          <p className="mb-1.5 text-[10px] uppercase tracking-wider text-[var(--tx-ink-muted)]">
            Lo que dejó en el Cerebro
          </p>
          {ficha && ficha.memoria.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {ficha.memoria.map((linea, i) => (
                <p
                  key={`${i}-${linea}`}
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
          ) : (
            <p className="text-[11px] text-[var(--tx-ink-muted)]">
              Todavía no ha registrado nada en el Cerebro.
            </p>
          )}
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
