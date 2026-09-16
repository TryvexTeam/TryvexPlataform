'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Check, Hand, MessageCircle, Undo2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CaraAgente } from './cara-agente'
import { espera, minutosDesde, useReloj } from '@/lib/vex/usar-reloj'
import type {
  AgenteSala,
  EstadoTraspaso,
  MotivoTraspaso,
  Traspaso,
} from '@/lib/types/sala-agentes'

/**
 * Lo que los agentes soltaron y espera a una persona.
 *
 * Forja tiene una bandeja de "tickets" ordenada por fecha. Suena razonable y es
 * la decisión equivocada: el que lleva más tiempo esperando no es el más
 * urgente. Un reclamo de hace diez minutos con el cliente mirando la pantalla
 * pesa más que una consulta de ayer que ya nadie espera.
 *
 * Por eso acá el orden lo da un peso: el motivo (un reclamo pesa más que una
 * consulta fuera de guion), si el cliente está esperando AHORA, y recién
 * después la antigüedad. Y cada tarjeta trae lo que el agente ya intentó, para
 * que quien lo tome no repita el mismo camino delante del cliente.
 */

interface PanelTraspasosProps {
  traspasos: Traspaso[]
  agentes: AgenteSala[]
}

/** Cuánto pesa cada motivo. Un reclamo no espera lo mismo que una consulta. */
const PESO_MOTIVO: Record<MotivoTraspaso, number> = {
  reclamo: 100,
  dato_sensible: 90,
  precio_no_autorizado: 70,
  pidio_humano: 60,
  tres_intentos: 40,
  fuera_de_guion: 25,
  sin_conocimiento: 20,
}

const TEXTO_MOTIVO: Record<MotivoTraspaso, string> = {
  reclamo: 'reclamo',
  dato_sensible: 'dato sensible',
  precio_no_autorizado: 'precio no autorizado',
  pidio_humano: 'pidió hablar con alguien',
  tres_intentos: 'no pudo en tres intentos',
  fuera_de_guion: 'fuera de guion',
  sin_conocimiento: 'no sabe la respuesta',
}

/** Motivos que no son un fallo del agente: hizo lo correcto al soltar. */
const FRENOS: MotivoTraspaso[] = ['precio_no_autorizado', 'dato_sensible', 'pidio_humano']

