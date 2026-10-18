'use client'

import { useState } from 'react'
import { AtSign, Globe, MessageCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CaraAgente } from './cara-agente'
import { EntradaDelHilo } from './entrada-hilo'
import type { AgenteSala, ConversacionCliente } from '@/lib/types/sala-agentes'

/**
 * Conversaciones con gente de afuera.
 *
 * Lo que Forja llama `conversations`, con la diferencia que importa: el hilo
 * muestra lo que el agente HIZO entremedio. Ver "te confirmo el valor y te
 * aviso" sin saber que detrás hubo un freno de precio no dice nada; verlo con
 * el paso en rojo explica por qué ese lead quedó esperando y qué hay que
 * arreglar.
 *
 * Tres columnas, y el orden es el del trabajo: a quién atender, qué se dijo, y
 * con quién estoy hablando. La tercera evita el viaje a otra pestaña, que es
 * donde se pierde el contexto.
 */

interface PanelHilosProps {
  conversaciones: ConversacionCliente[]
  agentes: AgenteSala[]
}

const ICONO_CANAL = {
  whatsapp: MessageCircle,
  web: Globe,
  // Esta versión de lucide no trae marcas comerciales: `AtSign` es el genérico
  // para redes sociales y no envejece si mañana entra otro canal.
  instagram: AtSign,
} as const

