import Link from 'next/link'
import { EstadoVacio } from '@/components/dashboard/estado-vacio'
import { ESTADOS_LEAD, type Interaccion } from '@/lib/types/lead'
import type { FilaAccionHoy } from '@/lib/types/dashboard'

interface TablaAccionProps {
  /** Filas ya consultadas por `LeadsRepository.listarRequiereAccionHoy`. */
  filas: FilaAccionHoy[]
}

const FECHA_CORTA = new Intl.DateTimeFormat('es-CL', {
  day: '2-digit',
  month: 'short',
  timeZone: 'America/Santiago',
})

/** Etiqueta del tipo de interacción, igual que las opciones de lead-task-panel. */
const TIPO_LABEL: Record<Interaccion['tipo'], string> = {
  whatsapp: 'WhatsApp',
  llamada: 'Llamada',
  instagram: 'Instagram',
  meet: 'Meet',
  email: 'Email',
  nota: 'Nota',
}

function iniciales(nombre: string): string {
  return nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

function colorDias(dias: number | null): string {
  if (dias === null) return 'var(--tx-error)'
  if (dias >= 8) return 'var(--tx-error)'
  if (dias >= 5) return 'var(--tx-warning)'
  return 'var(--tx-ink-secondary)'
}

/**
 * "Requiere acción hoy" (T-012 §3): tabla de los leads del integrante que
 * más hace que nadie les escribe. Server Component — los datos llegan por
 * props desde `page.tsx`, que los consulta vía `lib/repos/` (regla: Supabase
 * nunca fuera de ahí).
 *
 * Tabla y badge replican los patrones de `finanzas-workspace` con sus valores
 * exactos; la celda accionable es un `<Link>` real al lead, con área táctil
 * de 44px. Sin `overflow-hidden`: si algo no cabe, scrollea el contenedor.
 */
export function TablaAccion({ filas }: TablaAccionProps) {
  if (filas.length === 0) {
    return (
      <EstadoVacio
        titulo="Nada requiere acción"
        descripcion="Tus leads están al día: nadie espera respuesta hace más de un día."
        ctaLabel="Ir a leads"
        ctaHref="/leads"
      />
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--tx-border)]">
      <table className="w-full text-sm">
        <thead className="text-[var(--tx-ink-muted)]">
          <tr>
            <th className="text-left font-medium px-3 py-2">Lead</th>
            <th className="text-left font-medium px-3 py-2">Estado</th>
            <th className="text-left font-medium px-3 py-2">Sin contacto</th>
            <th className="text-left font-medium px-3 py-2">Última acción</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => {
            const estadoConf = ESTADOS_LEAD.find((e) => e.id === fila.estado)
            const colorEstado = estadoConf?.color ?? '#94a3b8'
            return (
              <tr key={fila.lead_id} className="border-t border-[var(--tx-border)]">
                <td className="px-3 py-2">
                  {/* El recorrido natural (clic en la fila → ficha del lead)
                      vive aquí: celda con avatar de iniciales + nombre +
                      empresa (localidad), tal como la pide la spec. */}
                  <Link
                    href={`/leads/${fila.lead_id}`}
                    className="flex min-h-[44px] items-center gap-2.5 rounded-lg py-1 pr-2 -ml-1 pl-1"
                  >
                    <span
                      aria-hidden
                      className="grid size-7 shrink-0 place-items-center rounded-lg text-[11px] font-semibold text-white"
                      style={{ background: colorEstado }}
                    >
                      {iniciales(fila.nombre_negocio)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-[var(--tx-ink-primary)]">
                        {fila.nombre_negocio}
                      </span>
                      <span className="block truncate text-[12px] text-[var(--tx-ink-muted)]">
                        {fila.localidad ?? 'Sin localidad'}
                      </span>
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{
                      background: `${colorEstado}26`,
                      color: colorEstado,
                      border: `1px solid ${colorEstado}4D`,
                    }}
                  >
                    {estadoConf?.label ?? fila.estado}
                  </span>
                </td>
                <td
                  className="px-3 py-2 tabular-nums whitespace-nowrap"
                  style={{ color: colorDias(fila.dias_sin_contacto) }}
                >
                  {fila.dias_sin_contacto === null
                    ? 'Nunca'
                    : `${fila.dias_sin_contacto} ${fila.dias_sin_contacto === 1 ? 'día' : 'días'}`}
                </td>
                <td className="px-3 py-2 text-[var(--tx-ink-muted)] whitespace-nowrap">
                  {fila.ultimo_dia && fila.ultimo_tipo
                    ? `${TIPO_LABEL[fila.ultimo_tipo]} · ${FECHA_CORTA.format(
                        new Date(`${fila.ultimo_dia}T12:00:00Z`),
                      )}`
                    : 'Sin registro'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
