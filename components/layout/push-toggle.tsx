'use client'

import { useEffect, useState } from 'react'
import { BellIcon, BellOffIcon, BellRingIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import { base64UrlToUint8Array } from './push-provider'

type Estado = 'cargando' | 'no_soportado' | 'bloqueado' | 'activo' | 'inactivo'

/** Activa/desactiva las notificaciones push de este dispositivo. */
export function PushToggle() {
  const [estado, setEstado] = useState<Estado>('cargando')
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    let vigente = true

    const detectar = async () => {
      const soportado = 'serviceWorker' in navigator && 'PushManager' in window
      if (!soportado) return 'no_soportado' as const
      if (Notification.permission === 'denied') return 'bloqueado' as const
      try {
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        return sub ? ('activo' as const) : ('inactivo' as const)
      } catch {
        return 'inactivo' as const
      }
    }

    detectar().then((resultado) => {
      if (vigente) setEstado(resultado)
    })

    return () => {
      vigente = false
    }
  }, [])

  const activar = async () => {
    setOcupado(true)
    try {
      const permiso = await Notification.requestPermission()
      if (permiso !== 'granted') {
        setEstado(permiso === 'denied' ? 'bloqueado' : 'inactivo')
        toast.error('Permiso de notificaciones denegado')
        return
      }

      const clave = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!clave) {
        toast.error('Falta configurar la llave VAPID en el servidor')
        return
      }

      const reg = await navigator.serviceWorker.ready
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(clave),
        }))

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      })
      if (!res.ok) throw new Error('No se pudo guardar la suscripción')

      setEstado('activo')
      toast.success('Notificaciones activadas en este dispositivo')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error activando notificaciones')
    } finally {
      setOcupado(false)
    }
  }

  const desactivar = async () => {
    setOcupado(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setEstado('inactivo')
      toast.success('Notificaciones desactivadas en este dispositivo')
    } catch {
      toast.error('No se pudo desactivar')
    } finally {
      setOcupado(false)
    }
  }

  if (estado === 'cargando') return null

  if (estado === 'no_soportado') {
    return <p className="text-[13px] text-[var(--tx-ink-muted)]">Este navegador no soporta notificaciones push.</p>
  }

  if (estado === 'bloqueado') {
    return (
      <p className="text-[13px] text-[var(--tx-ink-muted)] flex items-center gap-2">
        <BellOffIcon className="size-4" />
        Notificaciones bloqueadas en el navegador. Habilítalas desde el candado de la barra de direcciones.
      </p>
    )
  }

  return (
    <Button
      variant={estado === 'activo' ? 'secondary' : 'default'}
      size="sm"
      disabled={ocupado}
      onClick={estado === 'activo' ? desactivar : activar}
    >
      {estado === 'activo' ? <BellRingIcon className="size-4" /> : <BellIcon className="size-4" />}
      {estado === 'activo' ? 'Notificaciones activas' : 'Activar notificaciones'}
    </Button>
  )
}
