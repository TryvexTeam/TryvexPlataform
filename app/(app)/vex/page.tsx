import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { VexChat } from '@/components/vex/vex-chat'

export const dynamic = 'force-dynamic'

interface VexTurno {
  rol: 'user' | 'vex'
  texto: string
  created_at: string
}

export default async function VexPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: integrante } = await supabase
    .from('dim_integrantes')
    .select('id')
    .eq('auth_user_id', user.id)
    .single() as { data: { id: string } | null; error: unknown }

  let historial: VexTurno[] = []
  if (integrante) {
    const { data } = await supabase
      .from('vex_conversaciones')
      .select('rol, texto, created_at')
      .eq('integrante_id', integrante.id)
      .order('created_at', { ascending: true })
      .limit(50) as { data: VexTurno[] | null; error: unknown }
    historial = data ?? []
  }

  // El chat de Vex iba pegado a los cuatro bordes de la ventana: es la única
  // pantalla que se dibujaba sin margen exterior. Mismo respiro que el resto.
  return (
    <div className="h-full p-3 sm:p-6">
      <VexChat historialInicial={historial} />
    </div>
  )
}
