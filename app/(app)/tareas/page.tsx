import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TareasRepository } from '@/lib/repos/tareas'
import { TareasKanban } from '@/components/tareas/tareas-kanban'

export default async function TareasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const repo = new TareasRepository(supabase)
  const tareas = await repo.list()

  const { data: integrante } = await supabase
    .from('dim_integrantes')
    .select('id, nombre')
    .eq('auth_user_id', user.id)
    .single() as { data: { id: string; nombre: string } | null; error: unknown }

  return (
    <div className="p-6">
      <TareasKanban
        initialTareas={tareas}
        currentUserId={user.id}
        currentIntegranteId={integrante?.id ?? null}
      />
    </div>
  )
}
