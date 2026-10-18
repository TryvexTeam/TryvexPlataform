'use client'

import { AlertTriangle, Check, Clock, FileText, Megaphone, Send, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CaraAgente } from './cara-agente'
import type { AgenteSala } from '@/lib/types/sala-agentes'

export type EstadoCampana =
  | 'borrador'
  | 'esperando_plantilla'
  | 'lista'
  | 'enviando'
  | 'enviada'
  | 'detenida'

export interface Campana {
  id: string
  nombre: string
  /** A quién le habla, en una frase. */
  publico: string
  estado: EstadoCampana
  /** Etiqueta del canal por donde sale. */
  canal: string
  /** true solo si ese canal es API oficial. Si es false, NO se puede enviar. */
  canalOficial: boolean
  /** Nombre de la plantilla de Meta, y si está aprobada. */
  plantilla: { nombre: string; aprobada: boolean }
  /** Tamaño de la lista y cuántos dieron consentimiento. */
  destinatarios: number
  conConsentimiento: number
  /** Qué agente atiende a los que respondan. */
  agenteId: string
  /** Resultado, cuando ya salió. */
  resultado?: { entregados: number; respondieron: number; reuniones: number }
  /** Cuándo sale o salió, ya formateado para mostrar. */
  cuando: string
}

interface PanelCampanasProps {
  campanas: Campana[]
  agentes: AgenteSala[]
}

const estadoTexto: Record<EstadoCampana, string> = {
  borrador: 'borrador',
  esperando_plantilla: 'esperando plantilla',
  lista: 'lista',
  enviando: 'enviando',
  enviada: 'enviada',
  detenida: 'detenida',
}

const estadoIcono: Record<EstadoCampana, typeof Clock> = {
  borrador: FileText,
  esperando_plantilla: Clock,
  lista: Check,
  enviando: Send,
  enviada: Check,
  detenida: AlertTriangle,
}

