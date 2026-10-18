'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Clock, Play } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import { esSeccionDeTrabajo } from '@/lib/jornada/secciones'

/**
 * Pide marcar entrada antes de trabajar.
 *
 * Sale de lo que dijo Cristian el 11-sep-2026: *"no hay algo que nos obliga a
 * hacer las tareas o a activar la jornada, entonces no avanzamos ni
 * escalamos"*.
 *
 * ⚠️ **Esto es una puerta, no un candado.** Corre en el navegador: no protege
 * datos y no pretende hacerlo — quien quiera esquivarlo, lo esquiva. Lo que
 * hace es poner el gesto de marcar entrada en el camino de trabajar, que es el
 * problema real: nadie se acuerda, no que alguien quiera hacer trampa.
 *
 * **Solo frena lo que es trabajar.** El panel, el perfil y la propia página de
 * jornada quedan libres. Fue decisión de Cristian frente a bloquear el CRM
 * entero, y evita el peor efecto secundario: que alguien que entra cinco
 * minutos un domingo a mirar un lead marque una jornada falsa, y que las horas
 * dejen de significar algo.
 */

export function FrenoJornada({
  jornadaAbierta,
  children,
}: {
  jornadaAbierta: boolean
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [marcando, setMarcando] = useState(false)
  // Dejar pasar por esta vez: la puerta no puede convertirse en un muro para
  // quien de verdad no va a trabajar ahora (una consulta rápida, el domingo).
  // Se olvida al recargar, así que mañana vuelve a preguntar.
  const [dejarPasar, setDejarPasar] = useState(false)

  if (jornadaAbierta || dejarPasar || !esSeccionDeTrabajo(pathname)) {
    return <>{children}</>
  }

  async function empezar() {
    setMarcando(true)
    try {
      const res = await fetch('/api/jornadas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'entrada' }),
      })
      // 409 = ya estaba abierta (la marcó en otra pestaña o en el celular): lo
      // que la persona quería ya está hecho, así que se deja pasar.
      if (res.status === 409) {
        toast.info('Ya tenías la jornada abierta.')
        router.refresh()
        return
      }
      if (!res.ok) throw new Error('no se pudo')
      toast.success('Jornada empezada')
      router.refresh()
    } catch {
      toast.error('No se pudo marcar la entrada')
      setMarcando(false)
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--tx-border)] bg-[var(--tx-surface-1)] p-6 text-center">
        <div
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
          style={{ background: 'oklch(74% 0.17 55 / 12%)', color: 'oklch(80% 0.14 55)' }}
        >
          <Clock size={22} />
        </div>

        <h2 className="text-base font-semibold text-[var(--tx-ink-primary)]">
          Marca tu entrada para trabajar acá
        </h2>
        <p className="mt-2 text-sm text-[var(--tx-ink-muted)]">
          Las horas del equipo salen de aquí. Si no marcas, tu trabajo no queda
          contado en ninguna parte.
        </p>

        <Button className="mt-5 w-full" onClick={empezar} disabled={marcando}>
          <Play size={14} className="mr-1.5" />
          {marcando ? 'Empezando…' : 'Empezar jornada'}
        </Button>

        <div className="mt-3 flex items-center justify-center gap-4 text-[11px] text-[var(--tx-ink-muted)]">
          <button
            type="button"
            onClick={() => setDejarPasar(true)}
            className="underline underline-offset-2 hover:text-[var(--tx-ink-secondary)]"
          >
            Solo voy a mirar
          </button>
          <Link href="/jornada" className="underline underline-offset-2 hover:text-[var(--tx-ink-secondary)]">
            Ver mis jornadas
          </Link>
        </div>
      </div>
    </div>
  )
}
