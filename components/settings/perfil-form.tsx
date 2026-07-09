'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, Clock, Bell, Palette, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  PALETA_CALENDARIO,
  NOTIFICACIONES_LABELS,
  DIAS_SEMANA,
  type Integrante,
  type HorarioDia,
  type Notificaciones,
} from '@/lib/types/integrante'
import { cn } from '@/lib/utils'

interface PerfilFormProps {
  perfil: Integrante
  equipo: Pick<Integrante, 'id' | 'nombre' | 'color'>[]
}

function horarioInicial(guardado: HorarioDia[] | null): HorarioDia[] {
  if (guardado?.length === 7) return guardado
  return Array.from({ length: 7 }, (_, dia) => ({
    dia,
    activo: dia >= 1 && dia <= 5,
    bloques: [{ inicio: '10:00', fin: '18:00' }],
  }))
}

export function PerfilForm({ perfil, equipo }: PerfilFormProps) {
  const router = useRouter()
  const [nombre, setNombre] = useState(perfil.nombre)
  const [especialidad, setEspecialidad] = useState(perfil.especialidad ?? '')
  const [telefono, setTelefono] = useState(perfil.telefono ?? '')
  const [color, setColor] = useState<string | null>(perfil.color)
  const [horario, setHorario] = useState<HorarioDia[]>(horarioInicial(perfil.horario))
  const [notifs, setNotifs] = useState<Partial<Notificaciones>>(
    Object.fromEntries(
      NOTIFICACIONES_LABELS.map(({ key }) => [key, perfil.notificaciones?.[key] ?? true])
    )
  )
  const [saving, setSaving] = useState(false)

  const coloresOcupados = new Map(
    equipo.filter((m) => m.color && m.id !== perfil.id).map((m) => [m.color!, m.nombre])
  )

  function setDia(dia: number, patch: Partial<HorarioDia>) {
    setHorario((prev) => prev.map((h) => (h.dia === dia ? { ...h, ...patch } : h)))
  }

  function setBloque(dia: number, idx: number, campo: 'inicio' | 'fin', valor: string) {
    setHorario((prev) =>
      prev.map((h) =>
        h.dia === dia
          ? { ...h, bloques: h.bloques.map((b, i) => (i === idx ? { ...b, [campo]: valor } : b)) }
          : h
      )
    )
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/perfil', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre,
          especialidad: especialidad || null,
          telefono: telefono || null,
          color,
          horario,
          notificaciones: notifs,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? 'Error al guardar')
        return
      }
      toast.success('Perfil actualizado')
      router.refresh()
    } catch {
      toast.error('Error al guardar el perfil')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Identidad */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><User size={16} /> Perfil</CardTitle>
          <CardDescription>Cómo te ve el resto del equipo</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nombre</Label>
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Especialidad / rol</Label>
              <Input value={especialidad} onChange={(e) => setEspecialidad(e.target.value)} placeholder="Ej: Frontend, Ventas" />
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Teléfono</Label>
              <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="+56 9..." />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={perfil.email} readOnly className="opacity-60 cursor-not-allowed" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Color de calendario */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Palette size={16} /> Color en el calendario</CardTitle>
          <CardDescription>
            Tu color identifica tus tareas, citas y disponibilidad. No se puede repetir entre integrantes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
            {PALETA_CALENDARIO.map((c) => {
              const dueno = coloresOcupados.get(c.hex)
              const seleccionado = color === c.hex
              return (
                <button
                  key={c.hex}
                  type="button"
                  disabled={Boolean(dueno)}
                  onClick={() => setColor(seleccionado ? null : c.hex)}
                  title={dueno ? `${c.nombre} — lo usa ${dueno}` : c.nombre}
                  className={cn(
                    'relative h-9 w-9 rounded-full flex items-center justify-center transition-transform',
                    dueno ? 'opacity-30 cursor-not-allowed' : 'hover:scale-110 cursor-pointer',
                    seleccionado && 'ring-2 ring-offset-2 ring-neutral-400'
                  )}
                  style={{ background: c.hex }}
                >
                  {seleccionado && <Check size={16} className="text-white drop-shadow" />}
                  {dueno && (
                    <span className="absolute -bottom-1 -right-1 text-[8px] font-bold bg-neutral-800 text-white rounded-full h-4 w-4 flex items-center justify-center">
                      {dueno[0]}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          {color && (
            <p className="text-xs text-neutral-500 mt-3">
              Color elegido: <strong>{PALETA_CALENDARIO.find((c) => c.hex === color)?.nombre}</strong>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Horario operativo */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Clock size={16} /> Tiempo operativo</CardTitle>
          <CardDescription>
            Fuera de este horario no recibes notificaciones push — se acumulan y llegan cuando vuelves.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {[1, 2, 3, 4, 5, 6, 0].map((dia) => {
            const h = horario.find((x) => x.dia === dia)!
            return (
              <div key={dia} className="flex items-center gap-3 text-sm">
                <Switch checked={h.activo} onCheckedChange={(v) => setDia(dia, { activo: v })} />
                <span className="w-9 font-medium text-neutral-700">{DIAS_SEMANA[dia]}</span>
                {h.activo ? (
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="time"
                      value={h.bloques[0]?.inicio ?? '10:00'}
                      onChange={(e) => setBloque(dia, 0, 'inicio', e.target.value)}
                      className="h-8 w-[104px] text-xs"
                    />
                    <span className="text-neutral-400">—</span>
                    <Input
                      type="time"
                      value={h.bloques[0]?.fin ?? '18:00'}
                      onChange={(e) => setBloque(dia, 0, 'fin', e.target.value)}
                      className="h-8 w-[104px] text-xs"
                    />
                  </div>
                ) : (
                  <span className="text-xs text-neutral-400">Offline</span>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* Notificaciones */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Bell size={16} /> Notificaciones</CardTitle>
          <CardDescription>Qué avisos quieres recibir</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {NOTIFICACIONES_LABELS.map(({ key, label, descripcion }) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-neutral-800">{label}</p>
                <p className="text-xs text-neutral-500">{descripcion}</p>
              </div>
              <Switch
                checked={notifs[key] ?? true}
                onCheckedChange={(v) => setNotifs((p) => ({ ...p, [key]: v }))}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || !nombre.trim()}>
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </Button>
      </div>
    </div>
  )
}
