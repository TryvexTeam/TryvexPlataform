'use client'

import { AlertTriangle, AtSign, Camera, Globe, MessageCircle, Send } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CaraAgente } from './cara-agente'
import type { AgenteSala, Canal, EstadoCanal, TipoCanal } from '@/lib/types/sala-agentes'

/**
 * Por dónde entran y salen los mensajes.
 *
 * Forja lista conexiones con un punto verde o rojo. Eso alcanza cuando hay un
 * solo bot y un solo canal; acá esconde lo que decide el negocio, porque estos
 * canales NO son equivalentes:
 *
 *   · WhatsApp por Baileys no cuesta nada por mensaje, y si lo bloquean se
 *     pierde el número para siempre, sin apelación.
 *   · La API oficial no se bloquea, pero cobra por mensaje — y desde el
 *     1-oct-2026 también los de servicio, pasados los 1.000 del mes.
 *   · Instagram cierra la ventana a las 24 horas y usar la etiqueta de humano
 *     para responder con un bot cuesta el acceso a la API.
 *
 * Por eso cada canal declara su riesgo y sus plazos. Y por eso los avisos que
 * corren van arriba de todo: un canal se cae por no hacer algo a tiempo, no por
 * una falla técnica.
 */

interface PanelCanalesProps {
  canales: Canal[]
  agentes: AgenteSala[]
}

const ICONO: Record<TipoCanal, typeof Globe> = {
  whatsapp_baileys: MessageCircle,
  whatsapp_oficial: MessageCircle,
  web: Globe,
  instagram: Camera,
  telegram: Send,
  correo: AtSign,
}

const NOMBRE: Record<TipoCanal, string> = {
  whatsapp_baileys: 'WhatsApp · número propio',
  whatsapp_oficial: 'WhatsApp · API oficial',
  web: 'Chat en la web',
  instagram: 'Instagram',
  telegram: 'Telegram',
  correo: 'Correo',
}

export function PanelCanales({ canales, agentes }: PanelCanalesProps) {
  const porId = new Map(agentes.map((a) => [a.id, a]))
  // Los plazos que corren primero: un canal se cae por no hacer algo a tiempo.
  const conAviso = canales.filter((c) => c.aviso && c.aviso.severidad !== 'info')

  return (
    <section aria-labelledby="titulo-canales" className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h2 id="titulo-canales" className="text-base font-semibold text-[var(--tx-ink-primary)]">
            Canales
          </h2>
          <p className="mt-1 text-xs text-[var(--tx-ink-muted)]">
            Por dónde entra y sale el trabajo. No todos cuestan ni arriesgan lo mismo.
          </p>
        </div>
        <Button variant="outline" size="sm">
          Conectar canal
        </Button>
      </header>

      {conAviso.length > 0 && (
        <div
          className="flex flex-col gap-2 rounded-2xl p-3.5"
          style={{
            border: '1px solid color-mix(in oklab, var(--tx-warning) 45%, transparent)',
            background: 'color-mix(in oklab, var(--tx-warning) 10%, transparent)',
          }}
        >
          <p className="flex items-center gap-2 text-sm font-semibold text-[var(--tx-ink-primary)]">
            <AlertTriangle size={14} style={{ color: 'var(--tx-warning)' }} />
            Plazos que corren
          </p>
          {conAviso.map((canal) => (
            <p key={canal.id} className="text-xs text-[var(--tx-ink-secondary)]">
              <span
                className="font-medium"
                style={{
                  color:
                    canal.aviso?.severidad === 'critico'
                      ? 'var(--tx-error)'
                      : 'var(--tx-ink-primary)',
                }}
              >
                {canal.etiqueta}
              </span>{' '}
              · {canal.aviso?.texto}{' '}
              <span className="text-[var(--tx-ink-muted)]">({canal.aviso?.cuando})</span>
            </p>
          ))}
        </div>
      )}

      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
        {canales.map((canal) => {
          const Icono = ICONO[canal.tipo]
          const agente = porId.get(canal.agenteId)

          return (
            <article
              key={canal.id}
              className="flex h-full flex-col gap-2.5 rounded-2xl p-3.5"
              style={{ border: '1px solid var(--tx-border)', background: 'var(--tx-surface-1)' }}
            >
              <div className="flex items-start gap-2.5">
                <span
                  className="grid size-8 shrink-0 place-items-center rounded-xl"
                  style={{ background: 'var(--tx-surface-2)', border: '1px solid var(--tx-border)' }}
                >
                  <Icono size={15} className="text-[var(--tx-ink-secondary)]" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-[var(--tx-ink-muted)]">{NOMBRE[canal.tipo]}</p>
                  <p className="truncate text-sm font-semibold text-[var(--tx-ink-primary)]">
                    {canal.etiqueta}
                  </p>
                </div>

                <InsigniaCanal estado={canal.estado} />
              </div>

              <p className="flex-1 text-xs text-[var(--tx-ink-secondary)]">{canal.nota}</p>

              {canal.salida && (
                <p
                  className="rounded-lg px-2.5 py-1.5 text-[11px] text-[var(--tx-ink-secondary)]"
                  style={{ background: 'var(--tx-surface-2)', border: '1px solid var(--tx-border)' }}
                >
                  <span className="text-[var(--tx-ink-muted)]">Sale por:</span> {canal.salida}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-[var(--tx-ink-muted)]">
                {agente && (
                  <span className="flex items-center gap-1.5">
                    <CaraAgente
                      nombre={agente.nombre}
                      color={agente.color}
                      estado={agente.estado}
                      agenteId={agente.id}
                      tamano={18}
                    />
                    {agente.nombre}
                  </span>
                )}
                <span className="tabular-nums">{canal.mensajesHoy} mensajes hoy</span>
                <InsigniaRiesgo riesgo={canal.riesgo} />
              </div>
            </article>
          )
        })}
      </div>

      <p className="text-[11px] text-[var(--tx-ink-muted)]">
        Regla de la casa: las campañas salen solo por la API oficial y con consentimiento previo.
        Por el número propio se atiende a quien escribe, nunca se sale a buscar.
      </p>
    </section>
  )
}

function InsigniaCanal({ estado }: { estado: EstadoCanal }) {
  if (estado === 'conectado') {
    return (
      <Badge variant="secondary" style={{ color: 'var(--tx-success)' }}>
        conectado
      </Badge>
    )
  }
  if (estado === 'bloqueado') return <Badge variant="destructive">bloqueado</Badge>
  if (estado === 'sin_latido') {
    return (
      <Badge variant="secondary" style={{ color: 'var(--tx-warning)' }}>
        sin latido
      </Badge>
    )
  }
  if (estado === 'esperando_qr') {
    return (
      <Badge variant="secondary" style={{ color: 'var(--tx-warning)' }}>
        sin vincular
      </Badge>
    )
  }
  return <Badge variant="outline">apagado</Badge>
}

function InsigniaRiesgo({ riesgo }: { riesgo: Canal['riesgo'] }) {
  if (riesgo === 'ninguno') return null

  return (
    <span
      className="rounded-md px-1.5 py-0.5 text-[10px]"
      style={{
        color: riesgo === 'alto' ? 'var(--tx-error)' : 'var(--tx-warning)',
        background:
          riesgo === 'alto'
            ? 'color-mix(in oklab, var(--tx-error) 14%, transparent)'
            : 'color-mix(in oklab, var(--tx-warning) 14%, transparent)',
      }}
    >
      {riesgo === 'alto' ? 'puede perderse el número' : 'con límites de Meta'}
    </span>
  )
}
