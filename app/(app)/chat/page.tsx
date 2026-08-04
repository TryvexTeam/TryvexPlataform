import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { ChatRepository } from '@/lib/repos/chat'
import { ChatWorkspace } from '@/components/chat/chat-workspace'

export const dynamic = 'force-dynamic'

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const integrantes = new IntegrantesRepository(supabase)
  const perfil = await integrantes.getByAuthUser(user.id)
  if (!perfil) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-[var(--tx-ink-primary)]">Chat</h1>
        <p className="text-neutral-500 mt-1">No eres integrante activo. Contacta al administrador.</p>
      </div>
    )
  }

  const { c } = await searchParams
  const [conversaciones, equipo, agentes] = await Promise.all([
    new ChatRepository(supabase).listConversaciones(perfil.id),
    integrantes.listActivos(),
    // Los agentes no son integrantes: escriben en el hilo pero no tienen fila en
    // dim_integrantes, así que sus datos vienen aparte para poder mostrarlos.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('agentes').select('id, nombre, color, avatar_url').then(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (r: any) => (r.data ?? []) as { id: string; nombre: string; color: string | null; avatar_url: string | null }[],
    ),
  ])

  return (
    <div className="p-3 sm:p-6 h-full flex flex-col min-h-0">
      {/* En un teléfono el encabezado se comía la pantalla del chat: el subtítulo
          explica algo que ya se ve, así que ahí sobra. */}
      <header className="mb-2 sm:mb-4 shrink-0">
        <h1 className="text-xl sm:text-2xl font-bold text-[var(--tx-ink-primary)] sm:mb-1">Chat</h1>
        <p className="hidden sm:block text-neutral-500">
          Conversaciones del equipo: grupos y mensajes directos.
        </p>
      </header>

      <div className="flex-1 min-h-0">
        <ChatWorkspace
          conversacionesIniciales={conversaciones}
          agentes={agentes}
          soyAdmin={perfil.es_admin}
          equipo={equipo.map((i) => ({
            id: i.id,
            nombre: i.nombre,
            avatar_url: i.avatar_url,
            color: i.color,
          }))}
          miIntegranteId={perfil.id}
          conversacionInicialId={c}
        />
      </div>
    </div>
  )
}
