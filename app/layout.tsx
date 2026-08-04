import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import { Toaster } from '@/components/ui/toaster'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PushProvider } from '@/components/layout/push-provider'
import './globals.css'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })

export const metadata: Metadata = {
  title: 'Tryvex App',
  description: 'Sistema operativo interno de Tryvex',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Tryvex' },
  icons: { apple: '/apple-touch-icon.png' },
}

export const viewport: Viewport = {
  themeColor: '#0f0f14',
  // Extiende la página bajo el notch. Exige compensar con env(safe-area-inset-*),
  // que es lo que hacen .pt-safe / .pb-safe en globals.css.
  viewportFit: 'cover',
  width: 'device-width',
  initialScale: 1,
  // Se deja llegar hasta 5x a propósito. Bloquear el zoom arregla el síntoma y
  // rompe la accesibilidad de quien necesita agrandar; el zoom molesto de iPhone
  // no es este, es el automático al enfocar un campo de menos de 16px — y eso se
  // corrige con el tamaño de fuente, no prohibiendo ampliar.
  maximumScale: 5,
  userScalable: true,
  // El teclado achica el área visible en vez de tapar el contenido: sin esto, al
  // escribir en el chat el campo queda debajo del teclado.
  interactiveWidget: 'resizes-content',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${geist.variable} h-full antialiased`}>
      <body className="h-full font-sans">
        <TooltipProvider>
          {children}
          <Toaster />
          <PushProvider />
        </TooltipProvider>
      </body>
    </html>
  )
}
