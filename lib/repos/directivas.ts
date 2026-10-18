import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Las decisiones del equipo que todos los agentes tienen que tener en cuenta.
 *
 * Se escriben una vez en Intelligence y las leen: el generador del mensaje en
 * frío (`lib/vex/draft.ts`) y el agente de WhatsApp (por
 * `/api/agentes/directivas`). Antes, "este mes hay descuento" había que
 * escribirlo en el código de cada uno.
 */

export type AlcanceDirectiva = 'todos' | 'primer_mensaje' | 'conversacion'

export interface Directiva {
  id: string
  texto: string
  alcance: AlcanceDirectiva
  vigenteDesde: string
  vigenteHasta: string | null
  activa: boolean
  creadoPor: string | null
  /** Si hoy la están leyendo los agentes: activa y dentro de su vigencia. */
  vigente: boolean
}

/** Hoy en Chile, como fecha (YYYY-MM-DD). Las vigencias son por día chileno. */
function hoyChile(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })
}

interface FilaDirectiva {
  id: string
  texto: string
  alcance: AlcanceDirectiva
  vigente_desde: string
  vigente_hasta: string | null
  activa: boolean
  autor: { nombre: string } | { nombre: string }[] | null
}

function vigenteHoy(f: Pick<FilaDirectiva, 'activa' | 'vigente_desde' | 'vigente_hasta'>, hoy: string): boolean {
  return f.activa && f.vigente_desde <= hoy && (f.vigente_hasta === null || f.vigente_hasta >= hoy)
}

/** Todas, para la pantalla: las vigentes primero, después el historial. */
export async function listarDirectivas(supabase: SupabaseClient): Promise<Directiva[]> {
  const { data, error } = await supabase
    .from('directivas')
    .select('id, texto, alcance, vigente_desde, vigente_hasta, activa, autor:creado_por (nombre)')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) throw new Error(`No se pudieron leer las directivas: ${error.message}`)

  const hoy = hoyChile()
  const directivas = ((data ?? []) as FilaDirectiva[]).map((f) => {
    const autor = Array.isArray(f.autor) ? f.autor[0] : f.autor
    return {
      id: f.id,
      texto: f.texto,
      alcance: f.alcance,
      vigenteDesde: f.vigente_desde,
      vigenteHasta: f.vigente_hasta,
      activa: f.activa,
      creadoPor: autor?.nombre ?? null,
      vigente: vigenteHoy(f, hoy),
    }
  })
  return directivas.sort((a, b) => Number(b.vigente) - Number(a.vigente))
}

/**
 * Los textos que un agente tiene que leer HOY para un tipo de trabajo.
 *
 * Una directiva `todos` vale para las dos cosas; una `primer_mensaje` solo
 * para el mensaje en frío, y una `conversacion` solo para el agente de
 * WhatsApp. La vigencia se evalúa con el día chileno, no con el del servidor.
 */
export async function directivasVigentes(
  supabase: SupabaseClient,
  para: Exclude<AlcanceDirectiva, 'todos'>,
): Promise<string[]> {
  const hoy = hoyChile()
  const { data, error } = await supabase
    .from('directivas')
    .select('texto, activa, vigente_desde, vigente_hasta')
    .eq('activa', true)
    .in('alcance', ['todos', para])
    .lte('vigente_desde', hoy)
    .order('created_at', { ascending: true })
    .limit(30)

  // Un error acá no puede tumbar la redacción de un mensaje ni una respuesta:
  // sin directivas, el agente trabaja con su guion de siempre. Se deja
  // constancia en el log para que no pase desapercibido.
  if (error) {
    console.error('[directivas] no se pudieron leer:', error.message)
    return []
  }

  type Fila = Pick<FilaDirectiva, 'texto' | 'activa' | 'vigente_desde' | 'vigente_hasta'>
  return ((data ?? []) as Fila[]).filter((f) => vigenteHoy(f, hoy)).map((f) => f.texto)
}
