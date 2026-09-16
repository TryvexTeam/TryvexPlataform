'use client'

import { useEffect, useRef, useState } from 'react'
import { PenLine, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CaraAgente } from './cara-agente'
import type { AgenteSala, Encargo, EstadoAgente, EstadoEncargo } from '@/lib/types/sala-agentes'

/**
 * La Sala: quiénes trabajan para Tryvex y en qué van.
 *
 * El orden de la pantalla no es decorativo, es el del trabajo:
 *
 *   1. Lo que está DETENIDO esperando a una persona. Un agente bloqueado por
 *      falta de firma no avanza por mucho que uno mire el resto, así que va
 *      arriba de todo y no en una notificación que se pierde.
 *   2. Quiénes son y qué hacen ahora.
 *   3. La cola de encargos, con su evidencia y su veredicto.
 *
 * La columna «A nombre de» existe por una deuda anotada en el cerebro: hoy lo
 * que hace Ariel aparece como Cristian, y no se puede saber quién hizo qué.
 * Mostrarlo es el primer paso para arreglarlo.
 */

interface SalaAgentesProps {
  agentes: AgenteSala[]
  encargos: Encargo[]
}

export function SalaAgentes({ agentes, encargos }: SalaAgentesProps) {
  const [firmados, setFirmados] = useState<string[]>([])
  const [firmando, setFirmando] = useState<string[]>([])
  const temporizadoresFirma = useRef<ReturnType<typeof setTimeout>[]>([])
  const porFirmar = encargos.filter(
    (e) => e.requiereFirma && e.estado === 'bloqueada' && !firmados.includes(e.id),
  )
  const porId = new Map(agentes.map((a) => [a.id, a]))

  useEffect(() => {
    const temporizadores = temporizadoresFirma.current
    return () => temporizadores.forEach(clearTimeout)
  }, [])

  const firmar = (id: string) => {
    if (firmando.includes(id) || firmados.includes(id)) return

    setFirmando((actuales) => [...actuales, id])
    temporizadoresFirma.current.push(
      setTimeout(() => {
        setFirmados((actuales) => [...actuales, id])
        setFirmando((actuales) => actuales.filter((actual) => actual !== id))
      }, 260),
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {porFirmar.length > 0 && (
        <section
          className="flex flex-col gap-3 rounded-2xl p-4"
          style={{
            border: '1px solid color-mix(in oklab, var(--tx-warning) 45%, transparent)',
            background: 'color-mix(in oklab, var(--tx-warning) 10%, transparent)',
          }}
          aria-labelledby="titulo-firmas"
        >
          <header className="flex flex-wrap items-center gap-2">
            <PenLine size={15} style={{ color: 'var(--tx-warning)' }} />
            <h2 id="titulo-firmas" className="text-sm font-semibold text-[var(--tx-ink-primary)]">
              Esperan tu firma antes de ejecutar
            </h2>
            <span className="text-xs text-[var(--tx-ink-muted)]">
              lo irreversible se firma antes, no después
            </span>
          </header>

          {porFirmar.map((encargo) => {
            const agente = porId.get(encargo.agenteId)
            const estaFirmando = firmando.includes(encargo.id)
            return (
              <article
                key={encargo.id}
                className={`flex flex-wrap items-center gap-3 rounded-xl p-3 ${
                  estaFirmando ? 'opacity-0 motion-safe:translate-x-3' : 'opacity-100'
                }`}
                style={{
                  border: '1px solid var(--tx-border)',
                  background: 'var(--tx-surface-1)',
                  transition: 'opacity 260ms ease, transform 260ms ease',
                }}
              >
                {agente && (
                  <CaraAgente
                    nombre={agente.nombre}
                    color={agente.color}
                    estado={agente.estado}
                    tamano={30}
                  />
                )}
                <div className="min-w-50 flex-1">
                  <p className="text-sm text-[var(--tx-ink-primary)]">{encargo.titulo}</p>
                  <p className="mt-0.5 text-xs text-[var(--tx-ink-muted)]">
                    {agente?.nombre ?? 'Agente'} · encargo #{encargo.id} ·{' '}
                    {encargo.porQueIrreversible}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">
                    Ver evidencia
                  </Button>
                  <Button
                    size="sm"
                    disabled={estaFirmando}
                    onClick={() => firmar(encargo.id)}
                    style={{ background: 'var(--tx-success)', color: 'var(--tx-accent-fg)' }}
                  >
                    {estaFirmando ? 'Firmando…' : 'Firmar y soltar'}
                  </Button>
                </div>
              </article>
            )
          })}
        </section>
      )}

      <section aria-labelledby="titulo-roster" className="flex flex-col gap-3">
        <header className="flex flex-wrap items-baseline gap-2">
          <h2 id="titulo-roster" className="text-sm font-semibold text-[var(--tx-ink-primary)]">
            Quiénes trabajan para Tryvex
          </h2>
          <span className="text-xs text-[var(--tx-ink-muted)]">
            {agentes.length} agentes ·{' '}
            {agentes.filter((a) => a.estado === 'trabajando').length} trabajando ahora
          </span>
        </header>

        <div className="grid items-stretch gap-3 [grid-template-columns:repeat(auto-fill,minmax(268px,1fr))]">
          {agentes.map((agente, i) => (
            <article
              key={agente.id}
              className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 flex h-full cursor-pointer flex-col gap-2.5 rounded-2xl p-3.5 hover:shadow-[0_10px_24px_rgba(0,0,0,.28)] motion-safe:hover:-translate-y-[3px] focus-visible:shadow-[0_10px_24px_rgba(0,0,0,.28)] motion-safe:focus-visible:-translate-y-[3px]"
              style={{
                border: '1px solid #d9d9e3',
                background: '#f4f4f7',
                transition: 'transform 220ms ease, box-shadow 220ms ease',
                animationDelay: `${i * 60}ms`,
              }}
              tabIndex={0}
            >
              <div className="flex items-center gap-2.5">
                <CaraAgente
                  nombre={agente.nombre}
                  color={agente.color}
                  estado={agente.estado}
                  tamano={38}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#14141b]">
                    {agente.nombre}
                  </p>
                  <p className="line-clamp-2 min-h-8 text-xs text-[#5c5c70]">{agente.oficio}</p>
                </div>
                <InsigniaEstado estado={agente.estado} />
              </div>

              <p
                className="min-h-13 flex-1 rounded-xl p-2.5 text-xs text-[#3a3a48]"
                style={{ border: '1px solid #dcdce6', background: '#e9e9f0' }}
              >
                <span className="mb-1 block text-[10px] uppercase tracking-wider text-[#6b6b80]">
                  {agente.estado === 'en_reposo' ? 'Última vez' : 'Ahora mismo'}
                </span>
                {agente.haciendo}
              </p>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#6b6b80]">
                <span>{agente.encargosHoy} encargos hoy</span>
                {agente.proximaRutina && <span>· rutina {agente.proximaRutina}</span>}
                {agente.humano && (
                  <span title="Hoy su trabajo se registra a nombre de esta persona">
                    · a nombre de {agente.humano}
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="titulo-encargos" className="flex flex-col gap-3">
        <header className="flex flex-wrap items-baseline gap-2">
          <h2 id="titulo-encargos" className="text-sm font-semibold text-[var(--tx-ink-primary)]">
            Encargos
          </h2>
          <span className="flex items-center gap-1.5 text-xs text-[var(--tx-ink-muted)]">
            <ShieldCheck size={12} /> nada se entrega sin evidencia
          </span>
        </header>

        <div
          className="overflow-x-auto rounded-2xl"
          style={{ border: '1px solid var(--tx-border)', background: 'var(--tx-surface-1)' }}
        >
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr style={{ background: 'var(--tx-surface-2)' }}>
                <Th>Encargo</Th>
                <Th>Agente</Th>
                <Th>Estado</Th>
                <Th>Evidencia</Th>
                <Th>Veredicto</Th>
                <Th>Pedido por</Th>
              </tr>
            </thead>
            <tbody>
              {encargos.map((encargo) => {
                const agente = porId.get(encargo.agenteId)
                return (
                  <tr
                    key={encargo.id}
                    className="hover:bg-[var(--tx-surface-2)]"
                    style={{
                      borderTop: '1px solid var(--tx-border)',
                      transition: 'background 160ms ease',
                    }}
                  >
                    <Td>
                      <span className="text-[var(--tx-ink-primary)]">{encargo.titulo}</span>
                    </Td>
                    <Td>
                      <span className="flex items-center gap-1.5">
                        {agente && (
                          <CaraAgente
                            nombre={agente.nombre}
                            color={agente.color}
                            estado={agente.estado}
                            tamano={20}
                          />
                        )}
                        {agente?.nombre ?? '—'}
                      </span>
                    </Td>
                    <Td>
                      <InsigniaEncargo estado={encargo.estado} requiereFirma={encargo.requiereFirma} />
                    </Td>
                    <Td>
                      {encargo.evidencias.length === 0 ? (
                        <span className="text-[var(--tx-ink-muted)]">—</span>
                      ) : (
                        <span className="text-[var(--tx-ink-muted)]">
                          {encargo.evidencias.map((e) => e.tipo).join(' · ')}
                        </span>
                      )}
                    </Td>
                    <Td>
                      {encargo.veredicto === 'pasa' && (
                        <Badge variant="secondary" style={{ color: 'var(--tx-success)' }}>
                          pasa
                        </Badge>
                      )}
                      {encargo.veredicto === 'falla' && (
                        <Badge variant="destructive">falla</Badge>
                      )}
                      {encargo.veredicto === null && (
                        <span className="text-[var(--tx-ink-muted)]">pendiente</span>
                      )}
                    </Td>
                    <Td>
                      <span className="text-[var(--tx-ink-muted)]">{encargo.pedidoPor}</span>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-[var(--tx-ink-muted)]">
      {children}
    </th>
  )
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2.5 align-middle">{children}</td>
}

function InsigniaEstado({ estado }: { estado: EstadoAgente }) {
  if (estado === 'trabajando') {
    return (
      <Badge variant="secondary" style={{ background: '#d8f3e3', color: '#0f6b3c' }}>
        trabajando
      </Badge>
    )
  }
  if (estado === 'esperando_firma') {
    return (
      <Badge variant="secondary" style={{ background: '#fdecd0', color: '#7a4a00' }}>
        espera firma
      </Badge>
    )
  }
  if (estado === 'sin_latido') {
    return <Badge variant="destructive" style={{ background: '#fadcd9', color: '#93231c' }}>sin latido</Badge>
  }
  return <Badge variant="outline" style={{ background: '#e4e4ec', color: '#4a4a58' }}>en reposo</Badge>
}

function InsigniaEncargo({
  estado,
  requiereFirma,
}: {
  estado: EstadoEncargo
  requiereFirma: boolean
}) {
  if (estado === 'bloqueada' && requiereFirma) {
    return (
      <Badge variant="secondary" style={{ color: 'var(--tx-accent)' }}>
        espera firma
      </Badge>
    )
  }
  if (estado === 'huerfana') return <Badge variant="destructive">huérfana</Badge>
  if (estado === 'listo') {
    return (
      <Badge variant="secondary" style={{ color: 'var(--tx-success)' }}>
        entregado
      </Badge>
    )
  }
  if (estado === 'probada') {
    return (
      <Badge variant="secondary" style={{ color: 'var(--tx-success)' }}>
        probada
      </Badge>
    )
  }
  if (estado === 'en_curso') {
    return (
      <Badge variant="secondary" style={{ color: 'var(--tx-blue)' }}>
        en curso
      </Badge>
    )
  }
  return <Badge variant="outline">sin empezar</Badge>
}
