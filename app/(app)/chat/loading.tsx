import { ListaEsq } from '@/components/ui/esqueletos'

/**
 * Esqueleto del Chat: la lista de hilos a la izquierda y la conversación a la
 * derecha. En celular solo se ve la lista, que es lo que carga primero.
 */
export default function Loading() {
  return (
    <div className="flex h-full w-full gap-4 p-4 md:p-6" aria-busy="true" aria-label="Cargando el chat">
      <div className="flex w-full flex-col gap-3 md:max-w-[320px]">
        <div aria-hidden="true" className="h-10 w-full animate-pulse rounded-full bg-white/[0.045]" />
        <ListaEsq filas={7} />
      </div>
      <div
        aria-hidden="true"
        className="hidden flex-1 animate-pulse rounded-[28px] border border-white/[0.05] bg-white/[0.02] md:block"
      />
    </div>
  )
}
