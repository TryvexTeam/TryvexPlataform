'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowDownRight, ArrowUpRight, FileWarning, Paperclip, Pencil, Plus, Trash2, Wallet } from 'lucide-react'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SelectorFecha } from '@/components/ui/selector-fecha'
import { ConfirmarDialog } from '@/components/clientes/confirmar-dialog'
import { MovimientoForm, type ClienteOpcion } from '@/components/finanzas/movimiento-form'
import {
  CATEGORIAS_EGRESO,
  CATEGORIAS_INGRESO,
  CATEGORIA_LABELS,
  formatearCLP,
  resumirMovimientos,
  type Movimiento,
} from '@/lib/types/finanzas'

export interface ResumenMes {
  mes: string
  ingresos_clp: number
  egresos_clp: number
  saldo_clp: number
  movimientos: number
}

interface FinanzasWorkspaceProps {
  movimientosIniciales: Movimiento[]
  resumenMensual: ResumenMes[]
  rangoInicial: { desde: string; hasta: string }
  puedeGestionar: boolean
  clientes: ClienteOpcion[]
}

/** 'todos' en vez de '' porque el Select de shadcn no admite valor vacío en un item. */
const TODOS = 'todos'

const FECHA_CORTA = new Intl.DateTimeFormat('es-CL', {
  day: '2-digit',
  month: 'short',
  timeZone: 'America/Santiago',
})

const MES_LARGO = new Intl.DateTimeFormat('es-CL', {
  month: 'long',
  year: 'numeric',
  timeZone: 'America/Santiago',
})

/** La fecha viene como 'YYYY-MM-DD' pura: se formatea a mediodía UTC para que ningún
 *  huso la corra un día hacia atrás al renderizarla. */
function formatearFecha(iso: string): string {
  return FECHA_CORTA.format(new Date(`${iso.slice(0, 10)}T12:00:00Z`))
}

function formatearMes(iso: string): string {
  return MES_LARGO.format(new Date(`${iso.slice(0, 7)}-01T12:00:00Z`))
}

