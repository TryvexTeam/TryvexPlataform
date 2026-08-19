'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Check } from 'lucide-react'
import { toast } from '@/lib/toast'
import { VentaInsertSchema } from '@/lib/types/proyecto'
import type { Proyecto, Venta } from '@/lib/types/proyecto'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { SelectorFecha } from '@/components/ui/selector-fecha'

interface PagoFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  clienteId: string
  proyectos: Proyecto[]
  onCreated: () => void
  /** Cobros del cliente que siguen esperando pago. Alimentan el aviso de duplicado. */
  ventasPendientes?: Venta[]
  /** Marca una pendiente como pagada, en vez de crear una venta nueva. */
  onMarcarPagada?: (ventaId: string) => Promise<void>
}

const FECHA_CORTA = new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'short' })

function etiquetaVenta(v: Venta): string {
  const monto = `$${(v.monto_usd ?? 0).toLocaleString('es-CL')}`
  const fecha = v.fecha_vencimiento ?? v.fecha_emision
  return fecha ? `${monto} · vence ${FECHA_CORTA.format(new Date(fecha))}` : monto
}

export function PagoForm({
  open,
  onOpenChange,
  clienteId,
  proyectos,
  onCreated,
  ventasPendientes = [],
  onMarcarPagada,
}: PagoFormProps) {
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
  const [marcando, setMarcando] = useState<string | null>(null)

  // Un cobro pendiente por el MISMO monto casi siempre es el que se está pagando.
  // Registrar una venta nueva en ese caso deja las dos vivas y el cliente queda
  // debiendo algo que ya pagó — que es exactamente lo que pasó con Rodolfo.
  const coincidencias = useMemo(() => {
    const monto = Number(form.monto_usd)
    if (!monto) return []
    return ventasPendientes.filter((v) => Number(v.monto_usd ?? 0) === monto)
  }, [form.monto_usd, ventasPendientes])

  async function marcarPagada(ventaId: string) {
    if (!onMarcarPagada) return
    setMarcando(ventaId)
    try {
      await onMarcarPagada(ventaId)
      onOpenChange(false)
    } finally {
      setMarcando(null)
    }
  }

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
          {/* Aviso de duplicado. No bloquea: a veces sí corresponde una venta nueva.
              Pero pone el camino correcto a un clic de distancia. */}
          {coincidencias.length > 0 && onMarcarPagada && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
              <div className="flex gap-2">
                <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-amber-900">
                    Ya hay un cobro pendiente por este mismo monto
                  </p>
                  <p className="mt-0.5 text-xs text-amber-800">
                    Si este es el pago de ese cobro, márcalo como pagado. Crear uno nuevo deja
                    los dos vivos y el cliente queda debiendo algo que ya pagó.
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {coincidencias.map((v) => (
                      <li key={v.id} className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-amber-900">{etiquetaVenta(v)}</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 border-amber-400 bg-white text-xs hover:bg-amber-100"
                          disabled={marcando !== null}
                          onClick={() => marcarPagada(v.id)}
                        >
                          <Check size={12} className="mr-1" aria-hidden />
                          {marcando === v.id ? 'Marcando...' : 'Marcar como pagado'}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {coincidencias.length === 0 && ventasPendientes.length > 0 && (
            <p className="rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
              Este cliente tiene {ventasPendientes.length}{' '}
              {ventasPendientes.length === 1 ? 'cobro pendiente' : 'cobros pendientes'}. Si estás
              registrando el pago de alguno, márcalo como pagado en vez de crear uno nuevo.
            </p>
          )}

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
              <SelectorFecha value={form.fecha_emision} onChange={(v) => set('fecha_emision', v)} />
            </div>
            <div className="space-y-1.5">
              <Label>Fecha de cobro</Label>
              <SelectorFecha value={form.fecha_vencimiento} onChange={(v) => set('fecha_vencimiento', v)} />
            </div>
          </div>

          {form.estado_pago === 'pagado' && (
            <div className="space-y-1.5">
              <Label>Fecha de pago</Label>
              <SelectorFecha value={form.fecha_pago} onChange={(v) => set('fecha_pago', v)} />
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
