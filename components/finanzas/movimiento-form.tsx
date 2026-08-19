'use client'

import { useState } from 'react'
import { toast } from '@/lib/toast'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SelectorFecha } from '@/components/ui/selector-fecha'
import {
  CATEGORIA_LABELS,
  METODOS_PAGO,
  METODO_LABELS,
  MovimientoInsertSchema,
  categoriasDe,
  type Movimiento,
} from '@/lib/types/finanzas'

export interface ClienteOpcion {
  id: string
  nombre: string
}

interface MovimientoFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Si viene, el formulario edita ese movimiento en vez de crear uno nuevo. */
  movimiento?: Movimiento
  clientes: ClienteOpcion[]
  onSaved: () => void
}

/** El Select de shadcn no admite item con valor vacío: 'ninguno' representa "sin dato". */
const NINGUNO = 'ninguno'

const MAX_VOUCHER_MB = 10
const TIPOS_VOUCHER = ['application/pdf']

/** Hoy en Santiago, formato YYYY-MM-DD. Un movimiento cargado a las 22:00 es de hoy
 *  para quien lo registra, aunque en UTC ya sea mañana. */
function hoySantiago(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** Storage rechaza rutas con espacios, acentos o signos: se deja solo lo seguro. */
function sanearNombre(nombre: string): string {
  return nombre.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'comprobante'
}

function estadoInicial(mov?: Movimiento) {
  return {
    tipo: mov?.tipo ?? 'egreso',
    categoria: mov?.categoria ?? '',
    descripcion: mov?.descripcion ?? '',
    monto_clp: mov ? String(mov.monto_clp) : '',
    fecha: mov?.fecha?.slice(0, 10) ?? hoySantiago(),
    metodo_pago: mov?.metodo_pago ?? NINGUNO,
    contraparte: mov?.contraparte ?? '',
    cliente_id: mov?.cliente_id ?? NINGUNO,
    notas: mov?.notas ?? '',
  }
}

export function MovimientoForm({ open, onOpenChange, movimiento, clientes, onSaved }: MovimientoFormProps) {
  const [form, setForm] = useState(estadoInicial(movimiento))
  const [archivo, setArchivo] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Ojo: el estado se inicializa una sola vez por montaje. Quien lo usa monta este
  // componente con `key` distinta por movimiento, así el formulario nunca arrastra los
  // datos de la fila anterior sin necesidad de un efecto que los resetee.

  function set(field: string, value: string) {
    setForm((p) => ({ ...p, [field]: value }))
    setErrors((p) => ({ ...p, [field]: '' }))
  }

  // Cambiar el tipo deja huérfana la categoría: 'sueldo' no existe entre los ingresos.
  function cambiarTipo(valor: string) {
    setForm((p) => ({ ...p, tipo: valor as 'ingreso' | 'egreso', categoria: '' }))
    setErrors((p) => ({ ...p, tipo: '', categoria: '' }))
  }

  function elegirArchivo(file: File | null) {
    if (!file) {
      setArchivo(null)
      return
    }
    const esImagen = file.type.startsWith('image/')
    if (!esImagen && !TIPOS_VOUCHER.includes(file.type)) {
      toast.error('El comprobante debe ser una imagen o un PDF')
      return
    }
    if (file.size > MAX_VOUCHER_MB * 1024 * 1024) {
      toast.error(`El comprobante supera los ${MAX_VOUCHER_MB} MB`)
      return
    }
    setArchivo(file)
  }

  /** Sube el comprobante y devuelve su ruta. Lanza si falla: sin comprobante subido no
   *  se guarda el movimiento, para no dejar una fila apuntando a un archivo inexistente. */
  async function subirVoucher(file: File, fecha: string): Promise<{ path: string; nombre: string }> {
    const [anio, mes] = fecha.split('-')
    const nombre = sanearNombre(file.name)
    const path = `${anio}/${mes}/${crypto.randomUUID()}-${nombre}`

    const supabase = createClient()
    const { error } = await supabase.storage.from('vouchers').upload(path, file, {
      contentType: file.type,
      upsert: false,
    })
    if (error) throw new Error(error.message)
    return { path, nombre: file.name.slice(0, 300) }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    let voucher: { path: string; nombre: string } | null = null
    setLoading(true)

    try {
      if (archivo) {
        voucher = await subirVoucher(archivo, form.fecha || hoySantiago())
      }

      const payload = {
        tipo: form.tipo,
        categoria: form.categoria,
        descripcion: form.descripcion,
        monto_clp: form.monto_clp ? Number(form.monto_clp) : 0,
        fecha: form.fecha,
        metodo_pago: form.metodo_pago === NINGUNO ? null : form.metodo_pago,
        contraparte: form.contraparte || null,
        cliente_id: form.cliente_id === NINGUNO ? null : form.cliente_id,
        notas: form.notas || null,
        voucher_path: voucher?.path ?? movimiento?.voucher_path ?? null,
        voucher_nombre: voucher?.nombre ?? movimiento?.voucher_nombre ?? null,
      }

      const result = MovimientoInsertSchema.safeParse(payload)
      if (!result.success) {
        const fe: Record<string, string> = {}
        result.error.issues.forEach((i) => { if (i.path[0]) fe[i.path[0] as string] = i.message })
        setErrors(fe)
        return
      }

      const res = movimiento
        ? await fetch(`/api/finanzas/${movimiento.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(result.data),
          })
        : await fetch('/api/finanzas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(result.data),
          })

      if (!res.ok) throw new Error('api')
      toast.success(movimiento ? 'Movimiento actualizado' : 'Movimiento registrado')
      onOpenChange(false)
      onSaved()
    } catch (error: unknown) {
      const mensaje = error instanceof Error && error.message !== 'api' ? error.message : null
      toast.error(mensaje ? `No se pudo subir el comprobante: ${mensaje}` : 'No se pudo guardar el movimiento')
    } finally {
      setLoading(false)
    }
  }

  const categorias = categoriasDe(form.tipo as 'ingreso' | 'egreso')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{movimiento ? 'Editar movimiento' : 'Registrar movimiento'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <Select value={form.tipo} onValueChange={(v) => cambiarTipo(v ?? 'egreso')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ingreso">Ingreso</SelectItem>
                  <SelectItem value="egreso">Egreso</SelectItem>
                </SelectContent>
              </Select>
              {errors.tipo && <p className="text-xs text-red-500">{errors.tipo}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Categoría *</Label>
              <Select value={form.categoria} onValueChange={(v) => set('categoria', v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Elegir" /></SelectTrigger>
                <SelectContent>
                  {categorias.map((c) => (
                    <SelectItem key={c} value={c}>{CATEGORIA_LABELS[c] ?? c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.categoria && <p className="text-xs text-red-500">{errors.categoria}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Descripción *</Label>
            <Input
              value={form.descripcion}
              onChange={(e) => set('descripcion', e.target.value)}
              placeholder="Ej: hosting Vercel de agosto"
            />
            {errors.descripcion && <p className="text-xs text-red-500">{errors.descripcion}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Monto (CLP) *</Label>
              <Input
                type="number"
                step="1"
                min="0"
                value={form.monto_clp}
                onChange={(e) => set('monto_clp', e.target.value)}
                placeholder="0"
              />
              {errors.monto_clp && <p className="text-xs text-red-500">{errors.monto_clp}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Fecha *</Label>
              <SelectorFecha value={form.fecha} onChange={(v) => set('fecha', v)} />
              {errors.fecha && <p className="text-xs text-red-500">{errors.fecha}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Método de pago</Label>
              <Select value={form.metodo_pago} onValueChange={(v) => set('metodo_pago', v ?? NINGUNO)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NINGUNO}>Sin especificar</SelectItem>
                  {METODOS_PAGO.map((m) => (
                    <SelectItem key={m} value={m}>{METODO_LABELS[m] ?? m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Contraparte</Label>
              <Input
                value={form.contraparte}
                onChange={(e) => set('contraparte', e.target.value)}
                placeholder="A quién / de quién"
              />
              {errors.contraparte && <p className="text-xs text-red-500">{errors.contraparte}</p>}
            </div>
          </div>

          {clientes.length > 0 && (
            <div className="space-y-1.5">
              <Label>Cliente asociado</Label>
              <Select value={form.cliente_id} onValueChange={(v) => set('cliente_id', v ?? NINGUNO)}>
                <SelectTrigger><SelectValue placeholder="Sin cliente" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NINGUNO}>Sin cliente</SelectItem>
                  {clientes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="voucher">Comprobante (imagen o PDF, máx. {MAX_VOUCHER_MB} MB)</Label>
            <input
              id="voucher"
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => elegirArchivo(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-[var(--tx-ink-secondary)] file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-sm file:text-[var(--tx-ink-primary)]"
            />
            {archivo && <p className="text-xs text-[var(--tx-ink-muted)]">{archivo.name}</p>}
            {!archivo && movimiento?.voucher_nombre && (
              <p className="text-xs text-[var(--tx-ink-muted)]">Actual: {movimiento.voucher_nombre}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea
              value={form.notas}
              onChange={(e) => set('notas', e.target.value)}
              rows={2}
              placeholder="Contexto que después no se recuerda"
            />
            {errors.notas && <p className="text-xs text-red-500">{errors.notas}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Guardando…' : movimiento ? 'Guardar cambios' : 'Registrar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
