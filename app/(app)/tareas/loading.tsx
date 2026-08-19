import { CabeceraEsq, ChipsEsq, KanbanEsq } from '@/components/ui/esqueletos'

/** Esqueleto de Tareas: el kanban de tres estados. */
export default function Loading() {
  return (
    <div className="flex h-full w-full flex-col gap-5 p-4 md:p-6" aria-busy="true" aria-label="Cargando las tareas">
      <CabeceraEsq conAcciones />
      <ChipsEsq n={4} />
      <KanbanEsq columnas={3} />
    </div>
  )
}
