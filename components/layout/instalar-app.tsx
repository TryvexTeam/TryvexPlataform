'use client'

import { useEffect, useState } from 'react'
import { DownloadIcon, CheckIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * Botón para instalar Tryvex como app. Chrome/Edge emiten `beforeinstallprompt`
 * cuando la PWA es instalable; iOS no lo emite, ahí se explica el camino manual.
 */
export function InstalarApp() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [instalada, setInstalada] = useState(false)

  useEffect(() => {
    // Fuera del cuerpo síncrono del efecto: evita el render en cascada.
    const modo = window.matchMedia('(display-mode: standalone)')
    queueMicrotask(() => setInstalada(modo.matches))

    const onPrompt = (e: Event) => {
      e.preventDefault()
      setPrompt(e as BeforeInstallPromptEvent)
    }
    const onInstalada = () => {
      setInstalada(true)
      setPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalada)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalada)
    }
  }, [])

  if (instalada) {
    return (
      <p className="text-[13px] text-[var(--tx-ink-muted)] flex items-center gap-2">
        <CheckIcon className="size-4" />
        Tryvex está instalada en este dispositivo.
      </p>
    )
  }

  if (!prompt) {
    return (
      <p className="text-[13px] text-[var(--tx-ink-muted)]">
        Si no aparece el botón, instálala desde el menú del navegador: <strong>Instalar Tryvex</strong>.
        En iPhone: Compartir → Añadir a pantalla de inicio.
      </p>
    )
  }

  return (
    <Button
      size="sm"
      onClick={async () => {
        await prompt.prompt()
        const { outcome } = await prompt.userChoice
        if (outcome === 'accepted') setInstalada(true)
        setPrompt(null)
      }}
    >
      <DownloadIcon className="size-4" />
      Instalar Tryvex
    </Button>
  )
}
