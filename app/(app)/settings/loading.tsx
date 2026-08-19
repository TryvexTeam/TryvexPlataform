import { CabeceraEsq, TarjetasEsq } from '@/components/ui/esqueletos'

/** Esqueleto de Configuración: la rejilla de dos columnas de tarjetas. */
export default function Loading() {
  return (
    <div className="flex h-full w-full flex-col gap-6 p-6" aria-busy="true" aria-label="Cargando la configuración">
      <CabeceraEsq />
      <TarjetasEsq n={4} alto={210} clases="grid-cols-1 lg:grid-cols-2" />
    </div>
  )
}
