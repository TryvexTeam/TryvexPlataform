'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { toast } from '@/lib/toast'
import { KanbanBoard, type KanbanColumn } from '@/components/shared/kanban-board'
import { AlertTriangle, TrendingUp, FolderKanban } from 'lucide-react'
import { nombreCliente, type Cliente } from '@/lib/types/cliente'
import type { Proyecto, Venta } from '@/lib/types/proyecto'

const pipelineColumns: { id: string; title: string; color: string; estados: string[] }[] = [
  { id: 'activo',    title: 'Activos',    color: 'oklch(72% 0.17 145)', estados: ['activo'] },
  { id: 'pausado',   title: 'Pausados',   color: 'oklch(74% 0.17 55)',  estados: ['pausado'] },
  { id: 'cancelado', title: 'Cancelados', color: 'oklch(63% 0.21 22)',  estados: ['cancelado'] },
]

const nichoColors = [
  'oklch(68% 0.18 230)',
  'oklch(72% 0.17 145)',
  'oklch(74% 0.17 55)',
  'oklch(72% 0.2 310)',
  'oklch(70% 0.18 180)',
]

function getColor(str: string) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h)
  return nichoColors[Math.abs(h) % nichoColors.length]
}

function initials(name: string) {
  return name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
}

function ClienteKanbanCard({
  cliente,
  proyectos,
  ventas,
  onSelect,
  isSelected,
  isDragging,
}: {
  cliente: Cliente
  proyectos: Proyecto[]
  ventas: Venta[]
  onSelect: (id: string) => void
  isSelected: boolean
  isDragging?: boolean
}) {
  const color = getColor(nombreCliente(cliente))
  const proy = proyectos.filter((p) => p.cliente_id === cliente.id && p.estado !== 'cerrado')
  const vents = ventas.filter((v) => v.cliente_id === cliente.id)
  const atrasados = vents.some((v) => v.estado_pago === 'atrasado')
  const pendientes = vents.filter((v) => v.estado_pago === 'pendiente' || v.estado_pago === 'atrasado')

  return (
    <div
      onClick={() => !isDragging && onSelect(cliente.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !isDragging) {
          e.preventDefault()
          onSelect(cliente.id)
        }
      }}
      className="rounded-[14px] p-3 cursor-pointer select-none"
      style={{
        background: isSelected
          ? 'linear-gradient(180deg, oklch(100% 0 0 / 9%) 0%, oklch(100% 0 0 / 5%) 100%)'
          : 'linear-gradient(180deg, oklch(100% 0 0 / 6%) 0%, oklch(100% 0 0 / 3%) 100%)',
        border: isSelected
          ? '1px solid oklch(58% 0.24 24.3 / 40%)'
          : '1px solid oklch(100% 0 0 / 8%)',
        boxShadow: isSelected
          ? 'inset 0 1px 0 oklch(100% 0 0 / 14%), 0 6px 20px oklch(58% 0.24 24.3 / 14%)'
          : 'inset 0 1px 0 oklch(100% 0 0 / 8%), 0 4px 12px oklch(0% 0 0 / 30%)',
        opacity: isDragging ? 0.5 : 1,
        transition: 'border-color 150ms, background 150ms, box-shadow 150ms',
      }}
    >
      <div className="flex items-center gap-2.5 mb-2">
        {/* Avatar */}
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-bold shrink-0"
          style={{
            background: `${color}18`,
            border: `1px solid ${color}30`,
            color,
          }}
        >
          {initials(nombreCliente(cliente))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p
              className="text-[12px] font-semibold truncate"
              style={{ color: 'var(--tx-ink-primary)' }}
            >
              {nombreCliente(cliente)}
            </p>
            {atrasados && <AlertTriangle size={10} style={{ color: 'oklch(72% 0.21 22)', flexShrink: 0 }} />}
          </div>
          {cliente.nicho && (
            <p className="text-[10.5px]" style={{ color: 'var(--tx-ink-muted)' }}>
              {cliente.nicho}
            </p>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-2 flex-wrap">
        {cliente.mantencion_mensual_usd && cliente.mantencion_mensual_usd > 0 && (
          <span
            className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
            style={{
              background: 'oklch(72% 0.17 145 / 12%)',
              color: 'oklch(72% 0.17 145)',
              border: '1px solid oklch(72% 0.17 145 / 20%)',
            }}
          >
            <TrendingUp size={9} />
            ${cliente.mantencion_mensual_usd}/mes
          </span>
        )}
        {proy.length > 0 && (
          <span
            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full"
            style={{
              background: 'oklch(100% 0 0 / 5%)',
              color: 'var(--tx-ink-muted)',
              border: '1px solid oklch(100% 0 0 / 8%)',
            }}
          >
            <FolderKanban size={9} />
            {proy.length}
          </span>
        )}
        {pendientes.length > 0 && (
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
            style={{
              background: atrasados ? 'oklch(63% 0.21 22 / 12%)' : 'oklch(74% 0.17 55 / 12%)',
              color: atrasados ? 'oklch(72% 0.21 22)' : 'oklch(80% 0.14 55)',
              border: atrasados ? '1px solid oklch(63% 0.21 22 / 25%)' : '1px solid oklch(74% 0.17 55 / 25%)',
            }}
          >
            {pendientes.length}p
          </span>
        )}
      </div>
    </div>
  )
}

interface ClientesPipelineProps {
  clientes: Cliente[]
  proyectos: Proyecto[]
  ventas: Venta[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export function ClientesPipeline({
  clientes,
  proyectos,
  ventas,
  selectedId,
  onSelect,
}: ClientesPipelineProps) {
  const router = useRouter()
  const [localClientes, setLocalClientes] = useState(clientes)

  const columns: KanbanColumn<Cliente>[] = pipelineColumns.map((col) => ({
    id: col.id,
    title: col.title,
    color: col.color,
    items: localClientes.filter((c) => col.estados.includes(c.estado)),
  }))

  const handleDragEnd = useCallback(
    async (itemId: string, _fromCol: string, toCol: string) => {
      const nuevoEstado = toCol as 'activo' | 'pausado' | 'cancelado'
      setLocalClientes((prev) =>
        prev.map((c) => (c.id === itemId ? { ...c, estado: nuevoEstado } : c))
      )
      try {
        const res = await fetch(`/api/clientes/${itemId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ estado: nuevoEstado }),
        })
        if (!res.ok) throw new Error()
        toast.success('Estado actualizado')
        router.refresh()
      } catch {
        toast.error('Error al actualizar el estado')
        setLocalClientes(clientes) // revert
      }
    },
    [clientes, router]
  )

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="pipeline"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="h-full"
      >
        <KanbanBoard
          columns={columns}
          renderCard={(cliente, isDragging) => (
            <ClienteKanbanCard
              cliente={cliente}
              proyectos={proyectos}
              ventas={ventas}
              onSelect={onSelect}
              isSelected={selectedId === cliente.id}
              isDragging={isDragging}
            />
          )}
          onDragEnd={handleDragEnd}
        />
      </motion.div>
    </AnimatePresence>
  )
}
