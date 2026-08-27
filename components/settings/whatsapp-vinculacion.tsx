'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import {
  Ban,
  CheckCircle2,
  Loader2,
  QrCode,
  RefreshCw,
  ShieldAlert,
  WifiOff,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { EstadoQr, ResultadoQr } from '@/lib/wa/qr'

/** El QR de WhatsApp caduca solo cada ~20s: se refresca un poco antes. */
const POLL_MS = 15000

/**
 * Estados en los que seguir preguntando no sirve de nada.
 *
 * `conectado` porque ya no hay nada que escanear, y `posible_baneo` porque ahí
 * insistir es parte del problema: reintentar contra una cuenta sancionada es lo
 * que convierte un baneo temporal en permanente.
 */
const ESTADOS_SIN_POLLING: ReadonlySet<EstadoQr> = new Set(['conectado', 'posible_baneo'])

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
 * corre el agente, así que entra logueado acá y escanea. El token del agente
 * nunca llega al navegador — lo resuelve el servidor.
 */
export function WhatsappVinculacion({ inicial }: WhatsappVinculacionProps) {
  const [estado, setEstado] = useState<EstadoQr>(inicial.estado)
  const [imagen, setImagen] = useState<string | null>(inicial.imagen ?? null)
  const [telefono, setTelefono] = useState<string | null>(inicial.telefono ?? null)
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
          setTelefono(body.data.telefono ?? null)
        }
      }

      if (resHealth.ok) setBridge(await resHealth.json())
    } catch {
      setEstado('sin_respuesta')
    } finally {
      setRefrescando(false)
    }
  }, [])

  // El primer estado viene del servidor, así que no hace falta cargar al montar.
  useEffect(() => {
    if (ESTADOS_SIN_POLLING.has(estado)) return
    const id = setInterval(() => cargar(), POLL_MS)
    return () => clearInterval(id)
  }, [estado, cargar])

  const baneado = estado === 'posible_baneo'
  // Un baneo manda sobre cualquier señal de salud: el puente puede reportar
  // sesión lista mientras WhatsApp ya rechazó la cuenta.
  const conectado = !baneado && (estado === 'conectado' || bridge?.sesionLista === true)

  const contenido = useMemo(
    () => cuerpoPara({ estado, imagen, conectado, baneado }),
    [estado, imagen, conectado, baneado]
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <QrCode size={18} className="text-emerald-600" />
          WhatsApp del equipo
        </CardTitle>
        <CardDescription>
          Vinculá el número que usa el CRM para escribirle a los leads. Se escanea una sola vez;
          la sesión queda guardada en el agente.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-block h-2 w-2 rounded-full',
              baneado ? 'bg-red-500' : conectado ? 'bg-emerald-500' : 'bg-amber-500'
            )}
            aria-hidden
          />
          <p className="text-sm text-[var(--tx-ink-secondary)]">
            {baneado
              ? 'Número rechazado por WhatsApp'
              : conectado
                ? 'Sesión conectada'
                : 'Sesión sin vincular'}
            {telefono && !baneado && (
              <span className="text-[var(--tx-ink-muted)]"> · {telefono}</span>
            )}
            {typeof bridge?.colaPendiente === 'number' && bridge.colaPendiente > 0 && (
              <span className="text-[var(--tx-ink-muted)]"> · {bridge.colaPendiente} en cola</span>
            )}
          </p>
        </div>

        {contenido}

        <Button
          variant="outline"
          size="sm"
          onClick={() => cargar(true)}
          disabled={refrescando || baneado}
        >
          <RefreshCw size={13} className={cn('mr-1.5', refrescando && 'animate-spin')} />
          Actualizar
        </Button>
      </CardContent>
    </Card>
  )
}

interface CuerpoArgs {
  estado: EstadoQr
  imagen: string | null
  conectado: boolean
  baneado: boolean
}

