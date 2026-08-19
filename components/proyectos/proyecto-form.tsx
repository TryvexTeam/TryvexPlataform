'use client'

import { useState } from 'react'
import { toast } from '@/lib/toast'
import { ProyectoInsertSchema, type Proyecto, type ProyectoInsert } from '@/lib/types/proyecto'
import { nombreCliente, type Cliente } from '@/lib/types/cliente'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  FAMILIAS_SERVICIO,
  plantillaDe,
  precioCorto,
  serviciosDeFamilia,
  tipoDeServicio,
  type IdServicio,
} from '@/lib/types/servicios'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { SelectorFecha } from '@/components/ui/selector-fecha'

interface ProyectoFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  proyecto?: Proyecto
  clientes: Cliente[]
  onSubmit: (data: ProyectoInsert) => Promise<void>
}

export function ProyectoForm({ open, onOpenChange, proyecto, clientes, onSubmit }: ProyectoFormProps) {
  const [form, setForm] = useState({
    nombre: proyecto?.nombre ?? '',

    tipo: (proyecto?.tipo ?? 'otro') as string,
    estado: (proyecto?.estado ?? 'brief') as string,
    cliente_id: proyecto?.cliente_id ?? '',
    costo_total_usd: proyecto?.costo_total_usd?.toString() ?? '',
    horas_estimadas: proyecto?.horas_estimadas?.toString() ?? '',
    horas_reales: proyecto?.horas_reales?.toString() ?? '',
    fecha_inicio: proyecto?.fecha_inicio ?? '',
    fecha_entrega: proyecto?.fecha_entrega ?? '',
    url_deploy: proyecto?.url_deploy ?? '',
    repo_url: proyecto?.repo_url ?? '',
  })
  /**
   * Servicios vendidos en este proyecto. Es un conjunto porque una venta real
   * rara vez es un solo servicio: landing más automatización, o MVP más
   * WhatsApp. Se marcan todos y las tareas de cada uno entran al backlog.
   */
  const [servicios, setServicios] = useState<Set<string>>(
    () => new Set(proyecto?.servicios_ids ?? []),
  )
  const [loading, setLoading] = useState(false)

  /**
   * Suma de los precios base de lo marcado.
   *
   * Es una PROPUESTA, no un total cerrado: el catálogo dice que los precios se
   * ajustan según los componentes que pida el cliente. Por eso rellena el
   * campo de valor pero se puede sobrescribir antes de guardar.
   */
  const precioPropuesto = [...servicios].reduce(
    (acc, id) => acc + (plantillaDe(id as IdServicio)?.precioDesde ?? 0),
    0,
  )
  const tareasPropuestas = [...servicios].reduce(
    (acc, id) => acc + (plantillaDe(id as IdServicio)?.tareas.length ?? 0),
    0,
  )

  function alternarServicio(id: string) {
    setServicios((prev) => {
      const siguiente = new Set(prev)
      if (siguiente.has(id)) siguiente.delete(id)
      else siguiente.add(id)
      return siguiente
    })
  }

  function set(field: string, value: string) {
    setForm((p) => ({ ...p, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const result = ProyectoInsertSchema.safeParse({
      ...form,
      cliente_id: form.cliente_id || null,
      servicios_ids: [...servicios],
      // El tipo lo manda el PRIMER servicio marcado: con varios, la
      // clasificación gruesa se queda con el principal, que es el orden en que
      // se marcaron. Sin servicios se elige a mano.
      tipo:
        servicios.size > 0
          ? tipoDeServicio([...servicios][0] as IdServicio)
          : form.tipo,
      costo_total_usd: form.costo_total_usd ? Number(form.costo_total_usd) : null,
      horas_estimadas: form.horas_estimadas ? Number(form.horas_estimadas) : null,
      horas_reales: form.horas_reales ? Number(form.horas_reales) : null,
      fecha_inicio: form.fecha_inicio || null,
      fecha_entrega: form.fecha_entrega || null,
      url_deploy: form.url_deploy || null,
      repo_url: form.repo_url || null,
    })
    if (!result.success) { toast.error('Revisa los campos'); return }
    setLoading(true)
    try {
      await onSubmit(result.data)
      onOpenChange(false)
    } catch { toast.error('Error al guardar') }
    finally { setLoading(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{proyecto ? 'Editar proyecto' : 'Nuevo proyecto'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nombre *</Label>
            <Input value={form.nombre} onChange={(e) => set('nombre', e.target.value)} placeholder="Nombre del proyecto" />
          </div>

          {/* El servicio solo se elige al CREAR: cambiarlo después no tendría
              efecto —las tareas ya nacieron— y ofrecerlo prometería algo que no
              pasa. En edición el campo ni aparece. */}
          {/* Los servicios se marcan, no se eligen de una lista: una venta
              puede llevar varios y con un desplegable habría que abrirlo una
              vez por cada uno sin ver lo ya marcado. Solo al CREAR: cambiarlos
              después no tendría efecto, porque las tareas ya nacieron. */}
          {!proyecto && (
            <div className="space-y-2">
              <Label>Servicios vendidos</Label>
              <div className="flex flex-col gap-3 rounded-[20px] border border-white/[0.07] p-3.5">
                {FAMILIAS_SERVICIO.map((familia) => (
                  <div key={familia}>
                    <p className="mb-2 text-[10.5px] font-medium uppercase tracking-[0.09em] text-[var(--tx-ink-muted)]">
                      {familia}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {serviciosDeFamilia(familia).map((p) => {
                        const marcado = servicios.has(p.id)
                        return (
                          <button
                            key={p.id}
                            type="button"
                            aria-pressed={marcado}
                            onClick={() => alternarServicio(p.id)}
                            title={p.resumen}
                            className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[12px] transition-colors ${
                              marcado
                                ? 'border-transparent bg-white font-medium text-[var(--tx-bg-primary)]'
                                : 'border-white/[0.09] text-[var(--tx-ink-secondary)] hover:border-white/[0.18] hover:text-[var(--tx-ink-primary)]'
                            }`}
                          >
                            {p.nombre}
                            <span className={marcado ? 'opacity-60' : 'text-[var(--tx-ink-muted)]'}>
                              {precioCorto(p.precioDesde)}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}

                {servicios.size > 0 && (
                  <p className="border-t border-white/[0.06] pt-3 text-[12px] text-[var(--tx-ink-secondary)]">
                    {servicios.size} {servicios.size === 1 ? 'servicio' : 'servicios'} ·{' '}
                    <span className="text-[var(--tx-ink-primary)]">
                      {precioCorto(precioPropuesto)}
                    </span>{' '}
                    de base · {tareasPropuestas} tareas al backlog
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {/* Con servicios marcados el tipo se deriva de ellos y el campo no
                se muestra: "Landing esencial" ya implica que es una landing, y
                preguntarlo sería pedirle al usuario que se repita. Sin
                servicios —o al editar— sigue eligiéndose a mano. */}
            {servicios.size === 0 && (
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={form.tipo} onValueChange={(v) => set('tipo', v ?? 'otro')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="landing">Landing</SelectItem>
                    <SelectItem value="automatizacion">Automatización</SelectItem>
                    <SelectItem value="mantencion">Mantención</SelectItem>
                    <SelectItem value="otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select value={form.estado} onValueChange={(v) => set('estado', v ?? 'brief')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="brief">Brief</SelectItem>
                  <SelectItem value="desarrollo">Desarrollo</SelectItem>
                  <SelectItem value="revision">Revisión</SelectItem>
                  <SelectItem value="entregado">Entregado</SelectItem>
                  <SelectItem value="mantencion">Mantención</SelectItem>
                  <SelectItem value="cerrado">Cerrado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Cliente</Label>
            <Select value={form.cliente_id} onValueChange={(v) => set('cliente_id', v ?? '')}>
              <SelectTrigger><SelectValue placeholder="Sin cliente" /></SelectTrigger>
              <SelectContent>
                {clientes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {nombreCliente(c)}{c.nombre_negocio ? ` — ${c.nombre_negocio}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Costo (USD)</Label>
              <Input type="number" value={form.costo_total_usd} onChange={(e) => set('costo_total_usd', e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Hs. estimadas</Label>
              <Input type="number" value={form.horas_estimadas} onChange={(e) => set('horas_estimadas', e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Hs. reales</Label>
              <Input type="number" value={form.horas_reales} onChange={(e) => set('horas_reales', e.target.value)} placeholder="0" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Inicio</Label>
              <SelectorFecha value={form.fecha_inicio} onChange={(v) => set('fecha_inicio', v)} />
            </div>
            <div className="space-y-1.5">
              <Label>Entrega</Label>
              <SelectorFecha value={form.fecha_entrega} onChange={(v) => set('fecha_entrega', v)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>URL deploy</Label>
            <Input value={form.url_deploy} onChange={(e) => set('url_deploy', e.target.value)} placeholder="https://..." />
          </div>
          <div className="space-y-1.5">
            <Label>Repo URL</Label>
            <Input value={form.repo_url} onChange={(e) => set('repo_url', e.target.value)} placeholder="https://github.com/..." />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Guardando...' : proyecto ? 'Guardar' : 'Crear'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
