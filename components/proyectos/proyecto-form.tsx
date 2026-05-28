'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { ProyectoInsertSchema, type Proyecto, type ProyectoInsert } from '@/lib/types/proyecto'
import type { Cliente } from '@/lib/types/cliente'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

interface ProyectoFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  proyecto?: Proyecto
  clientes: Cliente[]
  onSubmit: (data: ProyectoInsert) => Promise<void>
}

export function ProyectoForm({ open, onOpenChange, proyecto, clientes, onSubmit }: ProyectoFormProps) {
  const [form, setForm] = useState({
    nombre: proyecto?.nombre ?? '',
    tipo: (proyecto?.tipo ?? 'otro') as string,
    estado: (proyecto?.estado ?? 'brief') as string,
    cliente_id: proyecto?.cliente_id ?? '',
    costo_total_usd: proyecto?.costo_total_usd?.toString() ?? '',
    horas_estimadas: proyecto?.horas_estimadas?.toString() ?? '',
    horas_reales: proyecto?.horas_reales?.toString() ?? '',
    fecha_inicio: proyecto?.fecha_inicio ?? '',
    fecha_entrega: proyecto?.fecha_entrega ?? '',
    url_deploy: proyecto?.url_deploy ?? '',
    repo_url: proyecto?.repo_url ?? '',
  })
  const [loading, setLoading] = useState(false)

  function set(field: string, value: string) {
    setForm((p) => ({ ...p, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const result = ProyectoInsertSchema.safeParse({
      ...form,
      cliente_id: form.cliente_id || null,
      costo_total_usd: form.costo_total_usd ? Number(form.costo_total_usd) : null,
      horas_estimadas: form.horas_estimadas ? Number(form.horas_estimadas) : null,
      horas_reales: form.horas_reales ? Number(form.horas_reales) : null,
      fecha_inicio: form.fecha_inicio || null,
      fecha_entrega: form.fecha_entrega || null,
      url_deploy: form.url_deploy || null,
      repo_url: form.repo_url || null,
    })
    if (!result.success) { toast.error('Revisa los campos'); return }
    setLoading(true)
    try {
      await onSubmit(result.data)
      onOpenChange(false)
    } catch { toast.error('Error al guardar') }
    finally { setLoading(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{proyecto ? 'Editar proyecto' : 'Nuevo proyecto'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nombre *</Label>
            <Input value={form.nombre} onChange={(e) => set('nombre', e.target.value)} placeholder="Nombre del proyecto" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => set('tipo', v ?? 'otro')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="landing">Landing</SelectItem>
                  <SelectItem value="automatizacion">Automatización</SelectItem>
                  <SelectItem value="mantencion">Mantención</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select value={form.estado} onValueChange={(v) => set('estado', v ?? 'brief')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="brief">Brief</SelectItem>
                  <SelectItem value="desarrollo">Desarrollo</SelectItem>
                  <SelectItem value="revision">Revisión</SelectItem>
                  <SelectItem value="entregado">Entregado</SelectItem>
                  <SelectItem value="mantencion">Mantención</SelectItem>
                  <SelectItem value="cerrado">Cerrado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Cliente</Label>
            <Select value={form.cliente_id} onValueChange={(v) => set('cliente_id', v ?? '')}>
              <SelectTrigger><SelectValue placeholder="Sin cliente" /></SelectTrigger>
              <SelectContent>
                {clientes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nombre_negocio}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Costo (USD)</Label>
              <Input type="number" value={form.costo_total_usd} onChange={(e) => set('costo_total_usd', e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Hs. estimadas</Label>
              <Input type="number" value={form.horas_estimadas} onChange={(e) => set('horas_estimadas', e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Hs. reales</Label>
              <Input type="number" value={form.horas_reales} onChange={(e) => set('horas_reales', e.target.value)} placeholder="0" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Inicio</Label>
              <Input type="date" value={form.fecha_inicio} onChange={(e) => set('fecha_inicio', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Entrega</Label>
              <Input type="date" value={form.fecha_entrega} onChange={(e) => set('fecha_entrega', e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>URL deploy</Label>
            <Input value={form.url_deploy} onChange={(e) => set('url_deploy', e.target.value)} placeholder="https://..." />
          </div>
          <div className="space-y-1.5">
            <Label>Repo URL</Label>
            <Input value={form.repo_url} onChange={(e) => set('repo_url', e.target.value)} placeholder="https://github.com/..." />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Guardando...' : proyecto ? 'Guardar' : 'Crear'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
