'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ClienteForm } from './cliente-form'
import type { Cliente, ClienteInsert } from '@/lib/types/cliente'
import { cn } from '@/lib/utils'

const estadoConfig = {
  activo: { label: 'Activo', class: 'bg-green-100 text-green-700' },
  pausado: { label: 'Pausado', class: 'bg-yellow-100 text-yellow-700' },
  cancelado: { label: 'Cancelado', class: 'bg-red-100 text-red-700' },
}

interface ClientesListaProps {
  initialClientes: Cliente[]
}

export function ClientesLista({ initialClientes }: ClientesListaProps) {
  const router = useRouter()
  const [formOpen, setFormOpen] = useState(false)

  async function handleCreate(data: ClienteInsert) {
    const res = await fetch('/api/clientes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error()
    toast.success('Cliente creado')
    router.refresh()
  }

  const hayImpagos = initialClientes.some(
    (c) => c.estado === 'activo' && c.mantencion_mensual_usd && c.mantencion_mensual_usd > 0
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Clientes</h1>
          <p className="text-sm text-neutral-500 mt-0.5">{initialClientes.length} clientes</p>
        </div>
        <Button size="sm" onClick={() => setFormOpen(true)}>
          <Plus size={14} className="mr-1.5" />
          Nuevo cliente
        </Button>
      </div>

      <div className="rounded-lg border border-neutral-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 border-b border-neutral-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-neutral-600">Negocio</th>
              <th className="text-left px-4 py-3 font-medium text-neutral-600 hidden md:table-cell">Contacto</th>
              <th className="text-left px-4 py-3 font-medium text-neutral-600 hidden md:table-cell">Nicho</th>
              <th className="text-left px-4 py-3 font-medium text-neutral-600">Estado</th>
              <th className="text-left px-4 py-3 font-medium text-neutral-600 hidden lg:table-cell">Valor inicial</th>
              <th className="text-left px-4 py-3 font-medium text-neutral-600 hidden lg:table-cell">Mantención/mes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {initialClientes.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-neutral-400">Sin clientes aún</td></tr>
            )}
            {initialClientes.map((c) => (
              <tr
                key={c.id}
                onClick={() => router.push(`/clientes/${c.id}`)}
                className="hover:bg-neutral-50 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3 font-medium text-neutral-800">{c.nombre_negocio}</td>
                <td className="px-4 py-3 text-neutral-500 hidden md:table-cell">{c.nombre_contacto ?? '—'}</td>
                <td className="px-4 py-3 text-neutral-500 hidden md:table-cell">{c.nicho ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', estadoConfig[c.estado].class)}>
                    {estadoConfig[c.estado].label}
                  </span>
                </td>
                <td className="px-4 py-3 text-neutral-500 hidden lg:table-cell">
                  {c.valor_inicial_usd ? `$${c.valor_inicial_usd.toLocaleString()}` : '—'}
                </td>
                <td className="px-4 py-3 text-neutral-500 hidden lg:table-cell">
                  {c.mantencion_mensual_usd ? `$${c.mantencion_mensual_usd}/mes` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ClienteForm open={formOpen} onOpenChange={setFormOpen} onSubmit={handleCreate} />
    </div>
  )
}
