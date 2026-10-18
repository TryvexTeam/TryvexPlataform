import { CabeceraEsq, ChipsEsq, KanbanEsq } from '@/components/ui/esqueletos'

/** Esqueleto de Proyectos: kanban por estado. */
export default function Loading() {
  return (
    <div className="flex h-full w-full flex-col gap-5 p-6" aria-busy="true" aria-label="Cargando los proyectos">
      <CabeceraEsq conAcciones />
      <ChipsEsq n={3} />
      <KanbanEsq columnas={4} />
    </div>
  )
}
