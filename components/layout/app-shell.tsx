'use client'

import { useTheme } from '@/components/dashboard/theme-context'

export function AppShell({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme()
  return (
    <div
      className="flex h-screen overflow-hidden relative"
      style={{
        backgroundColor: theme.bgBase,
        isolation: 'isolate',
        transition: 'background-color 600ms ease',
      }}
    >
      {/* Background Image Layer */}
      {theme.bgType === 'image' && theme.bgImage && (
        <div
          className="absolute inset-0 pointer-events-none transition-all duration-700 ease-in-out"
          style={{
            backgroundImage: `url(${theme.bgImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            zIndex: 0,
            opacity: 0.45,
          }}
        />
      )}

      {/* Background Video Layer */}
      {theme.bgType === 'video' && theme.bgVideo && (
        <video
          key={theme.bgVideo}
          src={theme.bgVideo}
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover pointer-events-none transition-all duration-700 ease-in-out"
          style={{
            zIndex: 0,
            opacity: 0.35,
          }}
        />
      )}

      {/*
        Velo de legibilidad. Antes era
          radial-gradient(circle at center, transparent 35%, rgba(0,0,0,0.85) 100%)
        o sea TRANSPARENTE EN EL CENTRO. En un monitor ancho eso viñetea bonito
        porque el contenido queda a los lados; en un celular el contenido está
        justo en el centro, así que la protección cubría donde NO hay texto y
        dejaba desnudo donde sí lo hay. Cristian abrió una ficha desde el
        teléfono y la leía encima del dibujo del fondo.

        Ahora el centro también tiene velo: se mantiene el viñeteado (el centro
        sigue siendo más claro que los bordes) pero ya no llega a cero.
      */}
      {(theme.bgType === 'image' || theme.bgType === 'video') && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at center, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.62) 45%, rgba(0,0,0,0.88) 100%)',
            zIndex: 0,
          }}
        />
      )}

      {children}
    </div>
  )
}
