import { NextResponse, type NextRequest } from 'next/server'
import { obtenerAjustes, guardarAjuste, type ClaveAjuste } from '@/lib/vex/agente'
import { rechazarSiNoEsIntegrante, responderDelAgente } from '@/lib/vex/guardia'

export const dynamic = 'force-dynamic'

/** Ajustes que se pueden tocar desde Tryvex Intelligence. */
const CLAVES: ReadonlySet<string> = new Set<ClaveAjuste>([
  'model',
  'temperature',
  'paused',
  'buffer_seconds',
  'audio_enabled',
  'transcription_model',
  'vision_enabled',
  'vision_model',
  'seguimiento_horas',
])

/** GET /api/vex/agente/ajustes — cómo está configurado el agente ahora. */
export async function GET() {
  const rechazo = await rechazarSiNoEsIntegrante()
  if (rechazo) return rechazo

  return responderDelAgente(() => obtenerAjustes())
}

/**
 * POST /api/vex/agente/ajustes — cambia un ajuste, con efecto inmediato.
 *
 * Se valida la clave acá además de en el agente. No es redundancia inútil: el
 * agente acepta su propia lista, y sin este filtro el CRM le reenviaría
 * cualquier cosa que llegue del navegador.
 */
export async function POST(req: NextRequest) {
  const rechazo = await rechazarSiNoEsIntegrante()
  if (rechazo) return rechazo

  let cuerpo: { key?: string; value?: string }
  try {
    cuerpo = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'JSON inválido' }, { status: 400 })
  }

  const { key, value } = cuerpo
  if (!key || !CLAVES.has(key) || typeof value !== 'string') {
    return NextResponse.json(
      { success: false, error: 'Ese ajuste no se puede cambiar desde acá' },
      { status: 400 }
    )
  }

  return responderDelAgente(() => guardarAjuste(key as ClaveAjuste, value))
}
