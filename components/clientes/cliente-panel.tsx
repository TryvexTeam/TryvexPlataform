'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  X,
  Pencil,
  Trash2,
  Phone,
  Mail,
  MapPin,
  Globe,
  FolderKanban,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  TrendingUp,
  Building2,
  Plus,
  Ban,
  RotateCcw,
  Check,
  Maximize2,
} from 'lucide-react'
import { toast } from '@/lib/toast'
import { ClienteForm } from './cliente-form'
import { PagoForm } from './pago-form'
import { ConfirmarDialog } from './confirmar-dialog'
import { ESTADOS_PROYECTO, resumenFinanciero, saldoInicialArrastrado } from '@/lib/types/proyecto'
import { nombreCliente, type Cliente, type ClienteInsert } from '@/lib/types/cliente'
import type { Proyecto, Venta } from '@/lib/types/proyecto'

const estadoPagoConfig: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  pendiente: { label: 'Pendiente', color: 'oklch(80% 0.14 55)',  bg: 'oklch(74% 0.17 55 / 12%)',  icon: Clock },
  pagado:    { label: 'Pagado',    color: 'oklch(78% 0.14 145)', bg: 'oklch(72% 0.17 145 / 12%)', icon: CheckCircle2 },
  atrasado:  { label: 'Atrasado',  color: 'oklch(72% 0.21 22)',  bg: 'oklch(63% 0.21 22 / 12%)',  icon: AlertTriangle },
  cancelado: { label: 'Cancelado', color: 'var(--tx-ink-muted)', bg: 'oklch(100% 0 0 / 4%)',      icon: X },
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
  return name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
}

interface ClientePanelProps {
  cliente: Cliente
  proyectos: Proyecto[]
  ventas: Venta[]
  onClose: () => void
  onUpdate: () => void
}

