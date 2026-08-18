'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from '@/lib/toast'
import { Check, Clock, Bell, Palette, User, Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  PALETA_CALENDARIO,
  NOTIFICACIONES_LABELS,
  DIAS_SEMANA,
  CATEGORIAS_EQUIPO,
  type Integrante,
  type HorarioDia,
  type Notificaciones,
} from '@/lib/types/integrante'
import { AvatarUploader } from './avatar-uploader'
import { FotoLandingUploader } from './foto-landing-uploader'
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
  const [bioCorta, setBioCorta] = useState(perfil.bio_corta ?? '')
  const [bio, setBio] = useState(perfil.bio ?? '')
  const [linkedin, setLinkedin] = useState(perfil.linkedin ?? '')
  const [portfolio, setPortfolio] = useState(perfil.portfolio ?? '')
  const [category, setCategory] = useState(perfil.category)
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
          bio_corta: bioCorta || null,
          bio: bio || null,
          linkedin: linkedin || null,
          portfolio: portfolio || null,
          category,
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
    // El max-w ya lo pone la pagina (settings/page.tsx), para que WhatsApp,
    // notificaciones y este formulario compartan el mismo ancho. Grilla de 2
    // columnas en pantalla grande en vez de una pila unica: son 5 tarjetas de
    // alto bien distinto, apiladas se leian como un formulario interminable
    // y dejaban medio ancho de la pantalla sin usar. Ficha publica ocupa las
    // dos columnas porque es la mas cargada (foto, dos textareas, 2 links).
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Identidad */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><User size={16} /> Perfil</CardTitle>
          <CardDescription>Cómo te ve el resto del equipo</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AvatarUploader nombre={nombre || perfil.nombre} color={color} avatarInicial={perfil.avatar_url} />

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
                    seleccionado && 'ring-2 ring-offset-2 ring-offset-[var(--tx-surface-1)] ring-[var(--tx-ink-primary)]'
                  )}
                  style={{ background: c.hex }}
                >
                  {seleccionado && <Check size={16} className="text-white drop-shadow" />}
                  {dueno && (
                    <span
                      className="absolute -bottom-1 -right-1 text-[8px] font-bold rounded-full h-4 w-4 flex items-center justify-center"
                      style={{ background: 'var(--tx-ink-primary)', color: 'var(--tx-bg-primary)' }}
                    >
                      {dueno[0]}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          {color && (
            <p className="text-xs text-[var(--tx-ink-muted)] mt-3">
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
                <span className="w-9 font-medium text-[var(--tx-ink-secondary)]">{DIAS_SEMANA[dia]}</span>
                {h.activo ? (
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="time"
                      value={h.bloques[0]?.inicio ?? '10:00'}
                      onChange={(e) => setBloque(dia, 0, 'inicio', e.target.value)}
                      className="h-8 w-[104px] text-xs"
                    />
                    <span className="text-[var(--tx-ink-muted)]">—</span>
                    <Input
                      type="time"
                      value={h.bloques[0]?.fin ?? '18:00'}
                      onChange={(e) => setBloque(dia, 0, 'fin', e.target.value)}
                      className="h-8 w-[104px] text-xs"
                    />
                  </div>
                ) : (
                  <span className="text-xs text-[var(--tx-ink-muted)]">Offline</span>
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
                <p className="text-sm font-medium text-[var(--tx-ink-primary)]">{label}</p>
                <p className="text-xs text-[var(--tx-ink-muted)]">{descripcion}</p>
              </div>
              <Switch
                checked={notifs[key] ?? true}
                onCheckedChange={(v) => setNotifs((p) => ({ ...p, [key]: v }))}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Ficha pública en tryvex.tech */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Globe size={16} /> Ficha pública</CardTitle>
          <CardDescription>
            Se muestra en tryvex.tech/team mientras tu perfil esté activo. Tu foto y nombre ya salen ahí; esto es lo demás.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Foto para la web</Label>
            <FotoLandingUploader fotoInicial={perfil.foto_landing_url} avatarUrl={perfil.avatar_url} />
          </div>
          <div className="space-y-1.5">
            <Label>Bio corta (una línea, máx. 160)</Label>
            <Input value={bioCorta} onChange={(e) => setBioCorta(e.target.value)} maxLength={160} placeholder="Ej: Construye la parte que se ve" />
          </div>
          <div className="space-y-1.5">
            <Label>Bio</Label>
            <Textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={2000} rows={4} placeholder="Un par de párrafos sobre vos" />
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>LinkedIn</Label>
              <Input value={linkedin} onChange={(e) => setLinkedin(e.target.value)} placeholder="https://linkedin.com/in/..." />
            </div>
            <div className="space-y-1.5">
              <Label>Portfolio</Label>
              <Input value={portfolio} onChange={(e) => setPortfolio(e.target.value)} placeholder="https://..." />
            </div>
          </div>
          <div className="space-y-1.5 max-w-[220px]">
            <Label>Categoría</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIAS_EQUIPO.map((c) => (
                  <SelectItem key={c} value={c}>{c === 'core' ? 'Core' : 'Engineering'}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="lg:col-span-2 flex justify-end">
        <Button onClick={handleSave} disabled={saving || !nombre.trim()}>
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </Button>
      </div>
    </div>
  )
}
