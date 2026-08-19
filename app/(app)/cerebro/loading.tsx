import { CabeceraEsq, ChipsEsq, TarjetasEsq } from '@/components/ui/esqueletos'

/** Esqueleto del Cerebro: la rejilla de notas. */
export default function Loading() {
  return (
    <div className="flex h-full w-full flex-col gap-5 p-6" aria-busy="true" aria-label="Cargando el cerebro">
      <CabeceraEsq conAcciones />
      <ChipsEsq n={4} />
      <TarjetasEsq n={6} alto={164} clases="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" />
    </div>
  )
}