export function ClientePanel({ cliente, proyectos, ventas, onClose, onUpdate }: ClientePanelProps) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [pagoOpen, setPagoOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'proyectos' | 'pagos'>('overview')
  // Id del pago que se está por descartar; null = diálogo cerrado.
  const [descartarId, setDescartarId] = useState<string | null>(null)
  const [saldoOpen, setSaldoOpen] = useState(false)

  const color = getColor(nombreCliente(cliente))
  const { totalCobrado, porCobrar } = resumenFinanciero(
    ventas,
    cliente.valor_inicial_usd,
    cliente.saldo_inicial_saldado,
  )
  const pendientes = ventas.filter((v) => v.estado_pago === 'pendiente' || v.estado_pago === 'atrasado')

  const saldoArrastrado = saldoInicialArrastrado(
    ventas,
    cliente.valor_inicial_usd,
    cliente.saldo_inicial_saldado,
  )
  const mostrarSaldoInicial = saldoArrastrado > 0 || cliente.saldo_inicial_saldado
  const hayAtrasados = ventas.some((v) => v.estado_pago === 'atrasado')
  const proyActivos = proyectos.filter((p) => p.estado !== 'cerrado' && p.estado !== 'entregado')

  async function handleEdit(data: ClienteInsert) {
    const res = await fetch(`/api/clientes/${cliente.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error()
    toast.success('Cliente actualizado')
    onUpdate()
  }

  async function handleDelete() {
    if (!confirm(`¿Eliminar a ${nombreCliente(cliente)}?`)) return
    await fetch(`/api/clientes/${cliente.id}`, { method: 'DELETE' })
    toast.success('Cliente eliminado')
    onClose()
    router.refresh()
  }

  async function handleMarcarPagado(ventaId: string) {
    const res = await fetch(`/api/pagos/${ventaId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        estado_pago: 'pagado',
        fecha_pago: new Date().toISOString().slice(0, 10),
      }),
    })
    if (!res.ok) { toast.error('Error al actualizar el pago'); return }
    toast.success('Pago marcado como pagado')
    onUpdate()
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
    onUpdate()
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
    onUpdate()
    router.refresh()
  }

  const kpis = [
    { label: 'Total cobrado', value: totalCobrado > 0 ? `$${totalCobrado.toLocaleString()}` : '—', color: 'oklch(72% 0.17 145)' },
    { label: 'Nos debe', value: porCobrar > 0 ? `$${porCobrar.toLocaleString()}` : '—', color: 'oklch(72% 0.21 22)' },
    { label: 'MRR', value: cliente.mantencion_mensual_usd ? `$${cliente.mantencion_mensual_usd}/mes` : '—', color: 'oklch(68% 0.18 230)' },
    { label: 'Valor inicial', value: cliente.valor_inicial_usd ? `$${cliente.valor_inicial_usd.toLocaleString()}` : '—', color: 'oklch(74% 0.17 55)' },
  ]

  const tabs = [
    { id: 'overview' as const, label: 'Resumen' },
    { id: 'proyectos' as const, label: `Proyectos (${proyectos.length})` },
    { id: 'pagos' as const, label: `Pagos (${ventas.length})` },
  ]

  return (
    <>
      <motion.div
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 24 }}
        transition={{ type: 'spring', stiffness: 340, damping: 30 }}
        className="flex flex-col h-full overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, oklch(11% 0.005 240) 0%, oklch(8% 0.003 240) 100%)',
          borderLeft: '1px solid oklch(100% 0 0 / 7%)',
        }}
      >
        {/* Header */}
        <div
          className="shrink-0 px-5 pt-5 pb-4"
          style={{ borderBottom: '1px solid oklch(100% 0 0 / 6%)' }}
        >
          <div className="flex items-start justify-between gap-3 mb-4">
            {/* Avatar + name */}
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center text-[14px] font-bold shrink-0"
                style={{
                  background: `${color}18`,
                  border: `1.5px solid ${color}35`,
                  color,
                  boxShadow: `0 8px 24px ${color}20`,
                }}
              >
                {initials(nombreCliente(cliente))}
              </div>
              <div className="min-w-0">
                <h2
                  className="text-[16px] font-bold tracking-tight truncate"
                  style={{ color: 'var(--tx-ink-primary)' }}
                >
                  {nombreCliente(cliente)}
                </h2>
                {(cliente.nombre_negocio || cliente.nicho) && (
                  <p className="text-[12px] mt-0.5" style={{ color: 'var(--tx-ink-muted)' }}>
                    {[cliente.nombre_negocio, cliente.nicho, cliente.localidad].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
            </div>

            {/* Close + actions */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* La ficha completa existía en /clientes/[id] pero no había forma de
                  llegar desde acá: el panel es angosto a propósito, y el historial
                  entero no entra en 380px. */}
              <motion.button
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                onClick={() => router.push(`/clientes/${cliente.id}`)}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                style={{
                  background: 'oklch(100% 0 0 / 5%)',
                  border: '1px solid oklch(100% 0 0 / 8%)',
                  color: 'var(--tx-ink-primary)',
                }}
                title="Ver ficha completa"
                aria-label="Ver ficha completa"
              >
                <Maximize2 size={12} />
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                onClick={() => setEditOpen(true)}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                style={{
                  background: 'oklch(100% 0 0 / 5%)',
                  border: '1px solid oklch(100% 0 0 / 8%)',
                  color: 'var(--tx-ink-primary)',
                }}
                title="Editar"
              >
                <Pencil size={12} />
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                onClick={handleDelete}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                style={{
                  background: 'oklch(63% 0.21 22 / 8%)',
                  border: '1px solid oklch(63% 0.21 22 / 20%)',
                  color: 'oklch(72% 0.21 22)',
                }}
                title="Eliminar"
              >
                <Trash2 size={12} />
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                onClick={onClose}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                style={{
                  background: 'oklch(100% 0 0 / 5%)',
                  border: '1px solid oklch(100% 0 0 / 8%)',
                  color: 'var(--tx-ink-muted)',
                }}
              >
                <X size={12} />
              </motion.button>
            </div>
          </div>

          {/* Status + alert */}
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
              style={{
                background:
                  cliente.estado === 'activo'
                    ? 'oklch(72% 0.17 145 / 12%)'
                    : cliente.estado === 'pausado'
                    ? 'oklch(74% 0.17 55 / 12%)'
                    : 'oklch(63% 0.21 22 / 12%)',
                color:
                  cliente.estado === 'activo'
                    ? 'oklch(78% 0.14 145)'
                    : cliente.estado === 'pausado'
                    ? 'oklch(80% 0.14 55)'
                    : 'oklch(72% 0.17 22)',
                border:
                  cliente.estado === 'activo'
                    ? '1px solid oklch(72% 0.17 145 / 30%)'
                    : cliente.estado === 'pausado'
                    ? '1px solid oklch(74% 0.17 55 / 30%)'
                    : '1px solid oklch(63% 0.21 22 / 30%)',
              }}
            >
              {cliente.estado.charAt(0).toUpperCase() + cliente.estado.slice(1)}
            </span>

            {hayAtrasados && (
              <span
                className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full"
                style={{
                  background: 'oklch(63% 0.21 22 / 12%)',
                  border: '1px solid oklch(63% 0.21 22 / 30%)',
                  color: 'oklch(72% 0.21 22)',
                }}
              >
                <AlertTriangle size={10} />
                Pagos atrasados
              </span>
            )}

            {proyActivos.length > 0 && (
              <span
                className="text-[11px] font-medium px-2.5 py-1 rounded-full"
                style={{
                  background: 'oklch(100% 0 0 / 5%)',
                  border: '1px solid oklch(100% 0 0 / 10%)',
                  color: 'var(--tx-ink-secondary)',
                }}
              >
                {proyActivos.length} proyecto{proyActivos.length !== 1 ? 's' : ''} activo{proyActivos.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {/* KPI Strip */}
        <div
          className="shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-px"
          style={{ background: 'oklch(100% 0 0 / 5%)', borderBottom: '1px solid oklch(100% 0 0 / 6%)' }}
        >
          {kpis.map((k) => (
            <div
              key={k.label}
              className="px-4 py-3 flex flex-col gap-0.5"
              style={{ background: 'oklch(10% 0.004 240)' }}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--tx-ink-muted)' }}>
                {k.label}
              </p>
              <p className="text-[14px] font-bold tabular-nums" style={{ color: k.value === '—' ? 'var(--tx-ink-muted)' : k.color }}>
                {k.value}
              </p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div
          className="shrink-0 flex gap-1 px-4 pt-3 pb-0"
          style={{ borderBottom: '1px solid oklch(100% 0 0 / 6%)' }}
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className="pb-3 px-1 text-[12px] font-semibold transition-colors relative"
              style={{
                color: activeTab === t.id ? 'var(--tx-ink-primary)' : 'var(--tx-ink-muted)',
              }}
            >
              {t.label}
              {activeTab === t.id && (
                <motion.div
                  layoutId="cliente-panel-tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full"
                  style={{ background: 'var(--tx-accent)' }}
                />
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            {activeTab === 'overview' && (
              <motion.div
                key="overview"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
                className="p-5 space-y-5"
              >
                {/* Contact info */}
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--tx-ink-muted)' }}>
                    Contacto
                  </p>
                  <div className="space-y-2">
                    {cliente.nombre_contacto && (
                      <div className="flex items-center gap-2.5">
                        <Building2 size={13} style={{ color: 'var(--tx-ink-muted)', flexShrink: 0 }} />
                        <span className="text-[13px]" style={{ color: 'var(--tx-ink-primary)' }}>
                          {cliente.nombre_contacto}
                        </span>
                      </div>
                    )}
                    {cliente.telefono && (
                      <a
                        href={`tel:${cliente.telefono}`}
                        className="flex items-center gap-2.5 group"
                      >
                        <Phone size={13} style={{ color: 'var(--tx-ink-muted)', flexShrink: 0 }} />
                        <span
                          className="text-[13px] group-hover:underline"
                          style={{ color: 'oklch(68% 0.18 230)' }}
                        >
                          {cliente.telefono}
                        </span>
                      </a>
                    )}
                    {cliente.email && (
                      <a
                        href={`mailto:${cliente.email}`}
                        className="flex items-center gap-2.5 group"
                      >
                        <Mail size={13} style={{ color: 'var(--tx-ink-muted)', flexShrink: 0 }} />
                        <span
                          className="text-[13px] truncate group-hover:underline"
                          style={{ color: 'oklch(68% 0.18 230)' }}
                        >
                          {cliente.email}
                        </span>
                        <ExternalLink size={10} style={{ color: 'var(--tx-ink-muted)', marginLeft: 'auto', flexShrink: 0 }} />
                      </a>
                    )}
                    {cliente.localidad && (
                      <div className="flex items-center gap-2.5">
                        <MapPin size={13} style={{ color: 'var(--tx-ink-muted)', flexShrink: 0 }} />
                        <span className="text-[13px]" style={{ color: 'var(--tx-ink-secondary)' }}>
                          {cliente.localidad}
                        </span>
                      </div>
                    )}
                    {cliente.redes_sociales && Object.entries(cliente.redes_sociales).map(([red, url]) => (
                      <a
                        key={red}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2.5 group"
                      >
                        <Globe size={13} style={{ color: 'var(--tx-ink-muted)', flexShrink: 0 }} />
                        <span className="text-[13px] group-hover:underline" style={{ color: 'oklch(68% 0.18 230)' }}>
                          {red}
                        </span>
                        <ExternalLink size={10} style={{ color: 'var(--tx-ink-muted)', marginLeft: 'auto', flexShrink: 0 }} />
                      </a>
                    ))}
                  </div>
                </div>

                {/* Cierre */}
                {cliente.fecha_cierre && (
                  <div
                    className="rounded-xl p-3 flex items-center gap-3"
                    style={{
                      background: 'oklch(100% 0 0 / 3%)',
                      border: '1px solid oklch(100% 0 0 / 7%)',
                    }}
                  >
                    <TrendingUp size={14} style={{ color: 'oklch(72% 0.17 145)', flexShrink: 0 }} />
                    <div>
                      <p className="text-[11px]" style={{ color: 'var(--tx-ink-muted)' }}>Fecha de cierre</p>
                      <p className="text-[13px] font-semibold" style={{ color: 'var(--tx-ink-primary)' }}>
                        {format(new Date(cliente.fecha_cierre), "d 'de' MMMM yyyy", { locale: es })}
                      </p>
                    </div>
                  </div>
                )}

                {/* Notas */}
                {cliente.notas && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--tx-ink-muted)' }}>
                      Notas
                    </p>
                    <div
                      className="rounded-xl p-3 text-[13px] leading-relaxed"
                      style={{
                        background: 'oklch(100% 0 0 / 3%)',
                        border: '1px solid oklch(100% 0 0 / 7%)',
                        color: 'var(--tx-ink-secondary)',
                      }}
                    >
                      {cliente.notas}
                    </div>
                  </div>
                )}

                {/* Pending payments alert */}
                {pendientes.length > 0 && (
                  <div
                    className="rounded-xl p-3.5 flex items-start gap-3"
                    style={{
                      background: hayAtrasados ? 'oklch(63% 0.21 22 / 8%)' : 'oklch(74% 0.17 55 / 8%)',
                      border: hayAtrasados
                        ? '1px solid oklch(63% 0.21 22 / 25%)'
                        : '1px solid oklch(74% 0.17 55 / 25%)',
                    }}
                  >
                    <DollarSign
                      size={14}
                      style={{
                        color: hayAtrasados ? 'oklch(72% 0.21 22)' : 'oklch(80% 0.14 55)',
                        flexShrink: 0,
                        marginTop: 1,
                      }}
                    />
                    <div>
                      <p
                        className="text-[12px] font-semibold"
                        style={{ color: hayAtrasados ? 'oklch(72% 0.21 22)' : 'oklch(80% 0.14 55)' }}
                      >
                        {pendientes.length} pago{pendientes.length !== 1 ? 's' : ''}{' '}
                        {hayAtrasados ? 'atrasado' : 'pendiente'}{pendientes.length !== 1 ? 's' : ''}
                      </p>
                      <p className="text-[11px] mt-0.5" style={{ color: 'var(--tx-ink-muted)' }}>
                        Total: ${pendientes.reduce((s, v) => s + (v.monto_usd ?? 0), 0).toLocaleString()}
                      </p>
                    </div>
                  </div>
                )}

                {/* Saldo inicial arrastrado: sin este interruptor el aviso de "nos debe"
                    no se apaga nunca aunque se anulen todos los pagos pendientes. */}
                {mostrarSaldoInicial && (
                  <div
                    className="rounded-xl p-3.5 space-y-2.5"
                    style={{
                      background: 'oklch(100% 0 0 / 3%)',
                      border: '1px solid oklch(100% 0 0 / 7%)',
                    }}
                  >
                    <div>
                      <p className="text-[12px] font-semibold" style={{ color: 'var(--tx-ink-primary)' }}>
                        Saldo del valor inicial
                      </p>
                      <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: 'var(--tx-ink-muted)' }}>
                        {cliente.saldo_inicial_saldado
                          ? `Dado por saldado. El valor acordado ($${(cliente.valor_inicial_usd ?? 0).toLocaleString()}) se conserva para reportes.`
                          : `Quedan $${saldoArrastrado.toLocaleString()} del valor acordado sin cobrar.`}
                      </p>
                    </div>
                    <button
                      onClick={() => setSaldoOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors"
                      style={{
                        background: 'oklch(100% 0 0 / 5%)',
                        border: '1px solid oklch(100% 0 0 / 12%)',
                        color: 'var(--tx-ink-secondary)',
                      }}
                    >
                      {cliente.saldo_inicial_saldado ? (
                        <><RotateCcw size={11} /> Reactivar saldo pendiente</>
                      ) : (
                        <><Check size={11} /> Dar por saldado</>
                      )}
                    </button>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'proyectos' && (
              <motion.div
                key="proyectos"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
                className="p-5 space-y-2"
              >
                {proyectos.length === 0 ? (
                  <div className="text-center py-12">
                    <FolderKanban size={28} style={{ color: 'var(--tx-ink-muted)', margin: '0 auto 10px' }} />
                    <p className="text-[13px]" style={{ color: 'var(--tx-ink-muted)' }}>Sin proyectos</p>
                  </div>
                ) : (
                  proyectos.map((p, i) => {
                    const estadoConf = ESTADOS_PROYECTO.find((e) => e.id === p.estado)
                    return (
                      <motion.div
                        key={p.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className="rounded-xl p-3.5 flex items-center gap-3 cursor-pointer group"
                        style={{
                          background: 'oklch(100% 0 0 / 4%)',
                          border: '1px solid oklch(100% 0 0 / 8%)',
                          transition: 'background 150ms, border-color 150ms',
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            window.open(`/proyectos/${p.id}`, '_blank')
                          }
                        }}
                        onClick={() => window.open(`/proyectos/${p.id}`, '_blank')}
                        onMouseEnter={(e) => {
                          const el = e.currentTarget as HTMLElement
                          el.style.background = 'oklch(100% 0 0 / 7%)'
                          el.style.borderColor = 'oklch(100% 0 0 / 14%)'
                        }}
                        onMouseLeave={(e) => {
                          const el = e.currentTarget as HTMLElement
                          el.style.background = 'oklch(100% 0 0 / 4%)'
                          el.style.borderColor = 'oklch(100% 0 0 / 8%)'
                        }}
                      >
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: estadoConf?.color ?? 'var(--tx-ink-muted)' }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--tx-ink-primary)' }}>
                            {p.nombre}
                          </p>
                          <p className="text-[11px] mt-0.5" style={{ color: 'var(--tx-ink-muted)' }}>
                            {p.tipo} · {estadoConf?.label ?? p.estado}
                            {p.fecha_entrega && ` · ${format(new Date(p.fecha_entrega), 'd MMM yyyy', { locale: es })}`}
                          </p>
                        </div>
                        <ExternalLink
                          size={12}
                          style={{ color: 'var(--tx-ink-muted)', flexShrink: 0, opacity: 0, transition: 'opacity 150ms' }}
                          className="group-hover:opacity-100"
                        />
                      </motion.div>
                    )
                  })
                )}
              </motion.div>
            )}

            {activeTab === 'pagos' && (
              <motion.div
                key="pagos"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
                className="p-5 space-y-2"
              >
                <button
                  onClick={() => setPagoOpen(true)}
                  className="w-full flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12.5px] font-semibold transition-colors"
                  style={{
                    background: 'oklch(58% 0.24 24.3 / 15%)',
                    border: '1px solid oklch(58% 0.24 24.3 / 35%)',
                    color: 'oklch(78% 0.14 24.3)',
                  }}
                >
                  <Plus size={14} /> Registrar pago
                </button>
                {ventas.length === 0 ? (
                  <div className="text-center py-12">
                    <DollarSign size={28} style={{ color: 'var(--tx-ink-muted)', margin: '0 auto 10px' }} />
                    <p className="text-[13px]" style={{ color: 'var(--tx-ink-muted)' }}>Sin pagos registrados</p>
                    <p className="text-[11.5px] mt-1" style={{ color: 'var(--tx-ink-muted)' }}>
                      Registra un pago pendiente para ver cuánto te debe
                    </p>
                  </div>
                ) : (
                  ventas.map((v, i) => {
                    const conf = estadoPagoConfig[v.estado_pago]
                    const StatusIcon = conf.icon
                    return (
                      <motion.div
                        key={v.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className="rounded-xl p-3.5 flex items-center gap-3"
                        style={{
                          background: 'oklch(100% 0 0 / 4%)',
                          border: '1px solid oklch(100% 0 0 / 8%)',
                          // Los cancelados no se esconden: se descartan, no se borran.
                          opacity: v.estado_pago === 'cancelado' ? 0.55 : 1,
                        }}
                      >
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: conf.bg, color: conf.color }}
                        >
                          <StatusIcon size={12} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-[12px] font-semibold capitalize"
                            style={{
                              color: 'var(--tx-ink-primary)',
                              textDecoration: v.estado_pago === 'cancelado' ? 'line-through' : undefined,
                            }}
                          >
                            {v.tipo}
                            {v.fecha_emision && (
                              <span className="font-normal ml-2" style={{ color: 'var(--tx-ink-muted)' }}>
                                {format(new Date(v.fecha_emision), 'd MMM yyyy', { locale: es })}
                              </span>
                            )}
                          </p>
                          <p className="text-[11px] mt-0.5" style={{ color: conf.color }}>
                            {conf.label}
                            {v.metodo_pago && ` · ${v.metodo_pago}`}
                          </p>
                        </div>
                        <p
                          className="text-[14px] font-bold tabular-nums shrink-0"
                          style={{
                            color: 'var(--tx-ink-primary)',
                            textDecoration: v.estado_pago === 'cancelado' ? 'line-through' : undefined,
                          }}
                        >
                          {v.monto_usd ? `$${v.monto_usd.toLocaleString()}` : '—'}
                        </p>
                        {(v.estado_pago === 'pendiente' || v.estado_pago === 'atrasado') && (
                          <button
                            onClick={() => setDescartarId(v.id)}
                            title="Descartar este pago"
                            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors"
                            style={{
                              background: 'oklch(63% 0.21 22 / 8%)',
                              border: '1px solid oklch(63% 0.21 22 / 20%)',
                              color: 'oklch(72% 0.21 22)',
                            }}
                          >
                            <Ban size={12} />
                          </button>
                        )}
                      </motion.div>
                    )
                  })
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

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

      <ClienteForm
        open={editOpen}
        onOpenChange={setEditOpen}
        cliente={cliente}
        onSubmit={handleEdit}
      />
      <PagoForm
        open={pagoOpen}
        onOpenChange={setPagoOpen}
        clienteId={cliente.id}
        proyectos={proyectos}
        onCreated={onUpdate}
        ventasPendientes={pendientes}
        onMarcarPagada={handleMarcarPagado}
      />
    </>
  )
}
