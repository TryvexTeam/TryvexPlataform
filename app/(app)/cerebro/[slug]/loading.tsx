import { CabeceraEsq, LineaEsq } from '@/components/ui/esqueletos'

/** Esqueleto de una nota del cerebro: una columna de texto. */
export default function Loading() {
  return (
    <div
      className="mx-auto flex w-full max-w-[760px] flex-col gap-6 p-6"
      aria-busy="true"
      aria-label="Cargando la nota"
    >
      <CabeceraEsq />
      <div className="flex flex-col gap-3">
        {[96, 88, 92, 64, 90, 78, 86, 54].map((ancho, i) => (
          <LineaEsq key={i} w={`${ancho}%`} h={13} />
        ))}
      </div>
    </div>
  )
}
