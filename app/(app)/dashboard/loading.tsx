import { CabeceraEsq, CifrasEsq, ChipsEsq, TarjetasEsq } from '@/components/ui/esqueletos'

/**
 * Esqueleto del Panel de Mando.
 *
 * Reproduce el orden real de la página —saludo, cifras sueltas, selector de
 * vista, tarjetas de lead y de tarea— para que al llegar los datos nada salte
 * de sitio.
 */
export default function Loading() {
  return (
    <div className="h-full w-full p-4 md:p-8" aria-busy="true" aria-label="Cargando el panel">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-12 md:gap-14">
        <div className="flex flex-col gap-8">
          <CabeceraEsq conAcciones />
          <CifrasEsq n={3} />
          <ChipsEsq n={2} />
        </div>

        <div className="flex flex-col gap-5">
          <LineaTitulo />
          <TarjetasEsq n={4} alto={232} />
        </div>

        <div className="flex flex-col gap-5">
          <LineaTitulo />
          <TarjetasEsq n={3} alto={196} clases="grid-cols-2 lg:grid-cols-3" />
        </div>
      </div>
    </div>
  )
}

/** Título de sección: mismo peso visual que el h2 real. */
function LineaTitulo() {
  return <div aria-hidden="true" className="h-6 w-52 animate-pulse rounded-lg bg-white/[0.055]" />
}
