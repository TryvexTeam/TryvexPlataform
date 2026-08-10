'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ImageUp, Trash2 } from 'lucide-react'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'

interface FotoLandingUploaderProps {
  /** Foto de landing guardada, si la hay. */
  fotoInicial: string | null
  /** Avatar del CRM: es lo que se publica cuando no hay foto de landing. */
  avatarUrl: string | null
}

const MAX_MB = 5
const MIN_LADO = 400

/**
 * Foto para la ficha pública de tryvex.tech/team.
 *
 * Es un componente hermano de AvatarUploader y no una parametrización de aquel:
 * comparten el patrón de subida, pero casi nada de lo que se ve. El avatar se
 * previsualiza redondo con AvatarChat porque así se pinta en el chat, cae en
 * iniciales con color cuando no hay foto, y no tiene mínimo de píxeles. Esta foto
 * se previsualiza rectangular como en la web, cae en el avatar (no en iniciales)
 * cuando está vacía, y su razón de existir es justamente el mínimo de resolución.
 * Volver configurables la forma, el componente de preview, el vacío, los textos y
 * la validación habría dejado un componente con más ramas que contenido.
 */
export function FotoLandingUploader({ fotoInicial, avatarUrl }: FotoLandingUploaderProps) {
  const router = useRouter()
  const entrada = useRef<HTMLInputElement>(null)
  const [foto, setFoto] = useState(fotoInicial)
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mostrada = foto ?? avatarUrl

  const subir = async (file: File) => {
    setError(null)

    if (file.size > MAX_MB * 1024 * 1024) {
      fallar(`La imagen supera los ${MAX_MB}MB`)
      return
    }

    // Se miden las dimensiones acá además de en el servidor: así el aviso llega
    // al instante y no después de subir varios MB para que los rechacen.
    const medidas = await medirEnElNavegador(file)
    if (medidas && (medidas.ancho < MIN_LADO || medidas.alto < MIN_LADO)) {
      fallar(
        `La foto es muy chica para la web: ${medidas.ancho}x${medidas.alto} px. ` +
          `El mínimo es ${MIN_LADO}x${MIN_LADO} px.`,
      )
      return
    }

    // Vista previa inmediata: subir puede tardar y la espera sin feedback se lee
    // como que no pasó nada.
    const previa = URL.createObjectURL(file)
    setFoto(previa)
    setTrabajando(true)

    try {
      const cuerpo = new FormData()
      cuerpo.append('file', file)
      const res = await fetch('/api/perfil/foto-landing', { method: 'POST', body: cuerpo })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? 'No se pudo subir la foto')

      setFoto(json.data.foto_landing_url as string)
      toast.success('Foto de la web actualizada')
      router.refresh()
    } catch (err) {
      setFoto(fotoInicial)
      fallar(err instanceof Error ? err.message : 'Error subiendo la foto')
    } finally {
      URL.revokeObjectURL(previa)
      setTrabajando(false)
      limpiarEntrada()
    }
  }

  const quitar = async () => {
    setError(null)
    setTrabajando(true)
    try {
      const res = await fetch('/api/perfil/foto-landing', { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? 'No se pudo quitar la foto')
      setFoto(null)
      toast.success('Foto quitada — la web vuelve a usar tu foto de perfil')
      router.refresh()
    } catch (err) {
      fallar(err instanceof Error ? err.message : 'Error quitando la foto')
    } finally {
      setTrabajando(false)
    }
  }

  /** El motivo se muestra en pantalla y no solo como toast: el toast se va solo. */
  function fallar(mensaje: string) {
    setError(mensaje)
    toast.error(mensaje)
    limpiarEntrada()
  }

  function limpiarEntrada() {
    if (entrada.current) entrada.current.value = ''
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-4">
        <div className="h-[88px] w-[88px] shrink-0 overflow-hidden rounded-lg bg-[var(--tx-surface-2,#f1f1f1)] grid place-items-center">
          {mostrada ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mostrada}
              alt="Vista previa de la foto que se publica en la web"
              className="h-full w-full object-cover"
            />
          ) : (
            <ImageUp size={22} className="text-[var(--tx-ink-muted)]" aria-hidden />
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => entrada.current?.click()}
              disabled={trabajando}
            >
              {trabajando ? 'Subiendo…' : foto ? 'Cambiar foto de la web' : 'Subir foto para la web'}
            </Button>
            {foto && (
              <Button size="sm" variant="ghost" onClick={quitar} disabled={trabajando}>
                <Trash2 size={14} className="mr-1.5" />
                Quitar
              </Button>
            )}
          </div>
          <p className="text-[11px] text-[var(--tx-ink-muted)]">
            Opcional. Si no subes una, en la web se usa tu foto de perfil. Conviene al menos{' '}
            {MIN_LADO}×{MIN_LADO} px: en tryvex.tech se muestra mucho más grande que en el chat.
            jpg, png, webp o gif · hasta {MAX_MB}MB.
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-xs font-medium text-[var(--tx-danger,#c0392b)]">
          {error}
        </p>
      )}

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

/**
 * Dimensiones según el propio navegador. Devuelve null si la imagen no se puede
 * decodificar acá: en ese caso decide el servidor, que es quien manda.
 */
function medirEnElNavegador(file: File): Promise<{ ancho: number; alto: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ ancho: img.naturalWidth, alto: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.src = url
  })
}
