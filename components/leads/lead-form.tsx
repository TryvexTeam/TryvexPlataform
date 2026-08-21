'use client'

import { useState } from 'react'
import { toast } from '@/lib/toast'
import { LeadInsertSchema, type Lead, type LeadInsert } from '@/lib/types/lead'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

interface LeadFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  lead?: Lead
  onSubmit: (data: LeadInsert) => Promise<void>
}

const defaults = {
  nombre_negocio: '', telefono: '', nicho: '', localidad: '',
  url_web: '', notas: '',
  // `null` y no `false`: nadie miró todavía si este negocio tiene web.
  // Con `false` por defecto, un lead cargado a mano sin tocar el control
  // quedaba afirmando "no tiene web", y Vex lo lee como dato medido y le
  // escribe "sos invisible en Google". Un dato que nadie miró no es un no.
  tiene_web: null as boolean | null,
  estado: 'sin_contactar' as const, origen: 'manual' as const,
  score: '' as unknown as number,
}

export function LeadForm({ open, onOpenChange, lead, onSubmit }: LeadFormProps) {
  const [form, setForm] = useState({
    nombre_negocio: lead?.nombre_negocio ?? defaults.nombre_negocio,
    telefono: lead?.telefono ?? defaults.telefono,
    nicho: lead?.nicho ?? defaults.nicho,
    localidad: lead?.localidad ?? defaults.localidad,
    url_web: lead?.url_web ?? defaults.url_web,
    notas: lead?.notas ?? defaults.notas,
    tiene_web: lead?.tiene_web ?? defaults.tiene_web,
    estado: (lead?.estado ?? defaults.estado) as string,
    origen: (lead?.origen ?? defaults.origen) as string,
    score: lead?.score?.toString() ?? '',
  })
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // `null` entra a propósito: es el valor de "no sé" de `tiene_web`, y sin él
  // el campo no tendría cómo quedar indeterminado.
  function set(field: string, value: string | boolean | null) {
    setForm((p) => ({ ...p, [field]: value }))
    setErrors((p) => ({ ...p, [field]: '' }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    const result = LeadInsertSchema.safeParse({
      ...form,
      telefono: form.telefono || null,
      nicho: form.nicho || null,
      localidad: form.localidad || null,
      url_web: form.url_web || null,
      notas: form.notas || null,
      score: form.score ? Number(form.score) : null,
    })

    if (!result.success) {
      const fe: Record<string, string> = {}
      result.error.issues.forEach((i) => { if (i.path[0]) fe[i.path[0] as string] = i.message })
      setErrors(fe)
      return
    }

    setLoading(true)
    try {
      await onSubmit(result.data)
      onOpenChange(false)
      setForm({ ...defaults, score: '', estado: 'sin_contactar', origen: 'manual', tiene_web: null })
    } catch {
      toast.error('Error al guardar el lead')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{lead ? 'Editar lead' : 'Nuevo lead'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="lead-negocio">Negocio *</Label>
            <Input id="lead-negocio" value={form.nombre_negocio} onChange={(e) => set('nombre_negocio', e.target.value)} placeholder="Nombre del negocio" />
            {errors.nombre_negocio && <p className="text-xs text-red-500">{errors.nombre_negocio}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="lead-telefono">Teléfono</Label>
              <Input id="lead-telefono" value={form.telefono ?? ''} onChange={(e) => set('telefono', e.target.value)} placeholder="+56 9..." />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lead-score">Score (1-10)</Label>
              <Input id="lead-score" type="number" min={1} max={10} value={form.score} onChange={(e) => set('score', e.target.value)} placeholder="—" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="lead-nicho">Nicho</Label>
              <Input id="lead-nicho" value={form.nicho ?? ''} onChange={(e) => set('nicho', e.target.value)} placeholder="Ej: Restaurante" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lead-localidad">Localidad</Label>
              <Input id="lead-localidad" value={form.localidad ?? ''} onChange={(e) => set('localidad', e.target.value)} placeholder="Ej: Santiago" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="lead-estado">Estado</Label>
              <Select value={form.estado} onValueChange={(v) => set('estado', v ?? 'sin_contactar')}>
                <SelectTrigger id="lead-estado"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sin_contactar">Sin contactar</SelectItem>
                  <SelectItem value="contactado">Contactado</SelectItem>
                  <SelectItem value="interesado">Interesado</SelectItem>
                  <SelectItem value="reunion_agendada">Reunión agendada</SelectItem>
                  <SelectItem value="ganado">Ganado</SelectItem>
                  <SelectItem value="perdido">Perdido</SelectItem>
                  <SelectItem value="descartado">Descartado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lead-origen">Origen</Label>
              <Select value={form.origen} onValueChange={(v) => set('origen', v ?? 'manual')}>
                <SelectTrigger id="lead-origen"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="scraper">Scraper</SelectItem>
                  <SelectItem value="referido">Referido</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lead-tiene-web">¿Tiene web?</Label>
            <Select
              value={form.tiene_web === null ? 'no_se' : form.tiene_web ? 'si' : 'no'}
              onValueChange={(v) => set('tiene_web', v === 'no_se' ? null : v === 'si')}
            >
              <SelectTrigger id="lead-tiene-web"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="no_se">No sé</SelectItem>
                <SelectItem value="si">Sí</SelectItem>
                <SelectItem value="no">No</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.tiene_web === true && (
            <div className="space-y-1.5">
              <Label htmlFor="lead-url-web">URL web</Label>
              <Input id="lead-url-web" value={form.url_web ?? ''} onChange={(e) => set('url_web', e.target.value)} placeholder="https://..." />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="lead-notas">Notas</Label>
            <Textarea id="lead-notas" value={form.notas ?? ''} onChange={(e) => set('notas', e.target.value)} rows={2} placeholder="Observaciones..." />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Guardando...' : lead ? 'Guardar' : 'Crear lead'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
