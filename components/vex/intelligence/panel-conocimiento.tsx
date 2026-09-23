'use client'

import { AlertTriangle, FileText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { CaraAgente } from './cara-agente'
import type { AgenteSala } from '@/lib/types/sala-agentes'

export interface DocumentoConocimiento {
  id: string
  titulo: string
  /** De dónde salió: 'manual' | 'web' | 'reunion' | 'conversacion' */
  origen: 'manual' | 'web' | 'reunion' | 'conversacion'
  /** Un resumen de una línea de lo que contiene. */
  resumen: string
  /**
   * Cuántas secciones tiene (encabezados del markdown). No son fragmentos
   * vectorizados: `cerebro_docs` no se vectoriza, y llamarlos así prometería
   * una búsqueda semántica que no existe.
   */
  fragmentos: number
  /** Ids de los agentes que lo tienen a mano. */
  agentes: string[]
  /** Cuántas veces se citó en los últimos 30 días. */
  citasMes: number
  ultimaCita: string | null
  actualizado: string
}

interface PanelConocimientoProps {
  documentos: DocumentoConocimiento[]
  agentes: AgenteSala[]
}

const enteros = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 })
const fechas = new Intl.DateTimeFormat('es-CL', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const etiquetaOrigen: Record<DocumentoConocimiento['origen'], string> = {
  manual: 'manual',
  web: 'web',
  reunion: 'reunión',
  conversacion: 'conversación',
}

export function PanelConocimiento({ documentos, agentes }: PanelConocimientoProps) {
  const agentesPorId = new Map(agentes.map((agente) => [agente.id, agente]))
  const fragmentosTotales = documentos.reduce((total, documento) => total + documento.fragmentos, 0)
  const documentosSinCitaReciente = documentos.filter((documento) => documento.citasMes === 0).length

  return (
    <section aria-labelledby="titulo-conocimiento" className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="titulo-conocimiento" className="text-base font-semibold text-[var(--tx-ink-primary)]">
            Lo que saben los agentes
          </h2>
          <p className="mt-1 text-xs text-[var(--tx-ink-muted)]">
            Documentos que usan para responder y señales de si realmente los encuentran.
          </p>
        </div>

        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-[var(--tx-ink-primary)] outline-none hover:bg-[var(--tx-surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--tx-accent)]"
          style={{ border: '1px solid var(--tx-border)', background: 'var(--tx-surface-1)' }}
        >
          <FileText size={14} aria-hidden="true" />
          Agregar documento
        </button>
      </header>

      <dl className="grid gap-3 sm:grid-cols-3">
        <Cifra etiqueta="Documentos" valor={documentos.length} />
        <Cifra etiqueta="Secciones" valor={fragmentosTotales} />
        <Cifra
          etiqueta="Sin cita hace más de 30 días"
          valor={documentosSinCitaReciente}
          advertencia={documentosSinCitaReciente > 0}
        />
      </dl>

      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
        {documentos.map((documento) => {
          const agentesDelDocumento = documento.agentes
            .map((agenteId) => agentesPorId.get(agenteId))
            .filter((agente): agente is AgenteSala => agente !== undefined)

          return (
            <article
              key={documento.id}
              className="flex min-w-0 flex-col gap-3 rounded-2xl p-4"
              style={{ background: 'var(--tx-surface-1)', border: '1px solid var(--tx-border)' }}
            >
              <header className="flex items-start justify-between gap-3">
                <h3 className="min-w-0 text-sm font-semibold text-[var(--tx-ink-primary)]">
                  {documento.titulo}
                </h3>
                <Badge variant="outline">{etiquetaOrigen[documento.origen]}</Badge>
              </header>

              <p className="text-xs leading-relaxed text-[var(--tx-ink-secondary)]">
                {documento.resumen}
              </p>

              <div
                className="flex min-h-5 flex-wrap items-center gap-1"
                aria-label="Agentes que usan este documento"
              >
                {agentesDelDocumento.map((agente) => (
                  <CaraAgente
                    key={agente.id}
                    nombre={agente.nombre}
                    color={agente.color}
                    estado={agente.estado}
                    agenteId={agente.id}
                    tamano={20}
                  />
                ))}
              </div>

              <dl className="grid grid-cols-2 gap-2 text-xs tabular-nums">
                <Dato etiqueta="secciones" valor={documento.fragmentos} />
                <Dato etiqueta="citas en 30 días" valor={documento.citasMes} />
              </dl>

              <div className="mt-auto flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--tx-ink-muted)]">
                <span>
                  Última cita:{' '}
                  {documento.ultimaCita ? (
                    <time dateTime={documento.ultimaCita}>{formatearFecha(documento.ultimaCita)}</time>
                  ) : (
                    'nunca'
                  )}
                </span>
                <span>
                  Actualizado: <time dateTime={documento.actualizado}>{formatearFecha(documento.actualizado)}</time>
                </span>
              </div>

              {documento.citasMes === 0 && (
                <p
                  className="flex items-start gap-1.5 text-xs leading-relaxed"
                  style={{ color: 'var(--tx-warning)' }}
                >
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                  Nadie lo cita hace más de un mes. O sobra, o el agente no lo encuentra.
                </p>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}

function Cifra({
  etiqueta,
  valor,
  advertencia = false,
}: {
  etiqueta: string
  valor: number
  advertencia?: boolean
}) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: 'var(--tx-surface-1)', border: '1px solid var(--tx-border)' }}
    >
      <dt className="text-xs text-[var(--tx-ink-muted)]">{etiqueta}</dt>
      <dd
        className="mt-1 text-2xl font-semibold tabular-nums"
        style={{ color: advertencia ? 'var(--tx-warning)' : 'var(--tx-ink-primary)' }}
      >
        {enteros.format(valor)}
      </dd>
    </div>
  )
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <div>
      <dt className="font-semibold text-[var(--tx-ink-primary)]">{enteros.format(valor)}</dt>
      <dd className="text-[var(--tx-ink-muted)]">{etiqueta}</dd>
    </div>
  )
}

function formatearFecha(fecha: string): string {
  const instante = new Date(fecha)
  return Number.isNaN(instante.getTime()) ? fecha : fechas.format(instante)
}
