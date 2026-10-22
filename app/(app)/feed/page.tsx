import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { FeedRepository } from '@/lib/repos/feed'
import { FeedVista, type PestanaFeed } from '@/components/feed/feed-vista'

export const metadata = { title: 'Feed — Tryvex CRM' }

const PESTANAS: PestanaFeed[] = ['equipo', 'afuera', 'guardado']

export default async function FeedPage({ searchParams }: { searchParams: Promise<{ ver?: string; col?: string }> }) {
  const { ver, col } = await searchParams
  const pestana: PestanaFeed = PESTANAS.includes(ver as PestanaFeed) ? (ver as PestanaFeed) : 'equipo'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const yo = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!yo) redirect('/login')

  const repo = new FeedRepository(supabase, yo.id)
  const colecciones = await repo.colecciones()
  const coleccionActiva = pestana === 'guardado' ? (colecciones.find((c) => c.id === col) ?? colecciones[0] ?? null) : null

  const publicaciones =
    pestana === 'guardado'
      ? coleccionActiva
        ? await repo.listar('post', coleccionActiva.id)
        : []
      : await repo.listar(pestana === 'afuera' ? 'noticia' : 'post')

  return (
    <div className="mx-auto w-full max-w-2xl p-4 md:p-6">
      <FeedVista
        pestana={pestana}
        publicaciones={publicaciones}
        colecciones={colecciones}
        coleccionActivaId={coleccionActiva?.id ?? null}
        yo={{ nombre: yo.nombre, avatarUrl: yo.avatar_url, color: yo.color }}
      />
    </div>
  )
}