export function PanelHilos({ conversaciones, agentes }: PanelHilosProps) {
  const [elegida, setElegida] = useState(conversaciones[0]?.id ?? '')
  const conversacion = conversaciones.find((c) => c.id === elegida) ?? conversaciones[0]
  const porId = new Map(agentes.map((a) => [a.id, a]))

  if (!conversacion) {
    return (
      <p className="p-6 text-sm text-[var(--tx-ink-muted)]">Todavía no hay conversaciones.</p>
    )
  }

  const agente = porId.get(conversacion.agenteId)

  return (
    <div className="grid gap-3 lg:[grid-template-columns:290px_minmax(0,1fr)_280px]">
      {/* A quién atender */}
      <aside
        className="flex max-h-[620px] flex-col overflow-auto rounded-2xl"
        style={{ border: '1px solid var(--tx-border)', background: 'var(--tx-surface-1)' }}
        aria-label="Conversaciones"
      >
        {conversaciones.map((c) => {
          const suAgente = porId.get(c.agenteId)
          const activa = c.id === conversacion.id
          const Icono = ICONO_CANAL[c.canal]

          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setElegida(c.id)}
              aria-pressed={activa}
              className="flex items-start gap-2.5 px-3 py-3 text-left transition-colors"
              style={{
                borderBottom: '1px solid var(--tx-border)',
                background: activa ? 'var(--tx-accent-subtle)' : 'transparent',
                boxShadow: activa ? 'inset 2px 0 0 var(--tx-accent)' : undefined,
              }}
            >
              {suAgente && (
                <CaraAgente
                  nombre={suAgente.nombre}
                  color={suAgente.color}
                  estado={suAgente.estado}
                  agenteId={suAgente.id}
                  tamano={30}
                />
              )}

              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <Icono size={11} className="shrink-0 text-[var(--tx-ink-muted)]" />
                  <span className="truncate text-xs font-semibold text-[var(--tx-ink-primary)]">
                    {c.cliente}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-[var(--tx-ink-muted)]">
                  {c.ultimoMensaje}
                </span>
                <span className="mt-1 flex items-center gap-1.5">
                  <span className="text-[10px] text-[var(--tx-ink-muted)]">{c.hace}</span>
                  {c.modo === 'HUMANO' && (
                    <Badge variant="secondary" style={{ color: 'var(--tx-blue)' }}>
                      lo llevás vos
                    </Badge>
                  )}
                </span>
              </span>

              {c.sinLeer > 0 && (
                <span
                  className="mt-0.5 rounded-full px-1.5 text-[10px] tabular-nums"
                  style={{ background: 'var(--tx-accent)', color: 'var(--tx-accent-fg)' }}
                >
                  {c.sinLeer}
                </span>
              )}
            </button>
          )
        })}
      </aside>

      {/* Qué se dijo, y qué se hizo */}
      <section
        className="flex max-h-[620px] min-h-100 flex-col overflow-hidden rounded-2xl"
        style={{ border: '1px solid var(--tx-border)', background: 'var(--tx-surface-1)' }}
        aria-label={`Conversación con ${conversacion.cliente}`}
      >
        <header
          className="flex flex-wrap items-center gap-2.5 px-3.5 py-3"
          style={{ borderBottom: '1px solid var(--tx-border)' }}
        >
          {agente && (
            <CaraAgente
              nombre={agente.nombre}
              color={agente.color}
              estado={agente.estado}
              agenteId={agente.id}
              tamano={28}
            />
          )}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-[var(--tx-ink-primary)]">
              {conversacion.cliente}
            </h2>
            <p className="truncate text-[11px] text-[var(--tx-ink-muted)]">
              {conversacion.telefono} · atiende {agente?.nombre ?? 'un agente'}
            </p>
          </div>

          {conversacion.modo === 'AI' ? (
            <Button variant="outline" size="sm">
              Tomar el control
            </Button>
          ) : (
            <Button variant="outline" size="sm">
              Devolvérselo al agente
            </Button>
          )}
        </header>

        <div className="flex flex-1 flex-col gap-2.5 overflow-auto p-3.5">
          {conversacion.hilo.map((entrada, i) => (
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
            {conversacion.modo === 'HUMANO'
              ? 'Escribí vos…'
              : 'Escribir acá calla al agente en este hilo'}
          </span>
          <Button size="sm">Enviar</Button>
        </div>
      </section>

      {/* Con quién estoy hablando */}
      <aside
        className="flex max-h-[620px] flex-col gap-3 overflow-auto rounded-2xl p-3.5"
        style={{ border: '1px solid var(--tx-border)', background: 'var(--tx-surface-1)' }}
        aria-label="Ficha del contacto"
      >
        <p className="text-[10px] uppercase tracking-wider text-[var(--tx-ink-muted)]">
          Con quién habla
        </p>

        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
          <dt className="text-[var(--tx-ink-muted)]">Negocio</dt>
          <dd className="text-[var(--tx-ink-primary)]">{conversacion.ficha.negocio}</dd>
          <dt className="text-[var(--tx-ink-muted)]">Rubro</dt>
          <dd className="text-[var(--tx-ink-primary)]">{conversacion.ficha.rubro}</dd>
          <dt className="text-[var(--tx-ink-muted)]">Comuna</dt>
          <dd className="text-[var(--tx-ink-primary)]">{conversacion.ficha.comuna}</dd>
          <dt className="text-[var(--tx-ink-muted)]">Estado</dt>
          <dd className="text-[var(--tx-ink-primary)]">{conversacion.ficha.estado}</dd>
        </dl>

        <div>
          <p className="mb-1.5 text-[10px] uppercase tracking-wider text-[var(--tx-ink-muted)]">
            Lo que su web ya resuelve
          </p>
          {conversacion.ficha.capacidadesWeb.length === 0 ? (
            <p className="text-[11px] text-[var(--tx-ink-muted)]">
              No sabemos: su sitio no se dejó revisar. No es lo mismo que «no tiene nada».
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {conversacion.ficha.capacidadesWeb.map((cap) => (
                <span
                  key={cap}
                  className="rounded-md px-1.5 py-0.5 text-[10px] text-[var(--tx-ink-secondary)]"
                  style={{ border: '1px solid var(--tx-border)', background: 'var(--tx-surface-2)' }}
                >
                  {cap}
                </span>
              ))}
            </div>
          )}
          <p className="mt-1.5 text-[10px] text-[var(--tx-ink-muted)]">
            El agente no le ofrece lo que ya tiene resuelto.
          </p>
        </div>

        <Button variant="outline" size="sm" className="mt-auto w-full">
          Abrir la ficha en el CRM
        </Button>
      </aside>
    </div>
  )
}