export function PanelTraspasos({ traspasos, agentes }: PanelTraspasosProps) {
  const [verCerrados, setVerCerrados] = useState(false)
  const porId = useMemo(() => new Map(agentes.map((a) => [a.id, a])), [agentes])

  // Un solo reloj para toda la aplicación (lib/vex/usar-reloj). Vale 0 hasta
  // que el navegador lo enciende: mientras tanto las esperas no se muestran,
  // en vez de mostrarse mal.
  const ahora = useReloj()

  const ordenados = useMemo(() => {
    const abiertos = traspasos.filter((t) => t.estado !== 'cerrado')
    const cerrados = traspasos.filter((t) => t.estado === 'cerrado')
    const peso = (t: Traspaso) =>
      PESO_MOTIVO[t.motivo] +
      (t.clienteEsperando ? 50 : 0) +
      (t.estado === 'devuelto' ? 30 : 0) +
      Math.min(30, minutosDesde(t.desde, ahora) / 20)
    abiertos.sort((a, b) => peso(b) - peso(a))
    return verCerrados ? [...abiertos, ...cerrados] : abiertos
  }, [traspasos, verCerrados, ahora])

  const esperando = traspasos.filter((t) => t.estado === 'esperando').length
  const conCliente = traspasos.filter((t) => t.clienteEsperando && t.estado !== 'cerrado').length

  return (
    <section aria-labelledby="titulo-traspasos" className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h2 id="titulo-traspasos" className="text-base font-semibold text-[var(--tx-ink-primary)]">
            Traspasos
          </h2>
          <p className="mt-1 text-xs text-[var(--tx-ink-muted)]">
            Lo que un agente soltó y espera a una persona. Ordenado por urgencia real, no por
            fecha.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setVerCerrados((v) => !v)}
          aria-pressed={verCerrados}
        >
          {verCerrados ? 'Ocultar cerrados' : 'Ver cerrados'}
        </Button>
      </header>

      {conCliente > 0 && (
        <p
          className="flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-xs text-[var(--tx-ink-secondary)]"
          style={{
            border: '1px solid color-mix(in oklab, var(--tx-error) 40%, transparent)',
            background: 'color-mix(in oklab, var(--tx-error) 9%, transparent)',
          }}
        >
          <AlertTriangle size={14} style={{ color: 'var(--tx-error)' }} />
          <span>
            <b className="text-[var(--tx-ink-primary)]">
              {conCliente} {conCliente === 1 ? 'persona está' : 'personas están'} esperando ahora
            </b>{' '}
            · el resto puede esperar, estas no.
          </span>
        </p>
      )}

      <p className="text-xs text-[var(--tx-ink-muted)]">
        <span className="tabular-nums text-[var(--tx-ink-secondary)]">{esperando}</span> sin dueño ·{' '}
        <span className="tabular-nums text-[var(--tx-ink-secondary)]">
          {traspasos.filter((t) => t.estado === 'tomado').length}
        </span>{' '}
        en manos de alguien
      </p>

      {ordenados.length === 0 ? (
        <p
          className="rounded-2xl p-6 text-center text-sm text-[var(--tx-ink-muted)]"
          style={{ border: '1px dashed var(--tx-border)' }}
        >
          Nadie está esperando. Los agentes resolvieron todo lo que entró.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {ordenados.map((traspaso) => {
            const agente = porId.get(traspaso.agenteId)
            const minutos = minutosDesde(traspaso.desde, ahora)
            const cerrado = traspaso.estado === 'cerrado'

            return (
              <li
                key={traspaso.id}
                className="flex flex-col gap-2.5 rounded-2xl p-3.5 transition-colors motion-safe:duration-200"
                style={{
                  border: `1px solid ${
                    traspaso.clienteEsperando && !cerrado
                      ? 'color-mix(in oklab, var(--tx-error) 38%, var(--tx-border))'
                      : 'var(--tx-border)'
                  }`,
                  background: 'var(--tx-surface-1)',
                  opacity: cerrado ? 0.6 : 1,
                }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="mr-auto text-sm font-semibold text-[var(--tx-ink-primary)]">
                    {traspaso.cliente}
                  </p>
                  <InsigniaMotivo motivo={traspaso.motivo} />
                  <InsigniaEstado estado={traspaso.estado} />
                </div>

                <p className="text-xs text-[var(--tx-ink-secondary)]">{traspaso.resumen}</p>

                <p
                  className="rounded-xl px-3 py-2 text-xs italic text-[var(--tx-ink-secondary)]"
                  style={{
                    background: 'var(--tx-surface-2)',
                    borderLeft: '3px solid var(--tx-border)',
                  }}
                >
                  &ldquo;{traspaso.ultimoMensaje}&rdquo;
                </p>

                {traspaso.intentos.length > 0 && !cerrado && (
                  <div>
                    <p className="text-[11px] text-[var(--tx-ink-muted)]">
                      Ya se intentó (no lo repita):
                    </p>
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {traspaso.intentos.map((intento) => (
                        <li
                          key={intento}
                          className="flex items-start gap-1.5 text-[11px] text-[var(--tx-ink-secondary)]"
                        >
                          <Undo2 size={11} className="mt-0.5 shrink-0 text-[var(--tx-ink-muted)]" />
                          {intento}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] text-[var(--tx-ink-muted)]">
                  {agente && (
                    <span className="flex items-center gap-1.5">
                      <CaraAgente
                        nombre={agente.nombre}
                        color={agente.color}
                        estado={agente.estado}
                        agenteId={agente.id}
                        tamano={18}
                      />
                      lo soltó {agente.nombre}
                    </span>
                  )}
                  {ahora > 0 && (
                    <span
                      className="tabular-nums"
                      style={{
                        color: traspaso.clienteEsperando && !cerrado ? 'var(--tx-error)' : undefined,
                      }}
                    >
                      espera {espera(minutos)}
                    </span>
                  )}
                  {traspaso.tomadoPor && <span>con {traspaso.tomadoPor}</span>}

                  {!cerrado && (
                    <span className="ml-auto flex gap-1.5">
                      <Button variant="outline" size="sm" className="h-7 gap-1.5 text-[11px]">
                        <MessageCircle size={12} />
                        Abrir hilo
                      </Button>
                      <Button size="sm" className="h-7 gap-1.5 text-[11px]">
                        {traspaso.estado === 'tomado' ? (
                          <>
                            <Check size={12} />
                            Cerrar
                          </>
                        ) : (
                          <>
                            <Hand size={12} />
                            Tomarlo
                          </>
                        )}
                      </Button>
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <p className="text-[11px] text-[var(--tx-ink-muted)]">
        Soltar no siempre es fallar: cuando el motivo es un freno (precio no autorizado, dato
        sensible, pidió hablar con alguien) el agente hizo exactamente lo que debía.
      </p>
    </section>
  )
}

function InsigniaMotivo({ motivo }: { motivo: MotivoTraspaso }) {
  const esFreno = FRENOS.includes(motivo)
  const grave = motivo === 'reclamo' || motivo === 'dato_sensible'

  return (
    <span
      className="rounded-md px-1.5 py-0.5 text-[10px]"
      style={{
        color: grave ? 'var(--tx-error)' : esFreno ? 'var(--tx-blue)' : 'var(--tx-warning)',
        background: grave
          ? 'color-mix(in oklab, var(--tx-error) 13%, transparent)'
          : esFreno
            ? 'color-mix(in oklab, var(--tx-blue) 13%, transparent)'
            : 'color-mix(in oklab, var(--tx-warning) 13%, transparent)',
      }}
      title={esFreno ? 'Un freno: el agente hizo lo correcto al soltar' : undefined}
    >
      {TEXTO_MOTIVO[motivo]}
    </span>
  )
}

function InsigniaEstado({ estado }: { estado: EstadoTraspaso }) {
  if (estado === 'esperando') return <Badge variant="outline">sin dueño</Badge>
  if (estado === 'tomado') {
    return (
      <Badge variant="secondary" style={{ color: 'var(--tx-success)' }}>
        tomado
      </Badge>
    )
  }
  if (estado === 'devuelto') return <Badge variant="destructive">devuelto</Badge>
  return <Badge variant="secondary">cerrado</Badge>
}
