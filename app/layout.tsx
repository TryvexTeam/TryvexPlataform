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
  // Bloquear el zoom viola WCAG 1.4.4. El zoom-al-enfocar de iOS se evita con
  // font-size >= 16px en los inputs (.search input, .field__input input,
  // .tp__desc textarea y demás en globals.css bajo @media max-width: 768px),
  // no capando el pinch-zoom.
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
