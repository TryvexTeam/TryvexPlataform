'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowLeft, Pencil, Trash2, Phone, Mail, MapPin, DollarSign, FolderKanban } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ClienteForm } from './cliente-form'
import type { Cliente, ClienteInsert } from '@/lib/types/cliente'
import type { Proyecto, Venta } from '@/lib/types/proyecto'
import { ESTADOS_PROYECTO } from '@/lib/types/proyecto'
import { cn } from '@/lib/utils'

const estadoPagoConfig = {
  pendiente: 'bg-yellow-100 text-yellow-700',
  pagado: 'bg-green-100 text-green-700',
  atrasado: 'bg-red-100 text-red-700',
  cancelado: 'bg-neutral-100 text-neutral-500',
}

interface ClienteDetalleProps {
  cliente: Cliente
  proyectos: Proyecto[]
  ventas: Venta[]
}

export function ClienteDetalle({ cliente, proyectos, ventas }: ClienteDetalleProps) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)

  async function handleEdit(data: ClienteInsert) {
    const res = await fetch(`/api/clientes/${cliente.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error()
    toast.success('Cliente actualizado')
    router.refresh()
  }

  async function handleDelete() {
    if (!confirm('¿Eliminar este cliente?')) return
    await fetch(`/api/clientes/${cliente.id}`, { method: 'DELETE' })
    toast.success('Cliente eliminado')
    router.push('/clientes')
  }

  const totalVentas = ventas
    .filter((v) => v.estado_pago === 'pagado')
    .reduce((sum, v) => sum + (v.monto_usd ?? 0), 0)

  const ventasPendientes = ventas.filter((v) => v.estado_pago === 'pendiente' || v.estado_pago === 'atrasado')

  return (
    <div>
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-800 mb-6">
        <ArrowLeft size={14} /> Volver
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--tx-ink-primary)]">{cliente.nombre_negocio}</h1>
          <span className={cn('inline-block text-xs font-medium px-2 py-0.5 rounded-full mt-1',
            cliente.estado === 'activo' ? 'bg-green-100 text-green-700' :
            cliente.estado === 'pausado' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
          )}>
            {cliente.estado}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil size={13} className="mr-1.5" /> Editar
          </Button>
          <Button variant="outline" size="sm" onClick={handleDelete} className="text-red-600 hover:text-red-700">
            <Trash2 size={13} />
          </Button>
        </div>
      </div>

      {/* Info */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6 text-sm">
        {cliente.nombre_contacto && <span className="text-neutral-600">👤 {cliente.nombre_contacto}</span>}
        {cliente.telefono && <span className="flex items-center gap-1.5 text-neutral-600"><Phone size={13} />{cliente.telefono}</span>}
        {cliente.email && <span className="flex items-center gap-1.5 text-neutral-600"><Mail size={13} />{cliente.email}</span>}
        {cliente.localidad && <span className="flex items-center gap-1.5 text-neutral-600"><MapPin size={13} />{cliente.localidad}</span>}
        {cliente.nicho && <span className="text-neutral-600">Nicho: <strong>{cliente.nicho}</strong></span>}
        {cliente.fecha_cierre && <span className="text-neutral-500">Cierre: {format(new Date(cliente.fecha_cierre), 'd MMM yyyy', { locale: es })}</span>}
      </div>

      {/* Finanzas */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Valor inicial', value: cliente.valor_inicial_usd ? `$${cliente.valor_inicial_usd.toLocaleString()}` : '—' },
          { label: 'Mantención/mes', value: cliente.mantencion_mensual_usd ? `$${cliente.mantencion_mensual_usd}/mes` : '—' },
          { label: 'Total cobrado', value: totalVentas > 0 ? `$${totalVentas.toLocaleString()}` : '—' },
        ].map((item) => (
          <div key={item.label} className="bg-neutral-50 rounded-lg p-3 text-center">
            <p className="text-xs text-neutral-500 mb-1">{item.label}</p>
            <p className="text-sm font-semibold text-neutral-800">{item.value}</p>
          </div>
        ))}
      </div>

      {ventasPendientes.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-6 flex items-center gap-2 text-sm text-yellow-700">
          <DollarSign size={14} />
          {ventasPendientes.length} pago(s) pendiente(s) o atrasado(s)
        </div>
      )}

      {cliente.notas && (
        <div className="bg-neutral-50 rounded-lg p-3 mb-6 text-sm text-neutral-600">{cliente.notas}</div>
      )}

      <Separator className="mb-6" />

      {/* Proyectos */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-neutral-700">Proyectos ({proyectos.length})</h2>
          <Button size="sm" variant="outline" onClick={() => router.push('/proyectos')}>
            <FolderKanban size={13} className="mr-1.5" /> Ver todos
          </Button>
        </div>
        {proyectos.length === 0 ? (
          <p className="text-sm text-neutral-400 py-4 text-center">Sin proyectos</p>
        ) : (
          <div className="space-y-2">
            {proyectos.map((p) => {
              const estadoConf = ESTADOS_PROYECTO.find((e) => e.id === p.estado)
              return (
                <div
                  key={p.id}
                  onClick={() => router.push(`/proyectos/${p.id}`)}
                  className="flex items-center justify-between p-3 rounded-lg border border-neutral-200 hover:bg-neutral-50 cursor-pointer"
                >
                  <div>
                    <p className="text-sm font-medium text-neutral-800">{p.nombre}</p>
                    <p className="text-xs text-neutral-400 capitalize">{p.tipo}</p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: estadoConf?.color }} />
                    {estadoConf?.label}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Separator className="mb-6" />

      {/* Historial de pagos */}
      <div>
        <h2 className="text-sm font-semibold text-neutral-700 mb-3">Historial de pagos ({ventas.length})</h2>
        {ventas.length === 0 ? (
          <p className="text-sm text-neutral-400 py-4 text-center">Sin pagos registrados</p>
        ) : (
          <div className="rounded-lg border border-neutral-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-neutral-600">Tipo</th>
                  <th className="text-left px-3 py-2 font-medium text-neutral-600">Monto</th>
                  <th className="text-left px-3 py-2 font-medium text-neutral-600">Estado</th>
                  <th className="text-left px-3 py-2 font-medium text-neutral-600 hidden md:table-cell">Emisión</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {ventas.map((v) => (
                  <tr key={v.id}>
                    <td className="px-3 py-2 capitalize text-neutral-700">{v.tipo}</td>
                    <td className="px-3 py-2 font-medium text-neutral-800">{v.monto_usd ? `$${v.monto_usd.toLocaleString()}` : '—'}</td>
                    <td className="px-3 py-2">
                      <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', estadoPagoConfig[v.estado_pago])}>
                        {v.estado_pago}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-neutral-500 hidden md:table-cell">
                      {v.fecha_emision ? format(new Date(v.fecha_emision), 'd MMM yyyy', { locale: es }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ClienteForm open={editOpen} onOpenChange={setEditOpen} cliente={cliente} onSubmit={handleEdit} />
    </div>
  )
}
