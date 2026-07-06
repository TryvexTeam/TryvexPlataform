'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ClienteForm } from './cliente-form'
import type { Cliente, ClienteInsert } from '@/lib/types/cliente'

const estadoConfig = {
  activo:    { label: 'Activo',    style: { background: 'oklch(72% 0.17 145 / 12%)', color: 'oklch(78% 0.14 145)', border: '1px solid oklch(72% 0.17 145 / 28%)' } },
  pausado:   { label: 'Pausado',   style: { background: 'oklch(74% 0.17 55 / 12%)',  color: 'oklch(80% 0.14 55)',  border: '1px solid oklch(74% 0.17 55 / 28%)' } },
  cancelado: { label: 'Cancelado', style: { background: 'oklch(63% 0.21 22 / 12%)',  color: 'oklch(72% 0.17 22)',  border: '1px solid oklch(63% 0.21 22 / 28%)' } },
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
          <h1 className="text-[22px] font-bold tracking-[-0.02em]" style={{ color: 'var(--tx-ink-primary)' }}>Clientes</h1>
          <p className="text-[13px] mt-0.5" style={{ color: 'var(--tx-ink-muted)' }}>{initialClientes.length} clientes</p>
        </div>
        <Button size="sm" onClick={() => setFormOpen(true)}>
          <Plus size={14} className="mr-1.5" />
          Nuevo cliente
        </Button>
      </div>

      <div
        className="rounded-2xl overflow-hidden"
        style={{ border: '1px solid var(--tx-border)' }}
      >
        <table className="w-full text-[13px]">
          <thead style={{ background: 'oklch(8% 0.003 240)', borderBottom: '1px solid var(--tx-border)' }}>
            <tr>
              <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--tx-ink-muted)' }}>Negocio</th>
              <th className="text-left px-4 py-3 font-medium hidden md:table-cell" style={{ color: 'var(--tx-ink-muted)' }}>Contacto</th>
              <th className="text-left px-4 py-3 font-medium hidden md:table-cell" style={{ color: 'var(--tx-ink-muted)' }}>Nicho</th>
              <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--tx-ink-muted)' }}>Estado</th>
              <th className="text-left px-4 py-3 font-medium hidden lg:table-cell" style={{ color: 'var(--tx-ink-muted)' }}>Valor inicial</th>
              <th className="text-left px-4 py-3 font-medium hidden lg:table-cell" style={{ color: 'var(--tx-ink-muted)' }}>Mantención/mes</th>
            </tr>
          </thead>
          <tbody style={{ background: 'oklch(10% 0.004 240)' }}>
            {initialClientes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center" style={{ color: 'var(--tx-ink-muted)' }}>
                  Sin clientes aún
                </td>
              </tr>
            )}
            {initialClientes.map((c) => (
              <tr
                key={c.id}
                onClick={() => router.push(`/clientes/${c.id}`)}
                className="cursor-pointer transition-colors"
                style={{ borderTop: '1px solid var(--tx-border)' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'oklch(100% 0 0 / 2%)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
              >
                <td className="px-4 py-3 font-semibold" style={{ color: 'var(--tx-ink-primary)' }}>{c.nombre_negocio}</td>
                <td className="px-4 py-3 hidden md:table-cell" style={{ color: 'var(--tx-ink-secondary)' }}>{c.nombre_contacto ?? '—'}</td>
                <td className="px-4 py-3 hidden md:table-cell" style={{ color: 'var(--tx-ink-secondary)' }}>{c.nicho ?? '—'}</td>
                <td className="px-4 py-3">
                  <span
                    className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                    style={estadoConfig[c.estado].style}
                  >
                    {estadoConfig[c.estado].label}
                  </span>
                </td>
                <td className="px-4 py-3 hidden lg:table-cell" style={{ color: 'var(--tx-ink-secondary)' }}>
                  {c.valor_inicial_usd ? `$${c.valor_inicial_usd.toLocaleString()}` : '—'}
                </td>
                <td className="px-4 py-3 hidden lg:table-cell" style={{ color: 'var(--tx-ink-secondary)' }}>
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
