import 'server-only'

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { tokenCoincide, tokenDeCabecera, tokenExpirado } from '@/lib/agentes/token'
import { excedeLimite } from '@/lib/agentes/rate-limit'

/**
 * La puerta de las rutas de Intelligence para agentes.
 *
 * Mismo mecanismo que `/api/agentes/mensajes` y sus hermanas —Bearer token, hash
 * comparado en tiempo constante, límite por agente—, pero en un solo lugar. Esas
 * cinco rutas tienen hoy cada una su propia copia de `autenticar`; las rutas de
 * Intelligence usan esta, y unificar las otras queda como deuda aparte para no
 * tocar puertas que ya funcionan en producción dentro de este cambio.
 *
 * Usa service role porque un agente no tiene sesión de Supabase que representar.
 * Por eso cada ruta que lo usa tiene que acotar a mano el alcance: un agente solo
 * toca SUS encargos, SUS rutinas, SU consumo. Nunca los de otro.
 */

export interface AgenteAutenticado {
  id: string
  nombre: string
}

// El cliente admin no conoce las tablas nuevas de Intelligence en sus tipos
// generados; ver `lib/repos/tabla-encargos.ts` para el mismo desvío.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ClienteAdmin = any

interface FilaAgente {
  id: string
  nombre: string
  token_hash: string
  expira_at: string | null
}

/**
 * Devuelve el agente del token, o una respuesta de error lista para devolver.
 *
 * Nunca dice cuál de las condiciones falló (sin token, token desconocido,
 * expirado): esa diferencia le sirve a quien está probando tokens, no a quien
 * tiene uno válido.
 */
export async function autenticarAgente(
  req: Request,
): Promise<{ agente: AgenteAutenticado; admin: ClienteAdmin } | { error: NextResponse }> {
  const token = tokenDeCabecera(req)
  if (!token) return { error: noAutorizado() }

  const admin = createAdminClient() as ClienteAdmin
  const { data } = await admin
    .from('agentes')
    .select('id, nombre, token_hash, expira_at')
    .eq('activo', true)

  // Se recorren todos y se compara el hash: buscar por hash directo sería más
  // rápido, pero la consulta misma revelaría si el token existe.
  const fila = ((data ?? []) as FilaAgente[]).find((a) => tokenCoincide(token, a.token_hash))
  if (!fila || tokenExpirado(fila.expira_at)) return { error: noAutorizado() }

  const espera = excedeLimite(fila.id)
  if (espera !== null) {
    return {
      error: NextResponse.json(
        { success: false, error: 'Demasiadas solicitudes' },
        { status: 429, headers: { 'Retry-After': String(espera) } },
      ),
    }
  }

  // Esto ES el latido: cada llamada de un agente dice "sigo vivo". La Sala
  // deriva el estado de acá, así que no es un detalle cosmético.
  await admin.from('agentes').update({ ultimo_uso_at: new Date().toISOString() }).eq('id', fila.id)

  return { agente: { id: fila.id, nombre: fila.nombre }, admin }
}

function noAutorizado(): NextResponse {
  return NextResponse.json({ success: false, error: 'Token inválido' }, { status: 401 })
}

/** Error de validación con el primer problema legible, no el objeto de Zod entero. */
export function datosInvalidos(detalle: string): NextResponse {
  return NextResponse.json({ success: false, error: detalle }, { status: 400 })
}

/**
 * Lee el cuerpo como JSON exigiendo UTF-8 válido.
 *
 * `req.json()` reemplaza en silencio los bytes inválidos por "�", y el texto
 * queda guardado roto para siempre. Se vio en la prueba del 22-sep: un cliente
 * que mandó en Windows-1252 dejó "Revisi�n diaria" en la base, y como el nombre
 * ya no coincidía, además creó una rutina duplicada. Un agente mal configurado
 * tiene que enterarse con un error, no descubrirlo semanas después en pantalla.
 */
export async function leerJson(req: Request): Promise<{ cuerpo: unknown } | { error: NextResponse }> {
  let texto: string
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(await req.arrayBuffer())
  } catch {
    return {
      error: datosInvalidos(
        'El cuerpo no es UTF-8 válido. Envíe el JSON en UTF-8: las tildes llegarían rotas.',
      ),
    }
  }
  try {
    return { cuerpo: JSON.parse(texto) }
  } catch {
    return { error: datosInvalidos('El cuerpo tiene que ser JSON.') }
  }
}
