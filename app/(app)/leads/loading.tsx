import { CabeceraEsq, ChipsEsq, KanbanEsq } from '@/components/ui/esqueletos'

/**
 * Esqueleto de Leads.
 *
 * La página es un pipeline kanban, así que el esqueleto son columnas: el
 * genérico de tres tarjetas prometía una forma que no llegaba nunca.
 */
export default function Loading() {
  return (
    <div className="flex h-full w-full flex-col gap-5 p-4 md:p-6" aria-busy="true" aria-label="Cargando los leads">
      <CabeceraEsq conAcciones />
      <ChipsEsq n={5} />
      <KanbanEsq columnas={5} />
    </div>
  )
}
