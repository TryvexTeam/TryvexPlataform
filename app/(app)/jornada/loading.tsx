import { CabeceraEsq, ListaEsq, TarjetasEsq } from '@/components/ui/esqueletos'

/** Esqueleto de Jornada: el reloj arriba y el historial debajo. */
export default function Loading() {
  return (
    <div className="flex h-full w-full flex-col gap-6 p-6" aria-busy="true" aria-label="Cargando la jornada">
      <CabeceraEsq />
      <TarjetasEsq n={1} alto={168} clases="grid-cols-1" />
      <ListaEsq filas={6} />
    </div>
  )
}
