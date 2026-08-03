import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { CerebroRepository } from '@/lib/repos/cerebro'
import { Bitacora } from '@/components/cerebro/bitacora'
import { FiltroBitacoraSchema } from '@/lib/types/cerebro'

export const dynamic = 'force-dynamic'

export default async function CerebroPage({
  searchParams,
}: {
  searchParams: Promise<{ entidad_tipo?: string; entidad_id?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-[var(--tx-ink-primary)]">Cerebro</h1>
        <p className="text-neutral-500 mt-1">No eres integrante activo. Contacta al administrador.</p>
      </div>
    )
  }

  // El filtro puede llegar desde la ficha de un lead o de un cliente.
  const params = await searchParams
  const filtro = FiltroBitacoraSchema.safeParse(params)

  const repo = new CerebroRepository(supabase)
  const [entradas, entidades] = await Promise.all([
    repo.listEntradas(filtro.success ? filtro.data : FiltroBitacoraSchema.parse({})),
    repo.entidadesActivas(),
  ])

  return (
    <div className="p-6 h-full flex flex-col min-h-0">
      <header className="mb-5 shrink-0">
        <h1 className="text-2xl font-bold text-[var(--tx-ink-primary)] mb-1">Cerebro</h1>
        <p className="text-neutral-500">
          La bitácora del negocio. Cada contacto, WhatsApp, reunión y venta queda acá, ordenado por
          cliente y por día.
        </p>
      </header>

      <div className="flex-1 min-h-0">
        <Bitacora entradasIniciales={entradas} entidades={entidades} />
      </div>
    </div>
  )
}
