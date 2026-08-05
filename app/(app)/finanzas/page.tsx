import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { FinanzasRepository } from '@/lib/repos/finanzas'
import { ClientesRepository } from '@/lib/repos/clientes'
import { PermisosRepository, puede } from '@/lib/repos/permisos'
import { FinanzasWorkspace } from '@/components/finanzas/finanzas-workspace'
import { CostoLlamadas } from '@/components/finanzas/costo-llamadas'
import { LlamadasRepository } from '@/lib/repos/llamadas'

export const dynamic = 'force-dynamic'

/**
 * La caja se lleva en días calendario chilenos: un movimiento del 31 a las 22:00 en
 * Santiago es del 31, no del 1 del mes siguiente (que es lo que diría el UTC). Por eso
 * todas las fechas se derivan de la hora local de Santiago, no del reloj del servidor.
 */
const FECHA_SANTIAGO = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Santiago',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** 'YYYY-MM-DD' del instante dado, en hora de Santiago. */
function isoSantiago(fecha: Date): string {
  return FECHA_SANTIAGO.format(fecha)
}

/** Primer y último día del mes en curso (Santiago), en formato YYYY-MM-DD. */
function rangoMesActual(): { desde: string; hasta: string } {
  const hoy = isoSantiago(new Date())
  const [anio, mes] = hoy.split('-').map(Number)
  // Día 0 del mes siguiente = último día de este mes. Evita la tabla de 28/30/31.
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate()
  const mm = String(mes).padStart(2, '0')
  return { desde: `${anio}-${mm}-01`, hasta: `${anio}-${mm}-${String(ultimo).padStart(2, '0')}` }
}

/** Primer día del mes de hace 5 meses: junto al actual dan los 6 meses del resumen. */
function inicioSeisMeses(): string {
  const [anio, mes] = isoSantiago(new Date()).split('-').map(Number)
  const d = new Date(Date.UTC(anio, mes - 1 - 5, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

export default async function FinanzasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const perfil = await new PermisosRepository(supabase).misPermisos(user.id)

  // Sin permiso no se redirige: mandar a otra página deja a la persona sin saber por
  // qué desapareció la sección. Se dice en pantalla que existe y que falta el acceso.
  if (!puede(perfil, 'ver_finanzas')) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-[var(--tx-ink-primary)] mb-1">Finanzas</h1>
        <p className="text-[var(--tx-ink-muted)]">
          No tienes acceso a esta sección. Pídeselo al administrador.
        </p>
      </div>
    )
  }

  const repo = new FinanzasRepository(supabase)
  const { desde, hasta } = rangoMesActual()

  // El consumo de llamadas no debe tumbar la página de finanzas si la migración
  // 037 todavía no se aplicó: la tarjeta muestra ceros y el resto funciona.
  const consumoLlamadas = await new LlamadasRepository(supabase)
    .consumoDelMes(desde)
    .catch(() => null)

  const [movimientos, resumenMensual, clientes] = await Promise.all([
    repo.list({ desde, hasta }),
    repo.resumenMensual(inicioSeisMeses()),
    new ClientesRepository(supabase).list(),
  ])

  return (
    <>
    <div className="px-4 pt-4 md:px-6 md:pt-6">
      <CostoLlamadas consumo={consumoLlamadas} />
    </div>
    <FinanzasWorkspace
      movimientosIniciales={movimientos}
      resumenMensual={resumenMensual}
      rangoInicial={{ desde, hasta }}
      puedeGestionar={puede(perfil, 'gestionar_finanzas')}
      clientes={clientes
        .filter((c) => c.estado === 'activo')
        .map((c) => ({ id: c.id, nombre: c.nombre_negocio || c.nombre_contacto || 'Sin nombre' }))}
    />
    </>
  )
}
