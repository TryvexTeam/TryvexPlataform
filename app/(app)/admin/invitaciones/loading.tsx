import { CabeceraEsq, ListaEsq } from '@/components/ui/esqueletos'

/** Esqueleto de administración: cabecera y la tabla de personas. */
export default function Loading() {
  return (
    <div className="flex h-full w-full flex-col gap-5 p-6" aria-busy="true" aria-label="Cargando">
      <CabeceraEsq conAcciones />
      <ListaEsq filas={6} />
    </div>
  )
}
