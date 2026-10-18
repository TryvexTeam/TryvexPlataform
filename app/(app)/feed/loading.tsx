import { CabeceraEsq, TarjetasEsq } from '@/components/ui/esqueletos'

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-4 md:p-6" aria-busy="true" aria-label="Cargando el feed">
      <CabeceraEsq />
      <TarjetasEsq n={1} alto={120} clases="grid-cols-1" />
      <TarjetasEsq n={3} alto={220} clases="grid-cols-1" />
    </div>
  )
}
