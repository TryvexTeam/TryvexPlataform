'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { toast } from '@/lib/toast'
import { Plus, LayoutList, Kanban, X } from 'lucide-react'
import { ClienteForm } from './cliente-form'
import { ClientesFeed } from './clientes-feed'
import { ClientesPipeline } from './clientes-pipeline'
import { ClientePanel } from './cliente-panel'
import { RevenueHeader } from './revenue-header'
import type { Cliente, ClienteInsert } from '@/lib/types/cliente'
import type { Proyecto, Venta } from '@/lib/types/proyecto'
import { useDatosVivos } from '@/lib/hooks/use-datos-vivos'

type View = 'lista' | 'pipeline'

interface ClientesWorkspaceProps {
  clientes: Cliente[]
  proyectos: Proyecto[]
  ventas: Venta[]
}

export function ClientesWorkspace({ clientes, proyectos, ventas }: ClientesWorkspaceProps) {
  // Mantiene clientes al día sin recargar.
  useDatosVivos(['dim_clientes', 'dim_proyectos', 'fact_ventas'])

  const router = useRouter()
  const [view, setView] = useState<View>('lista')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  const selectedCliente = useMemo(
    () => clientes.find((c) => c.id === selectedId) ?? null,
    [clientes, selectedId]
  )

  const selectedProyectos = useMemo(
    () => proyectos.filter((p) => p.cliente_id === selectedId),
    [proyectos, selectedId]
  )

  const selectedVentas = useMemo(
    () => ventas.filter((v) => v.cliente_id === selectedId),
    [ventas, selectedId]
  )

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

  function handleSelect(id: string) {
    setSelectedId((prev) => (prev === id ? null : id))
  }

  const panelOpen = !!selectedCliente

  return (
    <div
      // `pb-6` y no `pb-0`: el cero dejaba la lista de clientes tocando el filo
      // de la ventana, el mismo defecto que tenía el panel del lead.
      className="flex flex-col h-full min-h-0 px-6 pt-6 pb-6"
    >
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        className="flex items-center justify-between mb-5 shrink-0"
      >
        <div>
          <h1 className="text-2xl font-bold text-[var(--tx-ink-primary)]">
            Clientes
          </h1>
          <p className="text-[13px] mt-0.5" style={{ color: 'var(--tx-ink-muted)' }}>
            {clientes.length} cliente{clientes.length !== 1 ? 's' : ''} ·{' '}
            {clientes.filter((c) => c.estado === 'activo').length} activo{clientes.filter((c) => c.estado === 'activo').length !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div
            className="flex items-center gap-0.5 p-1 rounded-xl"
            style={{
              background: 'oklch(6% 0.003 240)',
              border: '1px solid oklch(100% 0 0 / 7%)',
            }}
          >
            {([
              { id: 'lista' as View, icon: LayoutList, label: 'Lista' },
              { id: 'pipeline' as View, icon: Kanban, label: 'Pipeline' },
            ] as const).map(({ id, icon: Icon, label }) => (
              <motion.button
                key={id}
                onClick={() => setView(id)}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] text-[12px] font-semibold transition-all"
                style={{
                  background: view === id ? 'oklch(100% 0 0 / 10%)' : 'transparent',
                  color: view === id ? 'var(--tx-ink-primary)' : 'var(--tx-ink-muted)',
                  border: view === id ? '1px solid oklch(100% 0 0 / 14%)' : '1px solid transparent',
                  boxShadow: view === id ? 'inset 0 1px 0 oklch(100% 0 0 / 10%)' : 'none',
                }}
                title={label}
              >
                <Icon size={13} />
                <span className="hidden sm:inline">{label}</span>
              </motion.button>
            ))}
          </div>

          {/* New client button */}
          <motion.button
            whileHover={{ scale: 1.03, y: -1 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 500, damping: 18 }}
            onClick={() => setFormOpen(true)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-[12px] font-semibold"
            style={{
              background: 'var(--tx-accent)',
              color: 'var(--tx-accent-fg)',
              boxShadow: '0 8px 20px var(--tx-accent-glow), inset 0 1px 0 oklch(100% 0 0 / 18%)',
            }}
          >
            <Plus size={14} />
            <span className="hidden sm:inline">Nuevo cliente</span>
          </motion.button>
        </div>
      </motion.div>

      {/* Revenue KPIs */}
      <div className="shrink-0">
        <RevenueHeader clientes={clientes} ventas={ventas} />
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-h-0 gap-0">
        {/* Left: feed or pipeline.
            En un teléfono se esconde mientras el panel está abierto: los dos juntos
            no entran, y antes el panel de 380px era más ancho que la pantalla y
            aplastaba la lista hasta hacerla ilegible. */}
        <motion.div
          layout
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className={`flex-1 min-w-0 overflow-hidden ${panelOpen ? 'hidden md:block' : ''}`}
        >
          <AnimatePresence mode="wait">
            {view === 'lista' ? (
              <motion.div
                key="lista"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="h-full overflow-hidden pb-6"
              >
                <ClientesFeed
                  clientes={clientes}
                  proyectos={proyectos}
                  ventas={ventas}
                  selectedId={selectedId}
                  onSelect={handleSelect}
                />
              </motion.div>
            ) : (
              <motion.div
                key="pipeline"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="h-full overflow-x-auto pb-6"
              >
                <ClientesPipeline
                  clientes={clientes}
                  proyectos={proyectos}
                  ventas={ventas}
                  selectedId={selectedId}
                  onSelect={handleSelect}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Right: detail panel.
            En móvil ocupa todo el ancho disponible; desde md vuelve a ser el panel
            lateral de 380px. Animar el ancho a 380 en un teléfono de 375 dejaba el
            contenido cortado por el borde de la pantalla. */}
        <AnimatePresence>
          {panelOpen && selectedCliente && (
            <motion.div
              key="panel"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              className="shrink-0 overflow-hidden h-full w-full md:w-[380px]"
            >
              <div className="h-full w-full">
                <ClientePanel
                  cliente={selectedCliente}
                  proyectos={selectedProyectos}
                  ventas={selectedVentas}
                  onClose={() => setSelectedId(null)}
                  onUpdate={() => router.refresh()}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ClienteForm open={formOpen} onOpenChange={setFormOpen} onSubmit={handleCreate} />
    </div>
  )
}
