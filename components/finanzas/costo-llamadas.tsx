import { PhoneIcon } from 'lucide-react'

export interface ConsumoLlamadas {
  llamadas: number
  segundos_totales: number
  segundos_relay: number
  sin_medir: number
  gb_estimados: number
}

/** Lo que Cloudflare regala por mes antes de cobrar. */
const CUOTA_GB = 1000

interface CostoLlamadasProps {
  consumo: ConsumoLlamadas | null
}

/**
 * Lo que cuestan las llamadas de la app. Spoiler: nada, y esta tarjeta está para
 * demostrarlo en vez de pedir que se confíe.
 *
 * El audio y el video van navegador a navegador, así que la mayor parte del
 * tiempo no tocan ningún servidor y no hay nada que facturar. Lo único que
 * consume es el relay TURN, que entra cuando dos personas no logran conectarse
 * directo. Eso sale de los 1.000 GB gratis al mes de Cloudflare.
 *
 * Está en Finanzas y no dentro de la llamada porque la pregunta que responde no
 * es "cómo va esta llamada", es "esto nos está costando algo".
 */
export function CostoLlamadas({ consumo }: CostoLlamadasProps) {
  const horas = (consumo?.segundos_totales ?? 0) / 3600
  const horasRelay = (consumo?.segundos_relay ?? 0) / 3600
  const gb = consumo?.gb_estimados ?? 0
  const porcentaje = Math.min(100, (gb / CUOTA_GB) * 100)

  return (
    <section
      className="rounded-xl p-4"
      style={{ background: 'var(--tx-surface-1)', border: '1px solid var(--tx-border)' }}
      aria-labelledby="costo-llamadas"
    >
      <div className="flex items-center gap-2 mb-3">
        <PhoneIcon className="size-4 text-[var(--tx-ink-muted)]" />
        <h2 id="costo-llamadas" className="text-[15px] font-semibold text-[var(--tx-ink-primary)]">
          Llamadas del equipo
        </h2>
        <span
          className="ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{ background: 'oklch(62% 0.17 150 / 18%)', color: 'oklch(75% 0.16 150)' }}
        >
          $0
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <Dato valor={consumo?.llamadas ?? 0} etiqueta="llamadas" />
        <Dato valor={horas.toFixed(1)} etiqueta="horas habladas" />
        <Dato valor={horasRelay.toFixed(1)} etiqueta="por relay" />
      </div>

      {/* La barra mide solo lo que consume: las horas directas no aparecen porque
          no gastan nada. Que la barra esté casi vacía es el punto. */}
      <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'oklch(100% 0 0 / 8%)' }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.max(porcentaje, gb > 0 ? 1 : 0)}%`,
            background: porcentaje > 80 ? 'oklch(70% 0.18 40)' : 'var(--tx-accent)',
          }}
        />
      </div>

      <p className="mt-2 text-[12px] text-[var(--tx-ink-muted)]">
        {gb < 0.01 ? 'Menos de 0,01' : gb.toFixed(2)} GB de {CUOTA_GB} GB gratis al mes
        {porcentaje >= 1 && ` · ${porcentaje.toFixed(0)}%`}
      </p>

      <p className="mt-3 text-[12px] leading-relaxed text-[var(--tx-ink-muted)]">
        El audio y el video van directo entre navegadores: no pasan por ningún servidor y
        no cuestan nada, hablen lo que hablen. Solo consume el reenvío que se usa cuando
        dos personas no logran conectarse directo.
      </p>

      {/* Decir cuántas no se midieron, en vez de repartirlas al azar entre
          "directa" y "relay". Un número inventado acá haría que el consumo
          pareciera menor o mayor de lo que es, y nadie se enteraría. */}
      {(consumo?.sin_medir ?? 0) > 0 && (
        <p className="mt-2 text-[11px] text-[var(--tx-ink-muted)]">
          {consumo!.sin_medir} {consumo!.sin_medir === 1 ? 'participación' : 'participaciones'} sin
          medir (se cerró el navegador antes de reportar). No se cuentan en la estimación.
        </p>
      )}

      <p className="mt-2 text-[11px] text-[var(--tx-ink-muted)]">
        Es una estimación calculada acá, no una factura. El número exacto está en el panel
        de Cloudflare.
      </p>
    </section>
  )
}

function Dato({ valor, etiqueta }: { valor: string | number; etiqueta: string }) {
  return (
    <div>
      <p className="text-[20px] font-semibold tabular-nums text-[var(--tx-ink-primary)]">{valor}</p>
      <p className="text-[11px] text-[var(--tx-ink-muted)]">{etiqueta}</p>
    </div>
  )
}
