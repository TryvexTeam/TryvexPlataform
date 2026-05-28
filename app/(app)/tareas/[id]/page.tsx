import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TareasRepository } from '@/lib/repos/tareas'
import { TareaDetalle } from '@/components/tareas/tarea-detalle'

export default async function TareaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const repo = new TareasRepository(supabase)
  const [tarea, subtareas] = await Promise.all([
    repo.getById(id),
    repo.listSubtareas(id),
  ])

  if (!tarea) notFound()

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <TareaDetalle tarea={tarea} initialSubtareas={subtareas} />
    </div>
  )
}
