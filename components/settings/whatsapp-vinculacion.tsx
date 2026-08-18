'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import { CheckCircle2, Loader2, QrCode, RefreshCw, ShieldAlert, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { EstadoQr, ResultadoQr } from '@/lib/wa/qr'

/** El QR de WhatsApp caduca solo cada ~20s: se refresca un poco antes. */
const POLL_MS = 15000

interface EstadoBridge {
  configurado: boolean
  sesionLista: boolean
  colaPendiente?: number
}

interface WhatsappVinculacionProps {
  /** Primer estado, resuelto en el servidor: el QR se ve sin esperar al cliente. */
  inicial: ResultadoQr
}

/**
 * Vinculación del número de WhatsApp del equipo desde el CRM.
 *
 * Existe para el escaneo REMOTO: quien tiene el chip no está en la máquina que
 * corre el wa-bridge, así que entra logueado acá y escanea. El token del bridge
 * nunca llega al navegador — lo resuelve el servidor.
 */
export function WhatsappVinculacion({ inicial }: WhatsappVinculacionProps) {
  const [estado, setEstado] = useState<EstadoQr>(inicial.estado)
  const [imagen, setImagen] = useState<string | null>(inicial.imagen ?? null)
  const [bridge, setBridge] = useState<EstadoBridge | null>(null)
  const [refrescando, setRefrescando] = useState(false)

  // `mostrarSpinner` solo en el refresco manual: en el automático (montaje y
  // polling) no se toca estado antes del await, para no encadenar renders.
  const cargar = useCallback(async (mostrarSpinner = false) => {
    if (mostrarSpinner) setRefrescando(true)
    try {
      const [resQr, resHealth] = await Promise.all([
        fetch('/api/wa/qr', { cache: 'no-store' }),
        fetch('/api/wa/health', { cache: 'no-store' }),
      ])

      if (resQr.ok) {
        const body = await resQr.json()
        if (body.data?.estado) {
          setEstado(body.data.estado)
          setImagen(body.data.imagen ?? null)
        }
      }

      if (resHealth.ok) setBridge(await resHealth.json())
    } catch {
      setEstado('sin_respuesta')
    } finally {
      setRefrescando(false)
    }
  }, [])

  // Deja de pedir el QR cuando ya está conectado: no hay nada que refrescar.
  // El primer estado viene del servidor, así que no hace falta cargar al montar.
  useEffect(() => {
    if (estado === 'conectado') return
    const id = setInterval(() => cargar(), POLL_MS)
    return () => clearInterval(id)
  }, [estado, cargar])

  const conectado = estado === 'conectado' || bridge?.sesionLista === true

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <QrCode size={18} className="text-emerald-600" />
          WhatsApp del equipo
        </CardTitle>
        <CardDescription>
          Vinculá el número que usa el CRM para escribirle a los leads. Se escanea una sola vez;
          la sesión queda guardada en el puente.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-block h-2 w-2 rounded-full',
              conectado ? 'bg-emerald-500' : 'bg-amber-500'
            )}
            aria-hidden
          />
          <p className="text-sm text-[var(--tx-ink-secondary)]">
            {conectado ? 'Sesión conectada' : 'Sesión sin vincular'}
            {typeof bridge?.colaPendiente === 'number' && bridge.colaPendiente > 0 && (
              <span className="text-[var(--tx-ink-muted)]">
                {' '}
                · {bridge.colaPendiente} en cola
              </span>
            )}
          </p>
        </div>

        {conectado ? (
          <Mensaje
            icono={<CheckCircle2 size={18} className="text-emerald-600" />}
            titulo="Ya está vinculado"
            detalle="No hace falta escanear nada. Los mensajes salen y entran por este número."
          />
        ) : estado === 'qr_listo' && imagen ? (
          <div className="flex flex-col items-center gap-3 py-2">
            {/* El data URL viene del bridge ya resuelto en el servidor. */}
            <Image
              src={imagen}
              alt="Código QR para vincular WhatsApp"
              width={260}
              height={260}
              unoptimized
              className="rounded-lg"
              style={{ border: '1px solid var(--tx-border)' }}
            />
            <p className="text-xs text-[var(--tx-ink-muted)] text-center max-w-sm">
              En el teléfono del número de Tryvex: <strong>WhatsApp → Dispositivos vinculados →
              Vincular un dispositivo</strong>. El código se renueva solo cada 20 segundos.
            </p>
          </div>
        ) : estado === 'esperando_qr' ? (
          <Mensaje
            icono={<Loader2 size={18} className="animate-spin text-[var(--tx-ink-muted)]" />}
            titulo="Generando el código"
            detalle="El puente está arrancando. El QR aparece en unos segundos."
          />
        ) : estado === 'no_configurado' ? (
          <Mensaje
            icono={<ShieldAlert size={18} className="text-amber-500" />}
            titulo="El puente no está configurado"
            detalle="Faltan WA_BRIDGE_URL y WA_BRIDGE_QR_TOKEN en el entorno del CRM."
          />
        ) : estado === 'token_invalido' ? (
          <Mensaje
            icono={<ShieldAlert size={18} className="text-red-500" />}
            titulo="El puente rechazó la credencial"
            detalle="WA_BRIDGE_QR_TOKEN no coincide con el del puente. Hay que igualarlos."
          />
        ) : estado === 'sin_respuesta' ? (
          <Mensaje
            icono={<WifiOff size={18} className="text-red-500" />}
            titulo="El puente no responde"
            detalle="No se pudo contactar al wa-bridge. Revisá que el servicio esté arriba."
          />
        ) : (
          <Mensaje
            icono={<Loader2 size={18} className="animate-spin text-[var(--tx-ink-muted)]" />}
            titulo="Consultando el puente"
            detalle="Un momento."
          />
        )}

        <Button variant="outline" size="sm" onClick={() => cargar(true)} disabled={refrescando}>
          <RefreshCw size={13} className={cn('mr-1.5', refrescando && 'animate-spin')} />
          Actualizar
        </Button>
      </CardContent>
    </Card>
  )
}

interface MensajeProps {
  icono: React.ReactNode
  titulo: string
  detalle: string
}

function Mensaje({ icono, titulo, detalle }: MensajeProps) {
  return (
    <div
      className="flex items-start gap-3 rounded-lg p-4"
      style={{ border: '1px solid var(--tx-border)', background: 'var(--tx-surface-2)' }}
    >
      <div className="mt-0.5 shrink-0">{icono}</div>
      <div>
        <p className="text-sm font-medium text-[var(--tx-ink-primary)]">{titulo}</p>
        <p className="text-xs text-[var(--tx-ink-muted)] mt-0.5">{detalle}</p>
      </div>
    </div>
  )
}
