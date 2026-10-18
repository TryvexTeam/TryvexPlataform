import { CabeceraEsq, CalendarioEsq, ChipsEsq } from '@/components/ui/esqueletos'

/**
 * Esqueleto de Equipo.
 *
 * La rejilla semanal con bloques a distinta hora: alinearlos todos delataría
 * el esqueleto, porque una semana real nunca se ve así.
 */
export default function Loading() {
  return (
    <div
      className="mx-auto flex max-w-[1100px] flex-col gap-5 px-5 py-8"
      aria-busy="true"
      aria-label="Cargando el calendario"
    >
      <CabeceraEsq conAcciones />
      <ChipsEsq n={3} />
      <CalendarioEsq />
    </div>
  )
}
