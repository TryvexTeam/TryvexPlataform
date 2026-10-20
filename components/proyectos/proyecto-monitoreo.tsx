'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert } from 'lucide-react'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { decimal, redondearTexto } from '@/lib/monitoreo/decimal'
import { actualizarMonitoreo } from '@/app/(app)/proyectos/[id]/acciones-monitoreo'
import { ETIQUETA_ALERTA, type EstadoSello, type SaasAlerta, type VistaMonitoreo } from '@/lib/types/monitoreo'
import { cn } from '@/lib/utils'

interface ProyectoMonitoreoProps {
  proyectoId: string
  vista: VistaMonitoreo | null
  error: string | null
  puedeActualizar: boolean
}

/** "1234567.5" → "1.234.567,50" sin pasar por number (no pierde precisión). */
function monto(texto: string, decimales = 2): string {
  const [entero, fraccion] = redondearTexto(decimal(texto), decimales).split('.')
  const conMiles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return fraccion ? `${conMiles},${fraccion}` : conMiles
}

function mesLegible(mes: string): string {
  return format(new Date(`${mes}-01T12:00:00Z`), 'MMM yyyy', { locale: es })
}

function fechaHora(iso: string): string {
  return format(new Date(iso), "d MMM yyyy, HH:mm", { locale: es })
}

const SELLO: Record<EstadoSello, { texto: string; clase: string; icono: typeof CheckCircle2 | null }> = {
  intacto: { texto: 'Sin cambios', clase: 'text-green-400', icono: CheckCircle2 },
  cambiado: { texto: 'Cambió', clase: 'text-amber-400', icono: AlertTriangle },
  abierto: { texto: 'Mes en curso', clase: 'text-[var(--tx-ink-muted)]', icono: null },
}

function detalleAlerta(a: SaasAlerta): string {
  const d = a.detalle
  const partes = [d.organizacion, d.mes, d.moneda].filter((x): x is string => typeof x === 'string')
  if (a.tipo === 'REVENUE_DECREASED') partes.push(`${String(d.antes)} → ${String(d.ahora)}`)
  if (a.tipo === 'ANNULMENTS_SPIKE') partes.push(`anulado ${String(d.anulado)} de ${String(d.registrado)}`)
  if (a.tipo === 'SCHEMA_BEHIND') partes.push(`reporta ${String(d.reportado ?? 'nada')}, se espera ${String(d.esperado)}`)
  return partes.join(' · ')
}

