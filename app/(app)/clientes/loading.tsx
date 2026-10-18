import { CabeceraEsq, ChipsEsq, ListaEsq } from '@/components/ui/esqueletos'

/** Esqueleto de Clientes: la lista con avatar, nombre y estado. */
export default function Loading() {
  return (
    <div className="flex h-full w-full flex-col gap-5 p-4 md:p-6" aria-busy="true" aria-label="Cargando los clientes">
      <CabeceraEsq conAcciones />
      <ChipsEsq n={3} />
      <ListaEsq filas={8} />
    </div>
  )
}
