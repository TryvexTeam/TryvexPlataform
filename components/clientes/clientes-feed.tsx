'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  Building2,
  Phone,
  Mail,
  MapPin,
  AlertTriangle,
  TrendingUp,
  ChevronRight,
} from 'lucide-react'
import { nombreCliente, type Cliente } from '@/lib/types/cliente'
import type { Proyecto, Venta } from '@/lib/types/proyecto'

const estadoBadge: Record<string, { label: string; color: string; bg: string; border: string }> = {
  activo:    { label: 'Activo',    color: 'oklch(78% 0.14 145)', bg: 'oklch(72% 0.17 145 / 12%)', border: 'oklch(72% 0.17 145 / 30%)' },
  pausado:   { label: 'Pausado',   color: 'oklch(80% 0.14 55)',  bg: 'oklch(74% 0.17 55 / 12%)',  border: 'oklch(74% 0.17 55 / 30%)' },
  cancelado: { label: 'Cancelado', color: 'oklch(72% 0.17 22)',  bg: 'oklch(63% 0.21 22 / 12%)',  border: 'oklch(63% 0.21 22 / 30%)' },
}

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
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

interface ClientesFeedProps {
  clientes: Cliente[]
  proyectos: Proyecto[]
  ventas: Venta[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export function ClientesFeed({ clientes, proyectos, ventas, selectedId, onSelect }: ClientesFeedProps) {
  const [search, setSearch] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<string>('todos')
  const [filtroNicho, setFiltroNicho] = useState<string>('todos')

  const nichos = useMemo(() => {
    const set = new Set(clientes.map((c) => c.nicho).filter(Boolean) as string[])
    return Array.from(set).sort()
  }, [clientes])

  const filtered = useMemo(() => {
    return clientes.filter((c) => {
      const q = search.toLowerCase()
      const matchQ =
        !q ||
        (c.nombre_negocio ?? '').toLowerCase().includes(q) ||
        (c.nombre_contacto ?? '').toLowerCase().includes(q) ||
        (c.nicho ?? '').toLowerCase().includes(q)
      const matchEstado = filtroEstado === 'todos' || c.estado === filtroEstado
      const matchNicho = filtroNicho === 'todos' || c.nicho === filtroNicho
      return matchQ && matchEstado && matchNicho
    })
  }, [clientes, search, filtroEstado, filtroNicho])

  function getClienteData(clienteId: string) {
    const proy = proyectos.filter((p) => p.cliente_id === clienteId)
    const vents = ventas.filter((v) => v.cliente_id === clienteId)
    const pendientes = vents.filter(
      (v) => v.estado_pago === 'pendiente' || v.estado_pago === 'atrasado'
    )
    const atrasados = vents.some((v) => v.estado_pago === 'atrasado')
    const proyActivos = proy.filter((p) => p.estado !== 'cerrado' && p.estado !== 'entregado')
    return { pendientes, atrasados, proyActivos }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Search + Filters */}
      <div className="flex flex-col gap-2 mb-3">
        {/* Search */}
        <div
          className="flex items-center gap-2 h-9 px-3 rounded-xl"
          style={{
            background: 'oklch(6% 0.003 240)',
            border: '1px solid oklch(100% 0 0 / 8%)',
            boxShadow: 'inset 0 1.5px 3px oklch(0% 0 0 / 60%)',
          }}
        >
          <Search size={14} style={{ color: 'var(--tx-ink-muted)' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente…"
            className="flex-1 bg-transparent outline-none text-[13px]"
            style={{ color: 'var(--tx-ink-primary)' }}
          />
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Estado filter */}
          <div className="flex items-center gap-1">
            {['todos', 'activo', 'pausado', 'cancelado'].map((e) => (
              <button
                key={e}
                onClick={() => setFiltroEstado(e)}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-full transition-all duration-150"
                style={{
                  background:
                    filtroEstado === e
                      ? 'oklch(100% 0 0 / 12%)'
                      : 'oklch(100% 0 0 / 4%)',
                  color:
                    filtroEstado === e
                      ? 'var(--tx-ink-primary)'
                      : 'var(--tx-ink-muted)',
                  border:
                    filtroEstado === e
                      ? '1px solid oklch(100% 0 0 / 18%)'
                      : '1px solid oklch(100% 0 0 / 6%)',
                }}
              >
                {e === 'todos' ? 'Todos' : e.charAt(0).toUpperCase() + e.slice(1)}
              </button>
            ))}
          </div>

          {/* Nicho filter */}
          {nichos.length > 0 && (
            <select
              value={filtroNicho}
              onChange={(e) => setFiltroNicho(e.target.value)}
              className="text-[11px] font-medium px-2.5 py-1 rounded-full outline-none"
              style={{
                background: 'oklch(100% 0 0 / 4%)',
                border: '1px solid oklch(100% 0 0 / 8%)',
                color: 'var(--tx-ink-secondary)',
              }}
            >
              <option value="todos">Todos los nichos</option>
              {nichos.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          )}

          <span
            className="ml-auto text-[11px] font-medium tabular-nums"
            style={{ color: 'var(--tx-ink-muted)' }}
          >
            {filtered.length} de {clientes.length}
          </span>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
        <AnimatePresence initial={false}>
          {filtered.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-16 text-center"
            >
              <Building2 size={32} style={{ color: 'var(--tx-ink-muted)', marginBottom: 12 }} />
              <p className="text-[13px]" style={{ color: 'var(--tx-ink-muted)' }}>
                No hay clientes que coincidan
              </p>
            </motion.div>
          )}

          {filtered.map((c, i) => {
            const badge = estadoBadge[c.estado]
            const color = getColor(nombreCliente(c))
            const isSelected = selectedId === c.id
            const { pendientes, atrasados, proyActivos } = getClienteData(c.id)

            return (
              <motion.button
                key={c.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30, delay: i * 0.02 }}
                onClick={() => onSelect(c.id)}
                className="w-full text-left rounded-[16px] p-3.5 transition-all duration-150 relative overflow-hidden group"
                style={{
                  background: isSelected
                    ? 'linear-gradient(180deg, oklch(100% 0 0 / 8%) 0%, oklch(100% 0 0 / 4%) 100%)'
                    : 'linear-gradient(180deg, oklch(100% 0 0 / 5%) 0%, oklch(100% 0 0 / 2%) 100%)',
                  border: isSelected
                    ? '1px solid oklch(58% 0.24 24.3 / 35%)'
                    : '1px solid oklch(100% 0 0 / 8%)',
                  boxShadow: isSelected
                    ? 'inset 0 1px 0 oklch(100% 0 0 / 15%), 0 8px 24px oklch(58% 0.24 24.3 / 15%)'
                    : 'inset 0 1px 0 oklch(100% 0 0 / 8%)',
                }}
              >
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-[12px] font-bold shrink-0"
                    style={{
                      background: `${color}18`,
                      border: `1px solid ${color}30`,
                      color,
                    }}
                  >
                    {initials(nombreCliente(c))}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span
                        className="text-[13px] font-semibold truncate"
                        style={{ color: 'var(--tx-ink-primary)' }}
                      >
                        {nombreCliente(c)}
                      </span>
                      {atrasados && (
                        <AlertTriangle
                          size={11}
                          style={{ color: 'oklch(72% 0.21 22)', flexShrink: 0 }}
                        />
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {c.nicho && (
                        <span
                          className="text-[10.5px] font-medium"
                          style={{ color: 'var(--tx-ink-muted)' }}
                        >
                          {c.nicho}
                        </span>
                      )}
                      {c.nicho && (c.nombre_negocio || c.localidad) && (
                        <span style={{ color: 'var(--tx-ink-muted)', fontSize: 10 }}>·</span>
                      )}
                      {c.nombre_negocio && (
                        <span
                          className="text-[10.5px]"
                          style={{ color: 'var(--tx-ink-muted)' }}
                        >
                          {c.nombre_negocio}
                        </span>
                      )}
                    </div>

                    {/* Stats row */}
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      {c.mantencion_mensual_usd && c.mantencion_mensual_usd > 0 && (
                        <span
                          className="inline-flex items-center gap-1 text-[10.5px] font-semibold"
                          style={{ color: 'oklch(72% 0.17 145)' }}
                        >
                          <TrendingUp size={10} />
                          ${c.mantencion_mensual_usd}/mes
                        </span>
                      )}
                      {proyActivos.length > 0 && (
                        <span
                          className="text-[10.5px]"
                          style={{ color: 'var(--tx-ink-muted)' }}
                        >
                          {proyActivos.length} proyecto{proyActivos.length !== 1 ? 's' : ''}
                        </span>
                      )}
                      {pendientes.length > 0 && (
                        <span
                          className="text-[10.5px] font-semibold"
                          style={{ color: atrasados ? 'oklch(72% 0.21 22)' : 'oklch(74% 0.17 55)' }}
                        >
                          {pendientes.length} pendiente{pendientes.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Status badge + chevron */}
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{
                        background: badge.bg,
                        color: badge.color,
                        border: `1px solid ${badge.border}`,
                      }}
                    >
                      {badge.label}
                    </span>
                    <ChevronRight
                      size={12}
                      style={{
                        color: isSelected ? 'var(--tx-accent)' : 'var(--tx-ink-muted)',
                        transition: 'color 150ms',
                      }}
                    />
                  </div>
                </div>

                {/* Contact quick info */}
                {(c.telefono || c.email || c.localidad) && (
                  <div
                    className="flex items-center gap-3 mt-2.5 pt-2.5 flex-wrap"
                    style={{ borderTop: '1px solid oklch(100% 0 0 / 5%)' }}
                  >
                    {c.telefono && (
                      <span
                        className="inline-flex items-center gap-1 text-[10.5px]"
                        style={{ color: 'var(--tx-ink-muted)' }}
                      >
                        <Phone size={10} />
                        {c.telefono}
                      </span>
                    )}
                    {c.email && (
                      <span
                        className="inline-flex items-center gap-1 text-[10.5px] truncate"
                        style={{ color: 'var(--tx-ink-muted)' }}
                      >
                        <Mail size={10} />
                        {c.email}
                      </span>
                    )}
                    {c.localidad && (
                      <span
                        className="inline-flex items-center gap-1 text-[10.5px]"
                        style={{ color: 'var(--tx-ink-muted)' }}
                      >
                        <MapPin size={10} />
                        {c.localidad}
                      </span>
                    )}
                  </div>
                )}
              </motion.button>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}
