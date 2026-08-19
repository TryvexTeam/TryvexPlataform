import { CabeceraEsq, ListaEsq, TarjetasEsq } from '@/components/ui/esqueletos'

/**
 * Esqueleto de la ficha de tarea.
 *
 * Dos columnas en escritorio: los datos a la izquierda y la actividad a la
 * derecha, que es como se arma la ficha real.
 */
export default function Loading() {
  return (
    <div className="flex h-full w-full flex-col gap-6 p-4 md:p-6" aria-busy="true" aria-label="Cargando la ficha">
      <CabeceraEsq conAcciones />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-5">
          <TarjetasEsq n={1} alto={188} clases="grid-cols-1" />
          <ListaEsq filas={5} />
        </div>
        <TarjetasEsq n={1} alto={320} clases="grid-cols-1" />
      </div>
    </div>
  )
}
