import { CabeceraEsq, TarjetasEsq } from '@/components/ui/esqueletos'

export default function Loading() {
  return (
    <div className="flex w-full flex-col gap-4 p-4 md:p-6" aria-busy="true" aria-label="Cargando el mapa">
      <CabeceraEsq />
      <TarjetasEsq n={1} alto={480} clases="grid-cols-1" />
    </div>
  )
}
