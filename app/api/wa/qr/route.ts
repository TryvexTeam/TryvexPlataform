import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { obtenerEstadoQr } from '@/lib/wa/qr'

/**
 * GET /api/wa/qr
 *
 * Sirve el QR del agente de WhatsApp para el escaneo REMOTO: quien tiene el chip
 * no está en la máquina que corre el agente, así que entra logueado al CRM y
 * escanea desde acá.
 * La página de ajustes pinta el primer QR desde el servidor; este endpoint
 * alimenta el refresco (el código caduca cada ~20s).
 */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })
  }

  // Vincular el WhatsApp del negocio es una acción sensible: se exige integrante
  // activo, no solo una sesión cualquiera.
  const integrantes = new IntegrantesRepository(supabase)
  const perfil = await integrantes.getByAuthUser(user.id)
  if (!perfil) {
    return NextResponse.json(
      { success: false, error: 'Solo integrantes activos pueden vincular el WhatsApp del equipo' },
      { status: 403 }
    )
  }

  const data = await obtenerEstadoQr()
  return NextResponse.json({ success: true, data })
}
