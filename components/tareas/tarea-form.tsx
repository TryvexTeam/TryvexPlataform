'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { TareaInsertSchema, type TareaConResponsables } from '@/lib/types/tarea'
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
  })
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

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
      descripcion: form.descripcion || null,
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
                  <SelectItem value="sin_empezar">Sin empezar</SelectItem>
                  <SelectItem value="en_curso">En curso</SelectItem>
                  <SelectItem value="listo">Listo</SelectItem>
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

          <div className="space-y-1.5">
            <Label>Fecha límite</Label>
            <Input type="date" value={form.fecha_limite ?? ''} onChange={(e) => set('fecha_limite', e.target.value)} />
          </div>

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
