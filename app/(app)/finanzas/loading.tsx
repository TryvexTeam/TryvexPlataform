import { CabeceraEsq, ChipsEsq, ListaEsq, TarjetasEsq } from '@/components/ui/esqueletos'

/** Esqueleto de Finanzas: fila de KPIs sobre la tabla de movimientos. */
export default function Loading() {
  return (
    <div className="flex h-full w-full flex-col gap-6 p-6" aria-busy="true" aria-label="Cargando las finanzas">
      <CabeceraEsq />
      <TarjetasEsq n={4} alto={116} />
      <ChipsEsq n={3} />
      <ListaEsq filas={7} />
    </div>
  )
}
