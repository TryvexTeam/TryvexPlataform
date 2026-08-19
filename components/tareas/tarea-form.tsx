'use client'

import { useEffect, useState } from 'react'
import { toast } from '@/lib/toast'
import { z } from 'zod'
import { ESTADOS_TAREA, TareaInsertSchema, type TareaConResponsables } from '@/lib/types/tarea'
import type { DisponibilidadIntegrante } from '@/lib/types/disponibilidad'
import { getInitials, hashColorHex, MEMBER_PALETTE } from '@/lib/utils/lead-utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

interface TareaFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tarea?: TareaConResponsables
  onSubmit: (data: z.infer<typeof TareaInsertSchema>) => Promise<void>
}

const defaults = {
  titulo: '',
  descripcion: '',
  tipo: 'general' as const,
  estado: 'sin_empezar' as const,
  prioridad: 'media' as const,
  esfuerzo: 'medio' as const,
  fecha_limite: '',
  hora_limite: '',
}

export function TareaForm({ open, onOpenChange, tarea, onSubmit }: TareaFormProps) {
  const [form, setForm] = useState({
    titulo: tarea?.titulo ?? defaults.titulo,
    descripcion: tarea?.descripcion ?? defaults.descripcion,
    tipo: (tarea?.tipo ?? defaults.tipo) as string,
    estado: (tarea?.estado ?? defaults.estado) as string,
    prioridad: (tarea?.prioridad ?? defaults.prioridad) as string,
    esfuerzo: (tarea?.esfuerzo ?? defaults.esfuerzo) as string,
    fecha_limite: tarea?.fecha_limite ?? defaults.fecha_limite,
    // La base guarda 'HH:MM:SS' y el input de hora espera 'HH:MM': se recorta
    // al leer, y al guardar el propio input ya entrega el formato corto.
    hora_limite: tarea?.hora_limite?.slice(0, 5) ?? defaults.hora_limite,
  })
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [integrantes, setIntegrantes] = useState<DisponibilidadIntegrante[]>([])
  const [responsables, setResponsables] = useState<Set<string>>(
    new Set(tarea?.responsables.map((r) => r.integrante_id) ?? [])
  )

  // Miembros del equipo para asignar (misma fuente y colores que el calendario)
  useEffect(() => {
    if (!open) return
    let cancelled = false
    fetch('/api/disponibilidad')
      .then((r) => r.json())
      .then((json: { success: boolean; data: DisponibilidadIntegrante[] }) => {
        if (!cancelled && json.success) setIntegrantes(json.data)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [open])

  function memberColor(integranteId: string, nombre: string): string {
    const idx = integrantes.findIndex((m) => m.integrante_id === integranteId)
    return idx >= 0 ? MEMBER_PALETTE[idx % MEMBER_PALETTE.length] : hashColorHex(nombre)
  }

  function set(field: string, value: string) {
    setForm((p) => ({ ...p, [field]: value }))
    setErrors((p) => ({ ...p, [field]: '' }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    const result = TareaInsertSchema.safeParse({
      ...form,
      fecha_limite: form.fecha_limite || null,
      // Sin día no puede haber hora: es lo que exige la base (migración 054) y
      // además una hora suelta no significa nada. Se limpia aquí para que el
      // usuario no reciba un error de la base por algo que la interfaz puede
      // resolver sola.
      hora_limite: form.fecha_limite ? form.hora_limite || null : null,
      descripcion: form.descripcion || null,
      responsables_ids: Array.from(responsables),
    })

    if (!result.success) {
      const fe: Record<string, string> = {}
      result.error.issues.forEach((i) => { if (i.path[0]) fe[i.path[0] as string] = i.message })
      setErrors(fe)
      return
    }

    setLoading(true)
    try {
      await onSubmit(result.data)
      onOpenChange(false)
      setForm(defaults)
    } catch {
      toast.error('Error al guardar la tarea')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{tarea ? 'Editar tarea' : 'Nueva tarea'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Título *</Label>
            <Input value={form.titulo} onChange={(e) => set('titulo', e.target.value)} placeholder="¿Qué hay que hacer?" />
            {errors.titulo && <p className="text-xs text-red-500">{errors.titulo}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <Textarea value={form.descripcion ?? ''} onChange={(e) => set('descripcion', e.target.value)} rows={2} placeholder="Detalles opcionales..." />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => set('tipo', v ?? '')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="feature">Feature</SelectItem>
                  <SelectItem value="error">Bug</SelectItem>
                  <SelectItem value="pulir">Pulir</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select value={form.estado} onValueChange={(v) => set('estado', v ?? '')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ESTADOS_TAREA.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Prioridad</Label>
              <Select value={form.prioridad} onValueChange={(v) => set('prioridad', v ?? '')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="media">Media</SelectItem>
                  <SelectItem value="baja">Baja</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Esfuerzo</Label>
              <Select value={form.esfuerzo} onValueChange={(v) => set('esfuerzo', v ?? '')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pequeno">Pequeño (S)</SelectItem>
                  <SelectItem value="medio">Medio (M)</SelectItem>
                  <SelectItem value="grande">Grande (L)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Fecha y hora separadas, no un `datetime-local`: la hora es
              OPCIONAL y con un campo único no hay forma de decir "vence el
              jueves, a cualquier hora" — que es como se pide la mayoría de las
              tareas. Con hora, el calendario la coloca en su franja; sin ella,
              aparece en el día. */}
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div className="space-y-1.5">
              <Label>Fecha límite</Label>
              <Input
                type="date"
                value={form.fecha_limite ?? ''}
                onChange={(e) => set('fecha_limite', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                Hora <span className="text-[var(--tx-ink-muted)]">(opcional)</span>
              </Label>
              <Input
                type="time"
                value={form.hora_limite ?? ''}
                // Sin fecha la hora no puede existir, así que el campo se
                // apaga en vez de dejar escribir algo que se descartará.
                disabled={!form.fecha_limite}
                onChange={(e) => set('hora_limite', e.target.value)}
              />
            </div>
          </div>

          {integrantes.length > 0 && (
            <div className="space-y-1.5">
              <Label>Responsables</Label>
              <div className="flex flex-wrap gap-1.5">
                {integrantes.map((m) => {
                  const selected = responsables.has(m.integrante_id)
                  const color = memberColor(m.integrante_id, m.nombre)
                  return (
                    <button
                      key={m.integrante_id}
                      type="button"
                      onClick={() => {
                        setResponsables((prev) => {
                          const next = new Set(prev)
                          if (next.has(m.integrante_id)) next.delete(m.integrante_id)
                          else next.add(m.integrante_id)
                          return next
                        })
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-all"
                      style={{
                        border: `1.5px solid ${selected ? color : 'rgba(128,128,128,0.35)'}`,
                        background: selected ? `${color}3a` : 'transparent',
                        color: selected ? color : undefined,
                      }}
                    >
                      <span
                        className="flex items-center justify-center rounded-full text-[8px] font-bold"
                        style={{ width: 16, height: 16, background: color, color: '#000' }}
                      >
                        {getInitials(m.nombre)}
                      </span>
                      {m.nombre}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Guardando...' : tarea ? 'Guardar cambios' : 'Crear tarea'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
