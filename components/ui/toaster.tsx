'use client'

import { useTheme } from 'next-themes'
import { Toaster as Sileo } from 'sileo'
import 'sileo/styles.css'

/** Toasts con física (sileo). Reemplaza a sonner; la API la adapta lib/toast.ts */
export function Toaster() {
  const { theme = 'dark' } = useTheme()

  return (
    <Sileo
      position="top-right"
      theme={theme === 'light' ? 'light' : theme === 'system' ? 'system' : 'dark'}
      offset={{ top: 18, right: 18 }}
      options={{ duration: 4000, roundness: 14 }}
    />
  )
}
