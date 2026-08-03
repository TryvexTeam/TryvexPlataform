'use client'

import { useEffect } from 'react'

/**
 * Registra el service worker (habilita instalar la app) y, si el integrante ya
 * concedió permiso de notificaciones, renueva su suscripción push en silencio.
 * El pedido de permiso NO se hace aquí: va por el botón de ajustes, porque
 * Chrome descarta prompts que no nacen de un gesto del usuario.
 */
export function PushProvider() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

    let cancelado = false

    const registrar = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
        if (cancelado) return

        if (!('PushManager' in window) || Notification.permission !== 'granted') return

        const clave = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
        if (!clave) return

        const existente = await reg.pushManager.getSubscription()
        const sub =
          existente ??
          (await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: base64UrlToUint8Array(clave),
          }))

        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sub.toJSON()),
        })
      } catch (err) {
        console.error('[push] registro', err instanceof Error ? err.message : err)
      }
    }

    registrar()
    return () => {
      cancelado = true
    }
  }, [])

  return null
}

/** La clave VAPID viaja en base64url; PushManager la pide como bytes. */
export function base64UrlToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  // ArrayBuffer explícito: PushManager exige ArrayBufferView<ArrayBuffer>, no SharedArrayBuffer.
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}