export function ProyectoMonitoreo({ proyectoId, vista, error, puedeActualizar }: ProyectoMonitoreoProps) {
  const router = useRouter()
  const [pendiente, startTransition] = useTransition()

  function actualizar() {
    startTransition(async () => {
      const r = await actualizarMonitoreo(proyectoId)
      if (r.ok) toast.success(r.mensaje)
      else toast.error(r.error)
      router.refresh()
    })
  }

  return (
    <section aria-labelledby="monitoreo-titulo" className="mt-2">
      <Separator className="mb-6" />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity size={18} aria-hidden className="text-[var(--tx-ink-secondary)]" />
          <h2 id="monitoreo-titulo" className="text-[19px] font-medium tracking-[-0.02em] text-[var(--tx-ink-primary)]">
            Monitoreo
          </h2>
          {vista && (
            <span className="inline-flex h-[26px] items-center rounded-full border border-white/[0.10] px-2.5 text-[11.5px] font-medium text-[var(--tx-ink-secondary)]">
              Comisión Tryvex {vista.saas.porcentaje_tryvex}%
            </span>
          )}
          {vista && (
            <span className="text-xs text-[var(--tx-ink-muted)]">
              Clave <code className="font-mono">{vista.saas.clave}</code>
            </span>
          )}
        </div>
        {vista && puedeActualizar && (
          <Button variant="outline" size="sm" onClick={actualizar} disabled={pendiente || !vista.saas.activo} aria-busy={pendiente}>
            <RefreshCw size={13} aria-hidden className={cn('mr-1.5', pendiente && 'animate-spin motion-reduce:animate-none')} />
            {pendiente ? 'Actualizando…' : 'Actualizar ahora'}
          </Button>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
          No se pudo cargar el monitoreo: {error}
        </p>
      )}

      {vista && (
        <>
          <dl className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-white/5 p-3">
              <dt className="mb-1 text-xs text-[var(--tx-ink-muted)]">Último intento</dt>
              <dd className="text-sm font-semibold text-[var(--tx-ink-primary)]">
                {vista.ultimoPull ? (
                  <>
                    {fechaHora(vista.ultimoPull.tomado_en)}{' '}
                    <span className={vista.ultimoPull.http_status === 200 && !vista.ultimoPull.error ? 'text-green-400' : 'text-red-400'}>
                      ({vista.ultimoPull.error ?? `HTTP ${vista.ultimoPull.http_status}`})
                    </span>
                  </>
                ) : 'Todavía no se consulta'}
              </dd>
            </div>
            <div className="rounded-lg bg-white/5 p-3">
              <dt className="mb-1 text-xs text-[var(--tx-ink-muted)]">Último dato válido</dt>
              <dd className="text-sm font-semibold text-[var(--tx-ink-primary)]">
                {vista.ultimoOk ? fechaHora(vista.ultimoOk.tomado_en) : '—'}
              </dd>
            </div>
            <div className="rounded-lg bg-white/5 p-3">
              <dt className="mb-1 text-xs text-[var(--tx-ink-muted)]">Versión desplegada</dt>
              <dd className="truncate text-sm font-semibold text-[var(--tx-ink-primary)]" title={vista.ultimoOk?.schema_version ?? undefined}>
                {vista.ultimoOk?.version ?? '—'}
              </dd>
            </div>
          </dl>

          {vista.alertas.length > 0 && (
            <div role="region" aria-label="Alertas abiertas" className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-amber-400">
                <ShieldAlert size={14} aria-hidden /> {vista.alertas.length} alerta{vista.alertas.length === 1 ? '' : 's'} abierta{vista.alertas.length === 1 ? '' : 's'}
              </p>
              <ul className="space-y-1.5">
                {vista.alertas.map((a) => (
                  <li key={a.id} className="text-sm text-[var(--tx-ink-secondary)]">
                    <span className="font-medium text-[var(--tx-ink-primary)]">{ETIQUETA_ALERTA[a.tipo]}</span>
                    {detalleAlerta(a) && <span> — {detalleAlerta(a)}</span>}
                    <span className="text-xs text-[var(--tx-ink-muted)]"> · {fechaHora(a.creada_en)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {vista.filas.length === 0 ? (
            <p className="text-sm text-[var(--tx-ink-muted)]">Sin datos de cobros todavía.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-white/[0.08]">
              <table className="w-full min-w-[640px] text-sm">
                <caption className="sr-only">
                  Cobros por mes de registro y moneda, comisión de Tryvex al {vista.saas.porcentaje_tryvex}% y estado del sello de cada mes
                </caption>
                <thead className="bg-white/5 text-xs text-[var(--tx-ink-muted)]">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left font-medium">Mes de registro</th>
                    <th scope="col" className="px-3 py-2 text-left font-medium">Moneda</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Registrado</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Anulado</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Comisión</th>
                    <th scope="col" className="px-3 py-2 text-left font-medium">Sello</th>
                  </tr>
                </thead>
                <tbody>
                  {vista.filas.map((f) => {
                    const sello = SELLO[f.sello]
                    const Icono = sello.icono
                    return (
                      <tr key={`${f.mes}-${f.moneda}`} className="border-t border-white/[0.06]">
                        <th scope="row" className="px-3 py-2 text-left font-medium capitalize text-[var(--tx-ink-primary)]">{mesLegible(f.mes)}</th>
                        <td className="px-3 py-2 text-[var(--tx-ink-secondary)]">{f.moneda}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-[var(--tx-ink-primary)]">
                          {monto(f.registrado)} <span className="text-xs text-[var(--tx-ink-muted)]">({f.pagos})</span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-[var(--tx-ink-secondary)]">
                          {monto(f.anulado)} <span className="text-xs text-[var(--tx-ink-muted)]">({f.anulaciones})</span>
                        </td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums text-[var(--tx-ink-primary)]" title={`Exacto: ${f.comision}`}>
                          {monto(f.comision)}
                        </td>
                        <td className={cn('px-3 py-2', sello.clase)}>
                          <span className="inline-flex items-center gap-1">
                            {Icono && <Icono size={13} aria-hidden />}
                            {sello.texto}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  )
}