/**
 * Qué se muestra para cada estado.
 *
 * Está fuera del componente y devuelve un solo nodo porque antes era una cadena
 * de ternarios anidados: agregar un estado obligaba a insertar una rama en el
 * medio, y el orden entre ramas escondía cuál ganaba.
 */
function cuerpoPara({ estado, imagen, conectado, baneado }: CuerpoArgs) {
  // El baneo se evalúa primero: es el único estado ante el cual la acción
  // correcta NO es reintentar ni reescanear.
  if (baneado) {
    return (
      <Mensaje
        tono="critico"
        icono={<Ban size={18} className="text-red-500" />}
        titulo="WhatsApp rechazó este número"
        detalle={
          'No reescanees ni vincules otro número desde el mismo servidor: es así como se ' +
          'queman números en cadena. Primero hay que apelar desde la app (Ajustes → Ayuda → ' +
          'Contáctanos) y revisar por dónde sale la conexión del agente.'
        }
      />
    )
  }

  if (conectado) {
    return (
      <Mensaje
        icono={<CheckCircle2 size={18} className="text-emerald-600" />}
        titulo="Ya está vinculado"
        detalle="No hace falta escanear nada. Los mensajes salen y entran por este número."
      />
    )
  }

  if (estado === 'qr_listo' && imagen) {
    return (
      <div className="flex flex-col items-center gap-3 py-2">
        {/* El data URL viene del agente, ya resuelto en el servidor. */}
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
    )
  }

  switch (estado) {
    case 'esperando_qr':
      return (
        <Mensaje
          icono={<Loader2 size={18} className="animate-spin text-[var(--tx-ink-muted)]" />}
          titulo="Generando el código"
          detalle="El agente está arrancando. El QR aparece en unos segundos."
        />
      )

    case 'no_configurado':
      return (
        <Mensaje
          icono={<ShieldAlert size={18} className="text-amber-500" />}
          titulo="El agente no está configurado"
          detalle="Faltan VEX_AGENT_URL y VEX_AGENT_TOKEN en el entorno del CRM."
        />
      )

    case 'token_invalido':
      return (
        <Mensaje
          icono={<ShieldAlert size={18} className="text-red-500" />}
          titulo="El agente rechazó la credencial"
          detalle={
            'VEX_AGENT_TOKEN no coincide con el TRYVEX_AGENT_TOKEN del agente, o el agente ' +
            'está corriendo sin sus credenciales de panel y se cerró solo.'
          }
        />
      )

    case 'sin_respuesta':
      return (
        <Mensaje
          icono={<WifiOff size={18} className="text-red-500" />}
          titulo="El agente no responde"
          detalle="No se pudo contactar al agente de WhatsApp. Revisá que el servicio esté arriba."
        />
      )

    default:
      return (
        <Mensaje
          icono={<Loader2 size={18} className="animate-spin text-[var(--tx-ink-muted)]" />}
          titulo="Consultando el agente"
          detalle="Un momento."
        />
      )
  }
}

interface MensajeProps {
  icono: React.ReactNode
  titulo: string
  detalle: string
  /** `critico` resalta el recuadro: se usa solo para lo que exige actuar. */
  tono?: 'normal' | 'critico'
}

function Mensaje({ icono, titulo, detalle, tono = 'normal' }: MensajeProps) {
  const critico = tono === 'critico'
  return (
    <div
      className="flex items-start gap-3 rounded-lg p-4"
      style={{
        border: critico ? '1px solid var(--tx-danger, #ef4444)' : '1px solid var(--tx-border)',
        background: critico ? 'color-mix(in srgb, #ef4444 8%, transparent)' : 'var(--tx-surface-2)',
      }}
    >
      <div className="mt-0.5 shrink-0">{icono}</div>
      <div>
        <p className="text-sm font-medium text-[var(--tx-ink-primary)]">{titulo}</p>
        <p className="text-xs text-[var(--tx-ink-muted)] mt-0.5">{detalle}</p>
      </div>
    </div>
  )
}