export function PanelCampanas({ campanas, agentes }: PanelCampanasProps) {
  const agentesPorId = new Map(agentes.map((agente) => [agente.id, agente]))

  return (
    <section aria-labelledby="titulo-campanas" className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <div className="mr-auto min-w-0">
          <h2 id="titulo-campanas" className="text-base font-semibold text-[var(--tx-ink-primary)]">
            Campañas
          </h2>
          <p className="mt-1 text-xs text-[var(--tx-ink-muted)]">
            Salir a buscar con permiso, por el canal correcto y una plantilla aprobada.
          </p>
        </div>
        <Megaphone size={18} className="text-[var(--tx-accent)]" aria-hidden="true" />
      </header>

      <div
        className="flex items-start gap-2.5 rounded-2xl p-3.5"
        style={{ border: '1px solid var(--tx-border)', background: 'var(--tx-surface-1)' }}
      >
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[var(--tx-warning)]" aria-hidden="true" />
        <p className="text-xs leading-relaxed text-[var(--tx-ink-secondary)]">
          Por el número propio se atiende a quien escribe. Salir a buscar es solo por la API oficial y con consentimiento previo.
        </p>
      </div>

      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))]">
        {campanas.map((campana) => {
          const agente = agentesPorId.get(campana.agenteId)
          const faltanConsentimientos = Math.max(0, campana.destinatarios - campana.conConsentimiento)
          const cobertura = campana.destinatarios > 0
            ? Math.min(100, Math.max(0, (campana.conConsentimiento / campana.destinatarios) * 100))
            : 0
          const frenos = [
            !campana.canalOficial && 'Sale por un número propio: enviar esto puede costar el número. Cambie el canal a la API oficial.',
            !campana.plantilla.aprobada && 'Meta todavía no aprueba la plantilla.',
            faltanConsentimientos > 0 && `${faltanConsentimientos} de ${campana.destinatarios} no dieron consentimiento; a esos no se les envía.`,
          ].filter((freno): freno is string => typeof freno === 'string')
          const puedeEnviar = frenos.length === 0 && campana.estado !== 'enviando'
          const IconoEstado = estadoIcono[campana.estado]

          return (
            <article
              key={campana.id}
              className="flex min-w-0 flex-col gap-2.5 rounded-2xl p-3.5"
              style={{ border: '1px solid var(--tx-border)', background: 'var(--tx-surface-1)' }}
            >
              <div className="flex min-w-0 items-start gap-2.5">
                <span
                  className="grid size-8 shrink-0 place-items-center rounded-xl"
                  style={{ background: 'var(--tx-surface-2)', border: '1px solid var(--tx-border)' }}
                >
                  <Megaphone size={15} className="text-[var(--tx-ink-secondary)]" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-[var(--tx-ink-primary)]">{campana.nombre}</h3>
                  <p className="mt-0.5 break-words text-xs text-[var(--tx-ink-muted)]">{campana.publico}</p>
                </div>
                <Badge variant={campana.estado === 'detenida' ? 'destructive' : 'secondary'} className="shrink-0 gap-1">
                  <IconoEstado size={12} aria-hidden="true" />
                  {estadoTexto[campana.estado]}
                </Badge>
              </div>

              <div className="grid gap-2 text-xs text-[var(--tx-ink-secondary)] sm:grid-cols-2">
                <p className="flex min-w-0 items-center gap-1.5">
                  <Send size={13} className="shrink-0 text-[var(--tx-ink-muted)]" aria-hidden="true" />
                  <span className="truncate">{campana.canal}</span>
                  {!campana.canalOficial && <span className="shrink-0 text-[var(--tx-warning)]">no oficial</span>}
                </p>
                <p className="flex min-w-0 items-center gap-1.5">
                  <FileText size={13} className="shrink-0 text-[var(--tx-ink-muted)]" aria-hidden="true" />
                  <span className="truncate">{campana.plantilla.nombre}</span>
                </p>
              </div>

              <div className="grid gap-1.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1.5 text-[var(--tx-ink-muted)]">
                    <Users size={13} aria-hidden="true" /> Consentimiento
                  </span>
                  <span className="tabular-nums text-[var(--tx-ink-secondary)]">
                    {campana.conConsentimiento} de {campana.destinatarios}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--tx-surface-2)' }}>
                  <div
                    className="motion-safe:[transition:width_320ms_ease] h-full rounded-full bg-[var(--tx-success)]"
                    style={{ width: `${cobertura}%` }}
                  />
                </div>
                <p className="text-[11px] text-[var(--tx-ink-muted)]">
                  Faltan <span className="tabular-nums">{faltanConsentimientos}</span> consentimientos
                </p>
              </div>

              {frenos.length > 0 && (
                <div className="flex flex-col gap-1.5" role="alert">
                  {frenos.map((freno) => (
                    <p key={freno} className="flex items-start gap-1.5 text-xs leading-relaxed text-[var(--tx-warning)]">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                      {freno}
                    </p>
                  ))}
                </div>
              )}

              {campana.estado === 'enviada' && campana.resultado ? (
                <div className="grid grid-cols-3 gap-2 rounded-xl p-2.5 text-center text-xs" style={{ background: 'var(--tx-surface-2)', border: '1px solid var(--tx-border)' }}>
                  <Resultado etiqueta="entregados" valor={campana.resultado.entregados} />
                  <Resultado etiqueta="respondieron" valor={campana.resultado.respondieron} />
                  <Resultado etiqueta="reuniones" valor={campana.resultado.reuniones} />
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-[var(--tx-ink-muted)]">{campana.cuando}</span>
                  <Button size="sm" disabled={!puedeEnviar} className="motion-safe:transition-transform">
                    <Send size={13} aria-hidden="true" />
                    Enviar
                  </Button>
                </div>
              )}

              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-t pt-2 text-[11px] text-[var(--tx-ink-muted)]" style={{ borderColor: 'var(--tx-border)' }}>
                {agente ? (
                  <span className="flex min-w-0 items-center gap-1.5">
                    <CaraAgente
                      nombre={agente.nombre}
                      color={agente.color}
                      estado={agente.estado}
                      agenteId={agente.id}
                      tamano={18}
                    />
                    <span className="truncate">{agente.nombre}</span>
                  </span>
                ) : (
                  <span>Agente no encontrado</span>
                )}
                <span className="ml-auto shrink-0">{campana.cuando}</span>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function Resultado({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <div>
      <p className="font-semibold tabular-nums text-[var(--tx-ink-primary)]">{valor}</p>
      <p className="text-[10px] text-[var(--tx-ink-muted)]">{etiqueta}</p>
    </div>
  )
}
