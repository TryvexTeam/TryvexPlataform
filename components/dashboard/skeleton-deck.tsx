import { Skeleton } from '@/components/ui/skeleton'

/**
 * Esqueleto del Panel de Mando.
 *
 * Reproduce la forma real de la página —cabecera, cifras, dos filas de
 * tarjetas— para que al llegar los datos nada salte de sitio. Sin muescas: la
 * muesca promete un destino, y mientras carga todavía no hay ninguno.
 */
export function SkeletonDeck() {
  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-10" aria-hidden>
      <div className="flex flex-col gap-8">
        <Skeleton className="h-14 w-72 rounded-2xl" />
        <div className="flex gap-11">
          <Skeleton className="h-16 w-24 rounded-2xl" />
          <Skeleton className="h-16 w-24 rounded-2xl" />
          <Skeleton className="h-16 w-24 rounded-2xl" />
        </div>
        <Skeleton className="h-12 w-48 rounded-full" />
      </div>

      <div className="flex flex-col gap-5">
        <Skeleton className="h-7 w-56 rounded-lg" />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-[232px] w-full rounded-[28px]" />
          <Skeleton className="h-[232px] w-full rounded-[28px]" />
          <Skeleton className="h-[232px] w-full rounded-[28px]" />
          <Skeleton className="h-[232px] w-full rounded-[28px]" />
        </div>
      </div>

      <div className="flex flex-col gap-5">
        <Skeleton className="h-7 w-48 rounded-lg" />
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-[210px] w-full rounded-[28px]" />
          <Skeleton className="h-[210px] w-full rounded-[28px]" />
          <Skeleton className="h-[210px] w-full rounded-[28px]" />
        </div>
      </div>
    </div>
  )
}