export function FinanzasWorkspace({
  movimientosIniciales,
  resumenMensual,
  rangoInicial,
  puedeGestionar,
  clientes,
}: FinanzasWorkspaceProps) {
  const [movimientos, setMovimientos] = useState<Movimiento[]>(movimientosIniciales)
  const [cargando, setCargando] = useState(false)
  const [desde, setDesde] = useState(rangoInicial.desde)
  const [hasta, setHasta] = useState(rangoInicial.hasta)
  const [tipo, setTipo] = useState<string>(TODOS)
  const [categoria, setCategoria] = useState<string>(TODOS)
  const [formAbierto, setFormAbierto] = useState(false)
  const [editando, setEditando] = useState<Movimiento | undefined>(undefined)
  const [porBorrar, setPorBorrar] = useState<Movimiento | null>(null)

  // El filtrado va al servidor y no en memoria: el cliente solo tiene el período que
  // ya cargó, así que filtrar aquí escondería movimientos en vez de traerlos.
  const recargar = useCallback(async () => {
    setCargando(true)
    try {
      const qs = new URLSearchParams()
      if (desde) qs.set('desde', desde)
      if (hasta) qs.set('hasta', hasta)
      if (tipo !== TODOS) qs.set('tipo', tipo)
      if (categoria !== TODOS) qs.set('categoria', categoria)

      const res = await fetch(`/api/finanzas?${qs.toString()}`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Error')
      setMovimientos(json.data as Movimiento[])
    } catch {
      toast.error('No se pudieron cargar los movimientos')
    } finally {
      setCargando(false)
    }
  }, [desde, hasta, tipo, categoria])

  // Se salta la primera pasada: la página ya llegó con los datos del mes en curso
  // renderizados desde el servidor; volver a pedirlos sería un viaje regalado. Va en
  // una ref y no en estado para no provocar un render extra solo por marcar la bandera.
  const primeraPasada = useRef(true)
  useEffect(() => {
    if (primeraPasada.current) {
      primeraPasada.current = false
      return
    }
    void recargar()
  }, [recargar])

  // Cambiar el tipo invalida la categoría elegida: no existe un egreso "aporte_socio".
  function cambiarTipo(valor: string) {
    setTipo(valor)
    setCategoria(TODOS)
  }

  const resumen = resumirMovimientos(movimientos)
  const categoriasVisibles =
    tipo === 'ingreso' ? CATEGORIAS_INGRESO : tipo === 'egreso' ? CATEGORIAS_EGRESO : [...CATEGORIAS_INGRESO, ...CATEGORIAS_EGRESO]

  async function verComprobante(mov: Movimiento) {
    try {
      const res = await fetch(`/api/finanzas/${mov.id}/voucher`)
      const json = await res.json()
      if (!res.ok || !json.success || !json.data?.url) throw new Error()
      window.open(json.data.url as string, '_blank', 'noopener,noreferrer')
    } catch {
      toast.error('No se pudo abrir el comprobante')
    }
  }

  async function confirmarBorrado() {
    if (!porBorrar) return
    try {
      const res = await fetch(`/api/finanzas/${porBorrar.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Movimiento eliminado')
      await recargar()
    } catch {
      toast.error('No se pudo eliminar el movimiento')
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--tx-ink-primary)] mb-1">Finanzas</h1>
          <p className="text-sm text-[var(--tx-ink-muted)]">
            La caja de la empresa: lo que entró y lo que salió, con su comprobante.
          </p>
        </div>
        {puedeGestionar && (
          <Button
            onClick={() => {
              setEditando(undefined)
              setFormAbierto(true)
            }}
          >
            <Plus className="size-4" />
            Registrar movimiento
          </Button>
        )}
      </header>

      {/* KPIs del período */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Kpi
          label="Ingresos"
          valor={formatearCLP(resumen.ingresos)}
          icono={<ArrowUpRight size={16} />}
          color="oklch(72% 0.17 145)"
        />
        <Kpi
          label="Egresos"
          valor={formatearCLP(resumen.egresos)}
          icono={<ArrowDownRight size={16} />}
          color="oklch(70% 0.19 25)"
        />
        <Kpi
          label="Saldo del período"
          valor={formatearCLP(resumen.saldo)}
          icono={<Wallet size={16} />}
          color={resumen.saldo >= 0 ? 'oklch(72% 0.17 145)' : 'oklch(70% 0.19 25)'}
          resaltado
        />
      </div>

      {resumen.sinVoucher > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-[var(--tx-ink-muted)]">
          <FileWarning size={13} />
          {resumen.sinVoucher} sin comprobante
        </p>
      )}

      {/* Filtros */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="f-desde">Desde</Label>
          <SelectorFecha id="f-desde" value={desde} onChange={(v) => setDesde(v)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-hasta">Hasta</Label>
          <SelectorFecha id="f-hasta" value={hasta} onChange={(v) => setHasta(v)} />
        </div>
        <div className="space-y-1.5">
          <Label>Tipo</Label>
          <Select value={tipo} onValueChange={(v) => cambiarTipo(v ?? TODOS)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos</SelectItem>
              <SelectItem value="ingreso">Ingresos</SelectItem>
              <SelectItem value="egreso">Egresos</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Categoría</Label>
          <Select value={categoria} onValueChange={(v) => setCategoria(v ?? TODOS)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todas</SelectItem>
              {categoriasVisibles.map((c) => (
                <SelectItem key={c} value={c}>{CATEGORIA_LABELS[c] ?? c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      {/* Movimientos */}
      <section>
        {cargando ? (
          <p className="text-sm text-[var(--tx-ink-muted)]">Cargando movimientos…</p>
        ) : movimientos.length === 0 ? (
          <p className="text-sm text-[var(--tx-ink-muted)]">No hay movimientos en este período.</p>
        ) : (
          <>
            {/* Escritorio: tabla. El contenedor scrollea solo, nunca el body. */}
            <div className="hidden md:block overflow-x-auto rounded-xl border border-[var(--tx-border)]">
              <table className="w-full text-sm">
                <thead className="text-[var(--tx-ink-muted)]">
                  <tr>
                    <th className="text-left font-medium px-3 py-2">Fecha</th>
                    <th className="text-left font-medium px-3 py-2">Tipo</th>
                    <th className="text-left font-medium px-3 py-2">Categoría</th>
                    <th className="text-left font-medium px-3 py-2">Descripción</th>
                    <th className="text-left font-medium px-3 py-2">Contraparte</th>
                    <th className="text-right font-medium px-3 py-2">Monto</th>
                    <th className="text-right font-medium px-3 py-2">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {movimientos.map((m) => (
                    <tr key={m.id} className="border-t border-[var(--tx-border)]">
                      <td className="px-3 py-2 text-[var(--tx-ink-muted)] whitespace-nowrap">{formatearFecha(m.fecha)}</td>
                      <td className="px-3 py-2"><BadgeTipo tipo={m.tipo} /></td>
                      <td className="px-3 py-2 text-[var(--tx-ink-secondary)]">{CATEGORIA_LABELS[m.categoria] ?? m.categoria}</td>
                      <td className="px-3 py-2 text-[var(--tx-ink-primary)]">{m.descripcion}</td>
                      <td className="px-3 py-2 text-[var(--tx-ink-muted)]">
                        {m.contraparte || m.cliente?.nombre_negocio || '—'}
                      </td>
                      <td className="px-3 py-2 text-right"><Monto mov={m} /></td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <Acciones
                            mov={m}
                            puedeGestionar={puedeGestionar}
                            onVer={verComprobante}
                            onEditar={(mv) => { setEditando(mv); setFormAbierto(true) }}
                            onBorrar={setPorBorrar}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Móvil: tarjetas apiladas, sin scroll lateral. */}
            <ul className="md:hidden space-y-2">
              {movimientos.map((m) => (
                <li
                  key={m.id}
                  className="rounded-xl border border-[var(--tx-border)] p-3 space-y-2"
                  style={{ background: 'rgba(255,255,255,0.03)' }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--tx-ink-primary)] truncate">{m.descripcion}</p>
                      <p className="text-[11px] text-[var(--tx-ink-muted)]">
                        {formatearFecha(m.fecha)} · {CATEGORIA_LABELS[m.categoria] ?? m.categoria}
                      </p>
                    </div>
                    <Monto mov={m} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <BadgeTipo tipo={m.tipo} />
                      <span className="text-[11px] text-[var(--tx-ink-muted)] truncate">
                        {m.contraparte || m.cliente?.nombre_negocio || '—'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Acciones
                        mov={m}
                        puedeGestionar={puedeGestionar}
                        onVer={verComprobante}
                        onEditar={(mv) => { setEditando(mv); setFormAbierto(true) }}
                        onBorrar={setPorBorrar}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* Últimos meses */}
      {resumenMensual.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-[var(--tx-ink-primary)]">Últimos meses</h2>

          {/* Escritorio: tabla. El contenedor scrollea solo, nunca el body. */}
          <div className="hidden md:block overflow-x-auto rounded-xl border border-[var(--tx-border)]">
            <table className="w-full text-sm">
              <thead className="text-[var(--tx-ink-muted)]">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Mes</th>
                  <th className="text-right font-medium px-3 py-2">Ingresos</th>
                  <th className="text-right font-medium px-3 py-2">Egresos</th>
                  <th className="text-right font-medium px-3 py-2">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {resumenMensual.map((r) => (
                  <tr key={r.mes} className="border-t border-[var(--tx-border)]">
                    <td className="px-3 py-2 capitalize text-[var(--tx-ink-secondary)]">{formatearMes(r.mes)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-400">{formatearCLP(Number(r.ingresos_clp))}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-red-400">{formatearCLP(Number(r.egresos_clp))}</td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums font-medium ${
                        Number(r.saldo_clp) >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {formatearCLP(Number(r.saldo_clp))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Móvil: tarjetas apiladas, sin scroll lateral. */}
          <ul className="md:hidden space-y-2">
            {resumenMensual.map((r) => (
              <li
                key={r.mes}
                className="rounded-xl border border-[var(--tx-border)] p-3 space-y-2"
                style={{ background: 'rgba(255,255,255,0.03)' }}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium capitalize text-[var(--tx-ink-primary)]">{formatearMes(r.mes)}</p>
                  <span
                    className={`text-sm font-medium tabular-nums ${
                      Number(r.saldo_clp) >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {formatearCLP(Number(r.saldo_clp))}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-[var(--tx-ink-muted)]">
                  <span className="tabular-nums text-emerald-400">Ingresos {formatearCLP(Number(r.ingresos_clp))}</span>
                  <span className="tabular-nums text-red-400">Egresos {formatearCLP(Number(r.egresos_clp))}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Se monta solo mientras está abierto y con `key` por movimiento: así el
          formulario nace con los datos de la fila que se abrió, sin resetearse a mano. */}
      {puedeGestionar && formAbierto && (
        <MovimientoForm
          key={editando?.id ?? 'nuevo'}
          open
          onOpenChange={setFormAbierto}
          movimiento={editando}
          clientes={clientes}
          onSaved={recargar}
        />
      )}

      {/* Confirmación de borrado: se lleva también el comprobante, así que no puede
          depender de un clic distraído. Se reutiliza el diálogo del CRM en vez de
          window.confirm, que no respeta el tema y en móvil parece del navegador. */}
      <ConfirmarDialog
        open={porBorrar !== null}
        onOpenChange={(o) => { if (!o) setPorBorrar(null) }}
        titulo="¿Eliminar este movimiento?"
        descripcion={
          porBorrar
            ? `${porBorrar.descripcion} — ${formatearCLP(Number(porBorrar.monto_clp))}. También se borra su comprobante y no se puede deshacer.`
            : ''
        }
        confirmar="Eliminar"
        destructivo
        onConfirmar={confirmarBorrado}
      />
    </div>
  )
}

function Kpi({
  label,
  valor,
  icono,
  color,
  resaltado = false,
}: {
  label: string
  valor: string
  icono: React.ReactNode
  color: string
  resaltado?: boolean
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      className="relative overflow-hidden rounded-2xl p-4"
      style={{
        background: 'linear-gradient(180deg, oklch(12% 0.005 240) 0%, oklch(9% 0.003 240) 100%)',
        border: '1px solid oklch(100% 0 0 / 7%)',
        boxShadow: 'inset 0 1px 0 oklch(100% 0 0 / 8%), 0 8px 24px oklch(0% 0 0 / 40%)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 text-[var(--tx-ink-muted)]">
            {label}
          </p>
          <p
            className="text-[22px] font-bold tracking-tight leading-none tabular-nums"
            style={{ color: resaltado ? color : 'var(--tx-ink-primary)' }}
          >
            {valor}
          </p>
        </div>
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${color}20`, border: `1px solid ${color}40`, color }}
        >
          {icono}
        </div>
      </div>
    </motion.div>
  )
}

function BadgeTipo({ tipo }: { tipo: 'ingreso' | 'egreso' }) {
  const esIngreso = tipo === 'ingreso'
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
        esIngreso
          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
          : 'bg-red-500/15 text-red-400 border border-red-500/30'
      }`}
    >
      {esIngreso ? 'Ingreso' : 'Egreso'}
    </span>
  )
}

function Monto({ mov }: { mov: Movimiento }) {
  const esIngreso = mov.tipo === 'ingreso'
  return (
    <span className={`tabular-nums font-medium whitespace-nowrap ${esIngreso ? 'text-emerald-400' : 'text-red-400'}`}>
      {esIngreso ? '+' : '−'}{formatearCLP(Number(mov.monto_clp))}
    </span>
  )
}

function Acciones({
  mov,
  puedeGestionar,
  onVer,
  onEditar,
  onBorrar,
}: {
  mov: Movimiento
  puedeGestionar: boolean
  onVer: (m: Movimiento) => void
  onEditar: (m: Movimiento) => void
  onBorrar: (m: Movimiento) => void
}) {
  return (
    <>
      {mov.voucher_path && (
        <Button size="sm" variant="ghost" onClick={() => onVer(mov)} title="Ver comprobante" aria-label="Ver comprobante">
          <Paperclip className="size-4" />
        </Button>
      )}
      {puedeGestionar && (
        <>
          <Button size="sm" variant="ghost" onClick={() => onEditar(mov)} title="Editar" aria-label="Editar movimiento">
            <Pencil className="size-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onBorrar(mov)} title="Eliminar" aria-label="Eliminar movimiento">
            <Trash2 className="size-4 text-red-400" />
          </Button>
        </>
      )}
    </>
  )
}
