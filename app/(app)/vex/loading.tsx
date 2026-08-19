import { ListaEsq } from '@/components/ui/esqueletos'

/** Esqueleto de Vex: la conversación con el asistente. */
export default function Loading() {
  return (
    <div className="flex h-full w-full flex-col gap-4 p-4 md:p-6" aria-busy="true" aria-label="Cargando Vex">
      <div aria-hidden="true" className="h-6 w-32 animate-pulse rounded-lg bg-white/[0.055]" />
      <ListaEsq filas={4} />
      <div className="flex-1" />
      <div aria-hidden="true" className="h-12 w-full animate-pulse rounded-full bg-white/[0.045]" />
    </div>
  )
}
