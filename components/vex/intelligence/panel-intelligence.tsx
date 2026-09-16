'use client'

import { useState } from 'react'
import { Brain } from 'lucide-react'
import { SalaAgentes } from './sala-agentes'
import { EspacioAgente } from './espacio-agente'
import type { AgenteSala, Encargo, EntradaHilo, Herramienta, Rutina } from '@/lib/types/sala-agentes'

/**
 * El marco de Tryvex Intelligence.
 *
 * Tres vistas, y el orden importa: primero la SALA (qué está pasando con todos),
 * después el ESPACIO de un agente (su hilo, sus rutinas, sus llaves) y al final
 * el AGENTE DE WHATSAPP, que es el panel que ya existía y sigue vivo.
 *
 * Ese último se recibe como `children` en vez de reimplementarse: lo arma la
 * página en el servidor porque necesita el token del agente, que no puede
 * llegar al navegador.
 */

interface PanelIntelligenceProps {
  agentes: AgenteSala[]
  encargos: Encargo[]
  hilo: EntradaHilo[]
  rutinas: Rutina[]
  herramientas: Herramienta[]
  /** El panel de WhatsApp que ya existía (estado, conversaciones y ajustes). */
  panelWhatsapp: React.ReactNode
}

type Vista = 'sala' | 'espacio' | 'whatsapp'

export function PanelIntelligence({
  agentes,
  encargos,
  hilo,
  rutinas,
  herramientas,
  panelWhatsapp,
}: PanelIntelligenceProps) {
  const [vista, setVista] = useState<Vista>('sala')
  const esperandoFirma = encargos.filter((e) => e.requiereFirma && e.estado === 'bloqueada').length

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-3 sm:p-5">
      <header className="flex flex-wrap items-center gap-3">
        <Brain size={20} style={{ color: 'var(--tx-accent)' }} />
        <div className="mr-auto">
          <h1 className="text-lg font-semibold text-[var(--tx-ink-primary)]">Tryvex Intelligence</h1>
          <p className="text-xs text-[var(--tx-ink-muted)]">
            Dónde el equipo reparte trabajo a los agentes, firma lo irreversible y revisa lo entregado.
          </p>
        </div>

        <div
          className="flex gap-0.5 rounded-xl p-1"
          style={{ border: '1px solid var(--tx-border)', background: 'var(--tx-surface-2)' }}
          role="group"
          aria-label="Vista"
        >
          <Opcion activa={vista === 'sala'} onClick={() => setVista('sala')}>
            Sala
            {esperandoFirma > 0 && (
              <span
                className="ml-1.5 rounded-full px-1.5 text-[10px] tabular-nums"
                style={{ background: 'var(--tx-accent)', color: 'var(--tx-accent-fg)' }}
              >
                {esperandoFirma}
              </span>
            )}
          </Opcion>
          <Opcion activa={vista === 'espacio'} onClick={() => setVista('espacio')}>
            Espacio del agente
          </Opcion>
          <Opcion activa={vista === 'whatsapp'} onClick={() => setVista('whatsapp')}>
            Agente de WhatsApp
          </Opcion>
        </div>
      </header>

      {/*
        Aviso honesto mientras la sala sea maqueta: quien la vea tiene que saber
        que esos números no son de su cartera. Se borra el día que se conecte a
        `agentes`, `tareas` y `tarea_evidencias`.
      */}
      {vista !== 'whatsapp' && (
        <p
          className="rounded-r-xl py-2 pl-3 pr-3 text-xs text-[var(--tx-ink-secondary)]"
          style={{
            borderLeft: '3px solid var(--tx-warning)',
            background: 'var(--tx-surface-1)',
          }}
        >
          <b className="text-[var(--tx-ink-primary)]">Vista de diseño.</b> Los agentes son los reales
          del equipo, pero los encargos, tiempos y evidencias son de ejemplo: todavía no está
          conectada a la base.
        </p>
      )}

      {vista === 'sala' && <SalaAgentes agentes={agentes} encargos={encargos} />}
      {vista === 'espacio' && (
        <EspacioAgente
          agentes={agentes}
          hilo={hilo}
          rutinas={rutinas}
          herramientas={herramientas}
        />
      )}
      {vista === 'whatsapp' && <div className="mx-auto w-full max-w-3xl">{panelWhatsapp}</div>}
    </div>
  )
}

function Opcion({
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
      onClick={onClick}
      aria-pressed={activa}
      className="rounded-lg px-3 py-1.5 text-xs transition-colors"
      style={{
        background: activa ? 'var(--tx-surface-0)' : 'transparent',
        color: activa ? 'var(--tx-ink-primary)' : 'var(--tx-ink-muted)',
        fontWeight: activa ? 600 : 400,
      }}
    >
      {children}
    </button>
  )
}
