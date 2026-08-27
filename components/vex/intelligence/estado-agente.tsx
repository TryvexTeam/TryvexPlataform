import Link from 'next/link'
import { Ban, CheckCircle2, PauseCircle, QrCode, WifiOff } from 'lucide-react'
import type { EstadoQr, ResultadoQr } from '@/lib/wa/qr'

/**
 * Una línea con el estado real del agente, arriba de todo.
 *
 * Lo primero que alguien necesita saber al entrar acá es si el agente está
 * atendiendo. Un panel lleno de ajustes sobre un agente caído hace perder el
 * tiempo configurando algo que no está corriendo.
 */

interface EstadoAgenteProps {
  qr: ResultadoQr
  pausado: boolean
}

interface Presentacion {
  texto: string
  detalle: string
  color: string
  icono: React.ReactNode
  /** Cuando hace falta ir a otro lado a resolverlo. */
  accion?: { texto: string; href: string }
}

export function EstadoAgente({ qr, pausado }: EstadoAgenteProps) {
  const { texto, detalle, color, icono, accion } = presentar(qr.estado, pausado, qr.telefono)

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg px-4 py-3"
      style={{ border: `1px solid ${color}`, background: 'var(--tx-surface-1)' }}
    >
      <span style={{ color }} className="flex shrink-0 items-center">
        {icono}
      </span>
      <p className="text-sm font-medium text-[var(--tx-ink-primary)]">{texto}</p>
      <p className="text-xs text-[var(--tx-ink-muted)] flex-1 min-w-40">{detalle}</p>
      {accion && (
        <Link
          href={accion.href}
          className="text-xs font-medium text-[var(--tx-accent)] hover:underline shrink-0"
        >
          {accion.texto}
        </Link>
      )}
    </div>
  )
}

function presentar(estado: EstadoQr, pausado: boolean, telefono?: string): Presentacion {
  // El baneo va primero: no hay ajuste de esta pantalla que lo arregle, y
  // reintentar es parte del problema.
  if (estado === 'posible_baneo') {
    return {
      texto: 'WhatsApp rechazó el número',
      detalle:
        'No vincules otro número desde el mismo servidor: así se queman en cadena. Primero hay que apelar desde la app.',
      color: 'var(--tx-error)',
      icono: <Ban size={16} />,
    }
  }

  if (estado === 'conectado') {
    return pausado
      ? {
          texto: 'Conectado, pero en pausa',
          detalle: `${telefono ? `${telefono} · ` : ''}Los mensajes llegan y quedan guardados, pero el agente no contesta.`,
          color: 'var(--tx-warning)',
          icono: <PauseCircle size={16} />,
        }
      : {
          texto: 'Atendiendo',
          detalle: `${telefono ? `${telefono} · ` : ''}Responde a quien ya contestó el primer mensaje del equipo.`,
          color: 'var(--tx-success)',
          icono: <CheckCircle2 size={16} />,
        }
  }

  if (estado === 'qr_listo' || estado === 'esperando_qr') {
    return {
      texto: 'Sin vincular',
      detalle: 'Hay un código esperando que alguien lo escanee con el teléfono del número.',
      color: 'var(--tx-warning)',
      icono: <QrCode size={16} />,
      accion: { texto: 'Ir a vincular', href: '/settings/whatsapp' },
    }
  }

  return {
    texto: 'El agente no responde',
    detalle:
      estado === 'token_invalido'
        ? 'Rechazó la credencial del CRM, o está corriendo sin sus claves de acceso.'
        : 'No se pudo contactar al servicio. Los mensajes que envíe el equipo quedan en cola.',
    color: 'var(--tx-error)',
    icono: <WifiOff size={16} />,
  }
}
