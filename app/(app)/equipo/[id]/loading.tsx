import { CabeceraEsq, ListaEsq, TarjetasEsq } from '@/components/ui/esqueletos'

/** Esqueleto del perfil: cabecera, los cinco números, el calendario y la actividad. */
export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6" aria-busy="true" aria-label="Cargando el perfil">
      <CabeceraEsq />
      <TarjetasEsq n={5} alto={84} clases="grid-cols-2 md:grid-cols-5" />
      <TarjetasEsq n={1} alto={160} clases="grid-cols-1" />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <ListaEsq filas={6} />
        <TarjetasEsq n={1} alto={220} clases="grid-cols-1" />
      </div>
    </div>
  )
}
