'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowLeft, Trash2, Pencil, Plus, Check, RotateCcw } from 'lucide-react'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { TareaForm } from './tarea-form'
import type { TareaConResponsables, Subtarea, TareaInsert } from '@/lib/types/tarea'
import { etiquetaEstado } from '@/lib/types/tarea'
import { cn } from '@/lib/utils'
import { parseFechaLocal } from '@/lib/utils/fecha-santiago'

const prioridadColor = { alta: 'destructive', media: 'secondary', baja: 'outline' } as const

interface TareaDetalleProps {
  tarea: TareaConResponsables
  initialSubtareas: Subtarea[]
}

export function TareaDetalle({ tarea, initialSubtareas }: TareaDetalleProps) {
  const router = useRouter()
  const [subtareas, setSubtareas] = useState<Subtarea[]>(initialSubtareas)
  const [nuevaSubtarea, setNuevaSubtarea] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [addingSubtarea, setAddingSubtarea] = useState(false)

  async function handleEdit(data: TareaInsert) {
    const res = await fetch(`/api/tareas/${tarea.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error()
    toast.success('Tarea actualizada')
    router.refresh()
  }

  async function handleMoverAPapelera() {
    await fetch(`/api/tareas/${tarea.id}/papelera`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'mover' }),
    })
    toast.success('Tarea movida a la papelera')
    router.push('/tareas')
  }

  async function handleRestaurar() {
    await fetch(`/api/tareas/${tarea.id}/papelera`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'restaurar' }),
    })
    toast.success('Tarea restaurada')
    router.refresh()
  }

  async function handleDeleteDefinitivo() {
    if (!confirm('¿Eliminar esta tarea para siempre? No se puede deshacer.')) return
    await fetch(`/api/tareas/${tarea.id}`, { method: 'DELETE' })
    toast.success('Tarea eliminada para siempre')
    router.push('/tareas')
  }

  async function handleAddSubtarea() {
    if (!nuevaSubtarea.trim()) return
    setAddingSubtarea(true)
    const res = await fetch('/api/subtareas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tarea_id: tarea.id, descripcion: nuevaSubtarea.trim(), orden: subtareas.length }),
    })
    if (res.ok) {
      const nueva = await res.json()
      setSubtareas((p) => [...p, nueva])
      setNuevaSubtarea('')
    } else {
      toast.error('Error al agregar subtarea')
    }
    setAddingSubtarea(false)
  }

  async function handleToggleSubtarea(id: string, completada: boolean) {
    setSubtareas((p) => p.map((s) => s.id === id ? { ...s, completada } : s))
    const res = await fetch(`/api/subtareas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completada }),
    })
    if (!res.ok) {
      setSubtareas(initialSubtareas)
      toast.error('Error al actualizar subtarea')
    }
  }

  async function handleDeleteSubtarea(id: string) {
    setSubtareas((p) => p.filter((s) => s.id !== id))
    await fetch(`/api/subtareas/${id}`, { method: 'DELETE' })
  }

  const completadas = subtareas.filter((s) => s.completada).length

  return (
    <div>
      {/* Back */}
      {/* Metadato de navegación: va en muted, y al hover sube a primary para dar feedback claro */}
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-[var(--tx-ink-muted)] hover:text-[var(--tx-ink-primary)] mb-6">
        <ArrowLeft size={14} />
        Volver
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <h1 className="text-xl font-bold text-[var(--tx-ink-primary)] leading-snug">{tarea.titulo}</h1>
        <div className="flex items-center gap-2 shrink-0">
          {tarea.eliminado_at ? (
            <>
              <Button variant="outline" size="sm" onClick={handleRestaurar}>
                <RotateCcw size={13} className="mr-1.5" />
                Restaurar
              </Button>
              <Button variant="outline" size="sm" onClick={handleDeleteDefinitivo} className="text-red-600 hover:text-red-700">
                <Trash2 size={13} className="mr-1.5" />
                Eliminar para siempre
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil size={13} className="mr-1.5" />
                Editar
              </Button>
              <Button variant="outline" size="sm" onClick={handleMoverAPapelera} className="text-red-600 hover:text-red-700">
                <Trash2 size={13} />
              </Button>
            </>
          )}
        </div>
      </div>

      {tarea.eliminado_at && (
        <div
          className="flex items-center gap-2 text-sm rounded-lg px-3 py-2 mb-6"
          style={{ background: 'oklch(63% 0.21 22 / 8%)', color: 'oklch(72% 0.17 22)', border: '1px solid oklch(63% 0.21 22 / 25%)' }}
        >
          <Trash2 size={14} />
          Esta tarea esta en la papelera desde el {format(new Date(tarea.eliminado_at), "d 'de' MMMM, HH:mm", { locale: es })}.
        </div>
      )}

      {/* Meta */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Badge variant="secondary">{etiquetaEstado(tarea.estado)}</Badge>
        <Badge variant={prioridadColor[tarea.prioridad]}>{tarea.prioridad}</Badge>
        <Badge variant="outline">{tarea.tipo}</Badge>
        <Badge variant="outline">Esfuerzo: {tarea.esfuerzo}</Badge>
        {tarea.fecha_limite && (
          <Badge variant="outline">
            Límite: {format(parseFechaLocal(tarea.fecha_limite), 'd MMM yyyy', { locale: es })}
          </Badge>
        )}
      </div>

      {/* Descripción: contenido que hay que leer, no un metadato, por eso va en secundario y no en muted */}
      {tarea.descripcion && (
        <p className="text-sm text-[var(--tx-ink-secondary)] mb-6 leading-relaxed">{tarea.descripcion}</p>
      )}

      <Separator className="mb-6" />

      {/* Subtareas */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[var(--tx-ink-primary)]">
            Subtareas {subtareas.length > 0 && `(${completadas}/${subtareas.length})`}
          </h2>
        </div>

        {/* Progress bar: fondo con opacidad baja de superficie y relleno con verde semántico de éxito */}
        {subtareas.length > 0 && (
          <div className="h-1.5 bg-white/[0.038] rounded-full mb-4 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ background: 'oklch(72% .17 145)', width: `${(completadas / subtareas.length) * 100}%` }}
            />
          </div>
        )}

        <div className="space-y-2 mb-4">
          {subtareas.map((s) => (
            <div key={s.id} className="flex items-center gap-3 group">
              <Checkbox
                checked={s.completada}
                onCheckedChange={(v) => handleToggleSubtarea(s.id, v as boolean)}
              />
              <span className={cn('text-sm flex-1', s.completada && 'line-through text-[var(--tx-ink-muted)]')}>
                {s.descripcion}
              </span>
              <button
                onClick={() => handleDeleteSubtarea(s.id)}
                className="opacity-0 group-hover:opacity-100 text-[var(--tx-ink-muted)] hover:text-red-400 transition-opacity"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>

        {/* Add subtarea */}
        <div className="flex gap-2">
          <Input
            placeholder="Agregar subtarea..."
            value={nuevaSubtarea}
            onChange={(e) => setNuevaSubtarea(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddSubtarea()}
            className="text-sm"
          />
          <Button size="sm" variant="outline" onClick={handleAddSubtarea} disabled={addingSubtarea || !nuevaSubtarea.trim()}>
            <Plus size={14} />
          </Button>
        </div>
      </div>

      <TareaForm open={editOpen} onOpenChange={setEditOpen} tarea={tarea} onSubmit={handleEdit} />
    </div>
  )
}
