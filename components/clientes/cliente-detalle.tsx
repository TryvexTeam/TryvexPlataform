'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import Link from 'next/link'
import { ArrowLeft, Pencil, Trash2, Phone, Mail, MapPin, Plus, FolderKanban, Check, BookOpen, Ban, RotateCcw } from 'lucide-react'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ClienteForm } from './cliente-form'
import { PagoForm } from './pago-form'
import { ConfirmarDialog } from './confirmar-dialog'
import { nombreCliente, type Cliente, type ClienteInsert } from '@/lib/types/cliente'
import type { Proyecto, Venta } from '@/lib/types/proyecto'
import { ESTADOS_PROYECTO, resumenFinanciero } from '@/lib/types/proyecto'
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
  const [pagoOpen, setPagoOpen] = useState(false)
  // Id del pago que se está por descartar; null = diálogo cerrado.
  const [descartarId, setDescartarId] = useState<string | null>(null)
  const [saldoOpen, setSaldoOpen] = useState(false)

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

  async function handleMarcarPagado(ventaId: string) {
    const res = await fetch(`/api/pagos/${ventaId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado_pago: 'pagado', fecha_pago: new Date().toISOString().slice(0, 10) }),
    })
    if (!res.ok) { toast.error('Error al actualizar el pago'); return }
    toast.success('Pago marcado como pagado')
    router.refresh()
  }

  /** Descartar no borra: el pago queda 'cancelado' y visible tachado, para dejar rastro. */
  async function handleDescartar(ventaId: string) {
    const res = await fetch(`/api/pagos/${ventaId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado_pago: 'cancelado' }),
    })
    if (!res.ok) { toast.error('No se pudo descartar el pago'); return }
    toast.success('Pago descartado')
    router.refresh()
  }

  async function handleSaldoInicial(saldado: boolean) {
    const res = await fetch(`/api/clientes/${cliente.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ saldo_inicial_saldado: saldado }),
    })
    if (!res.ok) { toast.error('No se pudo actualizar el saldo'); return }
    toast.success(saldado ? 'Saldo inicial dado por saldado' : 'Saldo inicial reactivado')
    router.refresh()
  }

  const { totalCobrado, porCobrar, proximoCobro } = resumenFinanciero(
    ventas,
    cliente.valor_inicial_usd,
    cliente.saldo_inicial_saldado,
  )

  // Saldo del valor inicial que aún se arrastra: lo acordado menos lo cobrado como inicial.
  const cobradoInicial = ventas
    .filter((v) => v.tipo === 'inicial' && v.estado_pago === 'pagado')
    .reduce((s, v) => s + (v.monto_usd ?? 0), 0)
  const saldoArrastrado = Math.max(0, (cliente.valor_inicial_usd ?? 0) - cobradoInicial)
  const mostrarSaldoInicial = saldoArrastrado > 0 || cliente.saldo_inicial_saldado

  return (
    <div>
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-800 mb-6">
        <ArrowLeft size={14} /> Volver
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--tx-ink-primary)]">{nombreCliente(cliente)}</h1>
          {(cliente.nombre_negocio || cliente.nicho) && (
            <p className="text-sm text-neutral-500">
              {[cliente.nombre_negocio, cliente.nicho].filter(Boolean).join(' · ')}
            </p>
          )}
          <span className={cn('inline-block text-xs font-medium px-2 py-0.5 rounded-full mt-1',
            cliente.estado === 'activo' ? 'bg-green-100 text-green-700' :
            cliente.estado === 'pausado' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
          )}>
            {cliente.estado}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" render={<Link href={`/cerebro?entidad_tipo=cliente&entidad_id=${cliente.id}`} />}>
            <BookOpen size={13} className="mr-1.5" /> Bitácora
          </Button>
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
        {cliente.telefono && <span className="flex items-center gap-1.5 text-neutral-600"><Phone size={13} />{cliente.telefono}</span>}
        {cliente.email && <span className="flex items-center gap-1.5 text-neutral-600"><Mail size={13} />{cliente.email}</span>}
        {cliente.localidad && <span className="flex items-center gap-1.5 text-neutral-600"><MapPin size={13} />{cliente.localidad}</span>}
        {cliente.fecha_cierre && <span className="text-neutral-500">Cierre: {format(new Date(cliente.fecha_cierre), 'd MMM yyyy', { locale: es })}</span>}
      </div>

      {/* Finanzas */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {[
          { label: 'Total cobrado', value: totalCobrado > 0 ? `$${totalCobrado.toLocaleString()}` : '—' },
          { label: 'Nos debe', value: porCobrar > 0 ? `$${porCobrar.toLocaleString()}` : '—', alerta: porCobrar > 0 },
          { label: 'Próximo cobro', value: proximoCobro ? format(new Date(proximoCobro), 'd MMM', { locale: es }) : '—' },
          { label: 'MRR', value: cliente.mantencion_mensual_usd ? `$${cliente.mantencion_mensual_usd}/mes` : '—' },
          { label: 'Valor inicial', value: cliente.valor_inicial_usd ? `$${cliente.valor_inicial_usd.toLocaleString()}` : '—' },
        ].map((item) => (
          <div key={item.label} className={cn('rounded-lg p-3 text-center', item.alerta ? 'bg-red-50' : 'bg-neutral-50')}>
            <p className="text-xs text-neutral-500 mb-1">{item.label}</p>
            <p className={cn('text-sm font-semibold', item.alerta ? 'text-red-600' : 'text-neutral-800')}>{item.value}</p>
          </div>
        ))}
      </div>

      {/* Saldo inicial arrastrado: sin este interruptor el aviso de "nos debe" no se
          apaga nunca aunque se anulen todos los pagos pendientes. */}
      {mostrarSaldoInicial && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 p-3">
          <div className="text-sm">
            <p className="font-medium text-neutral-800">Saldo del valor inicial</p>
            <p className="text-xs text-neutral-500">
              {cliente.saldo_inicial_saldado
                ? `Dado por saldado. El valor acordado ($${(cliente.valor_inicial_usd ?? 0).toLocaleString()}) se conserva para reportes.`
                : `Quedan $${saldoArrastrado.toLocaleString()} del valor acordado sin cobrar.`}
            </p>
          </div>
          {cliente.saldo_inicial_saldado ? (
            <Button size="sm" variant="outline" onClick={() => setSaldoOpen(true)}>
              <RotateCcw size={13} className="mr-1.5" /> Reactivar saldo pendiente
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setSaldoOpen(true)}>
              <Check size={13} className="mr-1.5" /> Dar por saldado
            </Button>
          )}
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
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-neutral-700">Pagos ({ventas.length})</h2>
          <Button size="sm" onClick={() => setPagoOpen(true)}>
            <Plus size={13} className="mr-1.5" /> Registrar pago
          </Button>
        </div>
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
                  <th className="text-left px-3 py-2 font-medium text-neutral-600 hidden md:table-cell">Cobro</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {ventas.map((v) => (
                  // Los cancelados no se esconden: se descartan, no se borran.
                  <tr key={v.id} className={cn(v.estado_pago === 'cancelado' && 'opacity-60 line-through')}>
                    <td className="px-3 py-2 capitalize text-neutral-700">
                      {v.tipo}
                      {v.descripcion && <span className="block text-xs text-neutral-400 normal-case">{v.descripcion}</span>}
                    </td>
                    <td className="px-3 py-2 font-medium text-neutral-800">{v.monto_usd ? `$${v.monto_usd.toLocaleString()}` : '—'}</td>
                    <td className="px-3 py-2">
                      <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', estadoPagoConfig[v.estado_pago])}>
                        {v.estado_pago}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-neutral-500 hidden md:table-cell">
                      {(v.fecha_vencimiento ?? v.fecha_emision)
                        ? format(new Date((v.fecha_vencimiento ?? v.fecha_emision)!), 'd MMM yyyy', { locale: es })
                        : '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {(v.estado_pago === 'pendiente' || v.estado_pago === 'atrasado') && (
                        <span className="inline-flex gap-1.5 no-underline">
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => handleMarcarPagado(v.id)}>
                            <Check size={12} className="mr-1" /> Pagado
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs text-red-600 hover:text-red-700"
                            onClick={() => setDescartarId(v.id)}
                          >
                            <Ban size={12} className="mr-1" /> Descartar
                          </Button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmarDialog
        open={descartarId !== null}
        onOpenChange={(o) => !o && setDescartarId(null)}
        titulo="¿Descartar este pago?"
        descripcion="Queda registrado como cancelado y deja de contar en lo que el cliente debe. No se borra: seguirá visible tachado en el historial."
        confirmar="Descartar"
        destructivo
        onConfirmar={async () => { if (descartarId) await handleDescartar(descartarId) }}
      />

      <ConfirmarDialog
        open={saldoOpen}
        onOpenChange={setSaldoOpen}
        titulo={cliente.saldo_inicial_saldado ? '¿Reactivar el saldo pendiente?' : '¿Dar por saldado el valor inicial?'}
        descripcion={
          cliente.saldo_inicial_saldado
            ? 'El saldo del valor inicial vuelve a contar como monto por cobrar.'
            : 'El saldo deja de contar como monto por cobrar. El valor acordado no se borra y sigue disponible para reportes.'
        }
        confirmar={cliente.saldo_inicial_saldado ? 'Reactivar' : 'Dar por saldado'}
        onConfirmar={() => handleSaldoInicial(!cliente.saldo_inicial_saldado)}
      />

      <ClienteForm open={editOpen} onOpenChange={setEditOpen} cliente={cliente} onSubmit={handleEdit} />
      <PagoForm
        open={pagoOpen}
        onOpenChange={setPagoOpen}
        clienteId={cliente.id}
        proyectos={proyectos}
        onCreated={() => router.refresh()}
        ventasPendientes={ventas.filter(
          (v) => v.estado_pago === 'pendiente' || v.estado_pago === 'atrasado'
        )}
        onMarcarPagada={handleMarcarPagado}
      />
    </div>
  )
}
