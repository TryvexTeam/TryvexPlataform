import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { RecuperacionRepository } from '@/lib/repos/recuperacion'
import { RecuperarPasswordSchema } from '@/lib/types/auth'
import { enviarEmailRecuperarPassword } from '@/lib/email/recuperar-password'

/**
 * Endpoint público: pide un link de recuperación.
 *
 * Tres decisiones que no son negociables aquí:
 *
 * 1. La respuesta es SIEMPRE la misma, exista o no la cuenta. Si respondiéramos
 *    distinto, este endpoint se volvería un verificador de correos: cualquiera podría
 *    averiguar quién tiene cuenta en Tryvex probando direcciones.
 * 2. El rate limit vive en la base, no en memoria. En serverless cada invocación tiene
 *    su propia memoria, así que un contador local no limita nada.
 * 3. El link se genera con service_role y viaja por correo. Nunca vuelve en la
 *    respuesta HTTP: si volviera, bastaría con pedirlo para entrar a cualquier cuenta.
 */

const LIMITE_POR_EMAIL = 3
const LIMITE_POR_IP = 10
const VENTANA_MINUTOS = 60

const RESPUESTA_GENERICA = {
  success: true,
  data: { mensaje: 'Si el correo corresponde a una cuenta, te llegará un link en unos minutos.' },
}

function ipDeLaSolicitud(req: NextRequest): string | null {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return req.headers.get('x-real-ip')
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Cuerpo inválido' }, { status: 400 })
  }

  const parsed = RecuperarPasswordSchema.safeParse(body)
  // Un email mal escrito sí se reporta: no revela nada sobre quién tiene cuenta.
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Email inválido' }, { status: 400 })
  }

  const { email } = parsed.data
  const ip = ipDeLaSolicitud(req)
  const repo = new RecuperacionRepository(createAdminClient())
  const desde = new Date(Date.now() - VENTANA_MINUTOS * 60_000).toISOString()

  let intentos: { porEmail: number; porIp: number }
  try {
    intentos = await repo.contarIntentos(email, ip, desde)
  } catch (e) {
    // Un rate limit que se cae abierto es lo mismo que no tenerlo: se corta.
    console.error('[auth/recuperar] no se pudo consultar el rate limit', e)
    return NextResponse.json(
      { success: false, error: 'No se pudo procesar la solicitud. Intenta más tarde.' },
      { status: 503 },
    )
  }

  if (intentos.porEmail >= LIMITE_POR_EMAIL || intentos.porIp >= LIMITE_POR_IP) {
    return NextResponse.json(
      { success: false, error: 'Demasiados intentos. Espera una hora antes de volver a pedirlo.' },
      { status: 429 },
    )
  }

  await repo.registrarIntento(email, ip)

  // Un ex-integrante desactivado no debe poder recuperar el acceso por su cuenta.
  const integrante = await repo.buscarIntegrantePorEmail(email)
  if (!integrante || !integrante.activo) {
    return NextResponse.json(RESPUESTA_GENERICA)
  }

  const hashedToken = await repo.generarTokenRecuperacion(integrante.email)
  if (!hashedToken) {
    // Se registra en el log, pero para quien pregunta el resultado es el mismo.
    return NextResponse.json(RESPUESTA_GENERICA)
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin
  const link = `${baseUrl}/auth/confirmar?token_hash=${encodeURIComponent(hashedToken)}&type=recovery`

  try {
    await enviarEmailRecuperarPassword({ email: integrante.email, link })
  } catch (e) {
    console.error('[auth/recuperar] Resend falló', e)
  }

  return NextResponse.json(RESPUESTA_GENERICA)
}
