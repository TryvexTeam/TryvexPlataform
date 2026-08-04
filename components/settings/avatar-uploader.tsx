'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Trash2 } from 'lucide-react'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { AvatarChat } from '@/components/chat/avatar-chat'

interface AvatarUploaderProps {
  nombre: string
  color: string | null
  avatarInicial: string | null
}

const MAX_MB = 5

/**
 * Foto de perfil. Es la misma que aparece al costado de cada mensaje del chat,
 * así que se previsualiza con el mismo componente que la va a pintar allá.
 */
export function AvatarUploader({ nombre, color, avatarInicial }: AvatarUploaderProps) {
  const router = useRouter()
  const entrada = useRef<HTMLInputElement>(null)
  const [avatar, setAvatar] = useState(avatarInicial)
  const [trabajando, setTrabajando] = useState(false)

  const subir = async (file: File) => {
    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`La imagen supera los ${MAX_MB}MB`)
      return
    }

    // Vista previa inmediata: subir puede tardar y la espera sin feedback se lee
    // como que no pasó nada.
    const previa = URL.createObjectURL(file)
    setAvatar(previa)
    setTrabajando(true)

    try {
      const cuerpo = new FormData()
      cuerpo.append('file', file)
      const res = await fetch('/api/perfil/avatar', { method: 'POST', body: cuerpo })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? 'No se pudo subir la foto')

      setAvatar(json.data.avatar_url as string)
      toast.success('Foto actualizada')
      router.refresh()
    } catch (err) {
      setAvatar(avatarInicial)
      toast.error(err instanceof Error ? err.message : 'Error subiendo la foto')
    } finally {
      URL.revokeObjectURL(previa)
      setTrabajando(false)
      if (entrada.current) entrada.current.value = ''
    }
  }

  const quitar = async () => {
    setTrabajando(true)
    try {
      const res = await fetch('/api/perfil/avatar', { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? 'No se pudo quitar la foto')
      setAvatar(null)
      toast.success('Foto quitada')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error quitando la foto')
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => entrada.current?.click()}
        disabled={trabajando}
        className="relative rounded-full group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tx-accent)]"
        aria-label="Cambiar foto de perfil"
      >
        <AvatarChat nombre={nombre} avatarUrl={avatar} color={color} size={72} />
        <span
          className="absolute inset-0 rounded-full grid place-items-center bg-black/50 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity"
          aria-hidden
        >
          <Camera size={20} className="text-white" />
        </span>
      </button>

      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => entrada.current?.click()} disabled={trabajando}>
            {trabajando ? 'Subiendo…' : avatar ? 'Cambiar' : 'Subir foto'}
          </Button>
          {avatar && (
            <Button size="sm" variant="ghost" onClick={quitar} disabled={trabajando}>
              <Trash2 size={14} className="mr-1.5" />
              Quitar
            </Button>
          )}
        </div>
        <p className="text-[11px] text-[var(--tx-ink-muted)]">
          jpg, png, webp o gif · hasta {MAX_MB}MB. Sin foto se muestran tus iniciales.
        </p>
      </div>

      <input
        ref={entrada}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) subir(file)
        }}
      />
    </div>
  )
}
