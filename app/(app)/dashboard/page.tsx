import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, CheckSquare, FolderKanban, Building2 } from 'lucide-react'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: integrante } = await supabase
    .from('dim_integrantes')
    .select('nombre')
    .eq('auth_user_id', user.id)
    .single() as { data: { nombre: string } | null; error: unknown }

  const nombre = integrante?.nombre ?? 'equipo'

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-neutral-900">
          Hola, {nombre} 👋
        </h1>
        <p className="text-neutral-500 mt-1">Bienvenido al sistema operativo de Tryvex</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-neutral-500">Leads</CardTitle>
              <Users size={16} className="text-neutral-400" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">—</p>
            <p className="text-xs text-neutral-400 mt-1">Disponible en Fase 7</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-neutral-500">Tareas activas</CardTitle>
              <CheckSquare size={16} className="text-neutral-400" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">—</p>
            <p className="text-xs text-neutral-400 mt-1">Disponible en Fase 7</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-neutral-500">Proyectos</CardTitle>
              <FolderKanban size={16} className="text-neutral-400" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">—</p>
            <p className="text-xs text-neutral-400 mt-1">Disponible en Fase 7</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-neutral-500">Clientes activos</CardTitle>
              <Building2 size={16} className="text-neutral-400" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">—</p>
            <p className="text-xs text-neutral-400 mt-1">Disponible en Fase 7</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Actividad reciente</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-neutral-400 py-8 text-center">
            El feed de actividad estará disponible en la Fase 7
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
