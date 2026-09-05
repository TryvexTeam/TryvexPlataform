import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TareasRepository } from '@/lib/repos/tareas'
import { TareasKanban } from '@/components/tareas/tareas-kanban'

export default async function TareasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const repo = new TareasRepository(supabase)
  // La papelera se carga junto al resto: el kanban filtra por eliminado_at en
  // el cliente, asi arrastrar de vuelta no depende de un segundo fetch.
  const [tareas, papelera] = await Promise.all([repo.list(), repo.listPapelera()])

  // Una sola consulta agregada para TODAS las tarjetas: el avance de los pasos
  // se pinta en la tarjeta, y pedirlo tarjeta por tarjeta sería un viaje a la
  // base por tarea (N+1). Ver `progresoSubtareas`.
  const progresoSubtareas = await repo.progresoSubtareas(
    [...tareas, ...papelera].map((t) => t.id),
  )

  const { data: integrante } = await supabase
    .from('dim_integrantes')
    .select('id, nombre')
    .eq('auth_user_id', user.id)
    .single() as { data: { id: string; nombre: string } | null; error: unknown }

  return (
    <div className="p-4 md:p-6">
      <TareasKanban
        initialTareas={[...tareas, ...papelera]}
        currentUserId={user.id}
        currentIntegranteId={integrante?.id ?? null}
        progresoSubtareas={progresoSubtareas}
      />
    </div>
  )
}
