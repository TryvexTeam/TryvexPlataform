'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { VentaInsertSchema } from '@/lib/types/proyecto'
import type { Proyecto } from '@/lib/types/proyecto'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

interface PagoFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  clienteId: string
  proyectos: Proyecto[]
  onCreated: () => void
}

export function PagoForm({ open, onOpenChange, clienteId, proyectos, onCreated }: PagoFormProps) {
  const [form, setForm] = useState({
    tipo: 'inicial',
    monto_usd: '',
    estado_pago: 'pendiente',
    fecha_emision: '',
    fecha_vencimiento: '',
    fecha_pago: '',
    metodo_pago: '',
    proyecto_id: '',
    descripcion: '',
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

    const result = VentaInsertSchema.safeParse({
      cliente_id: clienteId,
      proyecto_id: form.proyecto_id || null,
      tipo: form.tipo,
      monto_usd: form.monto_usd ? Number(form.monto_usd) : 0,
      estado_pago: form.estado_pago,
      fecha_emision: form.fecha_emision || null,
      fecha_vencimiento: form.fecha_vencimiento || null,
      fecha_pago: form.fecha_pago || null,
      metodo_pago: form.metodo_pago || null,
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
      const res = await fetch('/api/pagos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result.data),
      })
      if (!res.ok) throw new Error()
      toast.success('Pago registrado')
      onOpenChange(false)
      onCreated()
    } catch {
      toast.error('Error al registrar el pago')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar pago</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Monto (USD) *</Label>
              <Input type="number" step="0.01" value={form.monto_usd} onChange={(e) => set('monto_usd', e.target.value)} placeholder="0" />
              {errors.monto_usd && <p className="text-xs text-red-500">{errors.monto_usd}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => set('tipo', v ?? 'inicial')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="inicial">Inicial</SelectItem>
                  <SelectItem value="mantencion">Mantención</SelectItem>
                  <SelectItem value="extra">Extra</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select value={form.estado_pago} onValueChange={(v) => set('estado_pago', v ?? 'pendiente')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendiente">Pendiente</SelectItem>
                  <SelectItem value="pagado">Pagado</SelectItem>
                  <SelectItem value="atrasado">Atrasado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Método</Label>
              <Select value={form.metodo_pago} onValueChange={(v) => set('metodo_pago', v ?? '')}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                  <SelectItem value="mercadopago">MercadoPago</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {proyectos.length > 0 && (
            <div className="space-y-1.5">
              <Label>Proyecto asociado</Label>
              <Select value={form.proyecto_id} onValueChange={(v) => set('proyecto_id', v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Sin proyecto" /></SelectTrigger>
                <SelectContent>
                  {proyectos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Fecha emisión</Label>
              <Input type="date" value={form.fecha_emision} onChange={(e) => set('fecha_emision', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Fecha de cobro</Label>
              <Input type="date" value={form.fecha_vencimiento} onChange={(e) => set('fecha_vencimiento', e.target.value)} />
            </div>
          </div>

          {form.estado_pago === 'pagado' && (
            <div className="space-y-1.5">
              <Label>Fecha de pago</Label>
              <Input type="date" value={form.fecha_pago} onChange={(e) => set('fecha_pago', e.target.value)} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <Input value={form.descripcion} onChange={(e) => set('descripcion', e.target.value)} placeholder="Ej: 2da cuota landing" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Guardando...' : 'Registrar pago'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
