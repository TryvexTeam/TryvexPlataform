'use client'

import { useState } from 'react'
import { toast } from '@/lib/toast'
import { ClienteInsertSchema, type Cliente, type ClienteInsert } from '@/lib/types/cliente'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

interface ClienteFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  cliente?: Cliente
  onSubmit: (data: ClienteInsert) => Promise<void>
}

export function ClienteForm({ open, onOpenChange, cliente, onSubmit }: ClienteFormProps) {
  const [form, setForm] = useState({
    nombre_negocio: cliente?.nombre_negocio ?? '',
    nombre_contacto: cliente?.nombre_contacto ?? '',
    telefono: cliente?.telefono ?? '',
    email: cliente?.email ?? '',
    nicho: cliente?.nicho ?? '',
    localidad: cliente?.localidad ?? '',
    valor_inicial_usd: cliente?.valor_inicial_usd?.toString() ?? '',
    mantencion_mensual_usd: cliente?.mantencion_mensual_usd?.toString() ?? '',
    fecha_cierre: cliente?.fecha_cierre ?? '',
    estado: (cliente?.estado ?? 'activo') as string,
    notas: cliente?.notas ?? '',
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

    const result = ClienteInsertSchema.safeParse({
      ...form,
      nombre_negocio: form.nombre_negocio || null,
      telefono: form.telefono || null,
      email: form.email || null,
      nicho: form.nicho || null,
      localidad: form.localidad || null,
      fecha_cierre: form.fecha_cierre || null,
      notas: form.notas || null,
      valor_inicial_usd: form.valor_inicial_usd ? Number(form.valor_inicial_usd) : null,
      mantencion_mensual_usd: form.mantencion_mensual_usd ? Number(form.mantencion_mensual_usd) : null,
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
    } catch {
      toast.error('Error al guardar el cliente')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{cliente ? 'Editar cliente' : 'Nuevo cliente'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nombre del cliente *</Label>
            <Input value={form.nombre_contacto} onChange={(e) => set('nombre_contacto', e.target.value)} placeholder="Ej: Rodolfo" />
            {errors.nombre_contacto && <p className="text-xs text-red-500">{errors.nombre_contacto}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Teléfono</Label>
              <Input value={form.telefono} onChange={(e) => set('telefono', e.target.value)} placeholder="+56 9..." />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="email@..." />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Negocio</Label>
              <Input value={form.nombre_negocio} onChange={(e) => set('nombre_negocio', e.target.value)} placeholder="Ej: perrustingo" />
            </div>
            <div className="space-y-1.5">
              <Label>Nicho</Label>
              <Input value={form.nicho} onChange={(e) => set('nicho', e.target.value)} placeholder="Ej: Peluquería canina" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Localidad</Label>
              <Input value={form.localidad} onChange={(e) => set('localidad', e.target.value)} placeholder="Santiago" />
            </div>
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select value={form.estado} onValueChange={(v) => set('estado', v ?? 'activo')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="activo">Activo</SelectItem>
                  <SelectItem value="pausado">Pausado</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Valor inicial (USD)</Label>
              <Input type="number" value={form.valor_inicial_usd} onChange={(e) => set('valor_inicial_usd', e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Mantención/mes (USD)</Label>
              <Input type="number" value={form.mantencion_mensual_usd} onChange={(e) => set('mantencion_mensual_usd', e.target.value)} placeholder="0" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Fecha cierre</Label>
            <Input type="date" value={form.fecha_cierre} onChange={(e) => set('fecha_cierre', e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea value={form.notas} onChange={(e) => set('notas', e.target.value)} rows={2} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Guardando...' : cliente ? 'Guardar' : 'Crear cliente'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
