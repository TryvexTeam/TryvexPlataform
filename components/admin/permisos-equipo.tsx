'use client'

import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/lib/toast'
import {
  PERMISO_LABELS,
  normalizarPermisos,
  type IntegrantePermisos,
  type Permiso,
} from '@/lib/types/permisos'

interface PermisosEquipoProps {
  equipoInicial: IntegrantePermisos[]
}

export function PermisosEquipo({ equipoInicial }: PermisosEquipoProps) {
  const [equipo, setEquipo] = useState<IntegrantePermisos[]>(equipoInicial)
  const [guardando, setGuardando] = useState<string | null>(null)

  function aplicar(id: string, cambios: Partial<Record<Permiso, boolean>>) {
    setEquipo((prev) => prev.map((i) => (i.id === id ? { ...i, ...cambios } : i)))
  }

  async function togglePermiso(integrante: IntegrantePermisos, permiso: Permiso, valor: boolean) {
    // Se normaliza igual que en el servidor para que la UI no muestre por un instante
    // un estado que la base va a corregir (gestionar implica ver).
    const cambios = normalizarPermisos({ [permiso]: valor } as Partial<Record<Permiso, boolean>>)
    const previo: Partial<Record<Permiso, boolean>> = {}
    for (const clave of Object.keys(cambios) as Permiso[]) previo[clave] = integrante[clave]

    aplicar(integrante.id, cambios)
    setGuardando(integrante.id)

    try {
      const res = await fetch('/api/permisos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ integrante_id: integrante.id, ...cambios }),
      })
      if (!res.ok) {
        const cuerpo = await res.json().catch(() => null)
        throw new Error(typeof cuerpo?.error === 'string' ? cuerpo.error : 'No se pudo guardar')
      }
      toast.success('Accesos actualizados', { description: integrante.nombre })
    } catch (e) {
      // Reversión: el switch vuelve a lo que la base sigue teniendo.
      aplicar(integrante.id, previo)
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setGuardando(null)
    }
  }

  if (equipo.length === 0) {
    return <p className="text-sm text-neutral-500">No hay integrantes activos todavía.</p>
  }

  return (
    <div className="space-y-3">
      {equipo.map((integrante) => (
        <article
          key={integrante.id}
          className="rounded-xl border border-neutral-200 p-4"
          style={{ opacity: guardando === integrante.id ? 0.7 : 1, transition: 'opacity 150ms' }}
        >
          <header className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate text-[var(--tx-ink-primary)]">
                {integrante.nombre}
              </p>
              <p className="text-xs text-neutral-500 truncate">{integrante.email}</p>
            </div>
            {integrante.es_superadmin && (
              <span className="inline-flex items-center gap-1 rounded-full border border-neutral-300 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
                <ShieldCheck size={11} /> Dueño de la cuenta
              </span>
            )}
          </header>

          {/* Móvil: switches apilados. Desde md: dos columnas, sin scroll horizontal. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {PERMISO_LABELS.map(({ key, label, descripcion }) => {
              const control = `permiso-${integrante.id}-${key}`
              return (
                <div key={key} className="flex items-start justify-between gap-3">
                  <label htmlFor={control} className="min-w-0">
                    <span className="block text-[13px] font-medium text-[var(--tx-ink-primary)]">
                      {label}
                    </span>
                    <span className="block text-[11.5px] text-neutral-500 leading-snug">
                      {descripcion}
                    </span>
                  </label>
                  <Switch
                    id={control}
                    className="mt-0.5 shrink-0"
                    /* El dueño lo tiene todo por definición y el trigger de la base rechaza
                       degradarlo: dejar el switch activo solo produciría errores. */
                    disabled={integrante.es_superadmin || guardando === integrante.id}
                    checked={integrante.es_superadmin ? true : integrante[key]}
                    onCheckedChange={(valor: boolean) => togglePermiso(integrante, key, valor)}
                  />
                </div>
              )
            })}
          </div>
        </article>
      ))}
    </div>
  )
}
