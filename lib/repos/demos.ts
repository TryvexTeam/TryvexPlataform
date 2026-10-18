import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import type { LeadParaDemo } from '@/lib/vex/guion-demo'

// La tabla ya existe, pero todavía no está en los tipos generados. El desvío
// queda aquí para no propagar consultas sin tipos a los componentes.
type ClienteSinTipos = SupabaseClient

export interface DemoAgente {
  id: string
  leadId: string | null
  telefono: string
  nombreNegocio: string
  guion: string
  activa: boolean
  venceAt: string
  limiteMensajes: number
  mensajesUsados: number
  creadoPor: string | null
  vigente: boolean
}

interface FilaDemo {
  id: string
  lead_id: string | null
  telefono: string
  nombre_negocio: string
  guion: string
  activa: boolean
  vence_at: string
  limite_mensajes: number
  mensajes_usados: number
  creado_por: string | null
}

const COLUMNAS = 'id, lead_id, telefono, nombre_negocio, guion, activa, vence_at, limite_mensajes, mensajes_usados, creado_por'
const MAX_DEMOS = 100

function desdeFila(f: FilaDemo, ahora: number): DemoAgente {
  return {
    id: f.id,
    leadId: f.lead_id,
    telefono: f.telefono,
    nombreNegocio: f.nombre_negocio,
    guion: f.guion,
    activa: f.activa,
    venceAt: f.vence_at,
    limiteMensajes: f.limite_mensajes,
    mensajesUsados: f.mensajes_usados,
    creadoPor: f.creado_por,
    vigente: f.activa && Date.parse(f.vence_at) > ahora && f.mensajes_usados < f.limite_mensajes,
  }
}

export async function listarDemos(supabase: SupabaseClient): Promise<DemoAgente[]> {
  const ahora = Date.now()
  const vigentes: DemoAgente[] = []
  // PostgREST no compara dos columnas en un filtro. Revisamos el cupo por
  // tandas para que cien demos agotadas no escondan una que sí está vigente.
  for (let inicio = 0; vigentes.length < MAX_DEMOS; inicio += MAX_DEMOS) {
    const { data, error } = await (supabase as ClienteSinTipos)
      .from('demos_agente').select(COLUMNAS)
      .eq('activa', true).gt('vence_at', new Date(ahora).toISOString())
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .range(inicio, inicio + MAX_DEMOS - 1)
    if (error) throw new Error(`No se pudieron leer las demos: ${error.message}`)
    const filas = (data ?? []) as FilaDemo[]
    vigentes.push(...filas.map(f => desdeFila(f, ahora)).filter(d => d.vigente))
    if (filas.length < MAX_DEMOS) break
  }
  if (vigentes.length >= MAX_DEMOS) return vigentes.slice(0, MAX_DEMOS)

  const { data, error } = await (supabase as ClienteSinTipos)
    .from('demos_agente').select(COLUMNAS)
    .order('created_at', { ascending: false }).order('id', { ascending: false })
    .limit(MAX_DEMOS)
  if (error) throw new Error(`No se pudo leer el historial de demos: ${error.message}`)
  const historial = ((data ?? []) as FilaDemo[]).map(f => desdeFila(f, ahora)).filter(d => !d.vigente)
  return [...vigentes, ...historial].slice(0, MAX_DEMOS)
}

export async function leadsParaDemo(supabase: SupabaseClient<Database>) {
  const { data, error } = await supabase.from('fact_leads')
    .select('id, nombre_negocio, telefono').is('eliminado_at', null)
    .not('telefono', 'is', null).neq('telefono', '')
    .order('nombre_negocio', { ascending: true }).limit(600)
  if (error) throw new Error(`No se pudieron leer los leads: ${error.message}`)
  return (data ?? []).flatMap(l => l.telefono?.trim()
    ? [{ id: l.id, nombre: l.nombre_negocio, telefono: l.telefono }]
    : [])
}

export async function leadParaGuionDemo(supabase: SupabaseClient<Database>, id: string) {
  // web_capacidades también falta en los tipos generados; es parte de la
  // ficha que consume LeadParaDemo y no se debe perder al sugerir el guion.
  const { data, error } = await (supabase as unknown as ClienteSinTipos).from('fact_leads')
    .select('nombre_negocio, categoria_google, nicho, localidad, horario, url_web, instagram, web_capacidades, telefono')
    .eq('id', id).is('eliminado_at', null).maybeSingle()
  if (error) throw new Error(`No se pudo leer el lead: ${error.message}`)
  if (!data) throw new Error('El lead ya no está disponible.')
  // El JSON de capacidades tiene un contrato más preciso en el generador.
  return data as LeadParaDemo & { telefono: string | null }
}

export async function insertarDemo(supabase: SupabaseClient, demo: Omit<DemoAgente, 'id' | 'mensajesUsados' | 'vigente'>) {
  return (supabase as ClienteSinTipos).from('demos_agente').insert({
    lead_id: demo.leadId,
    telefono: demo.telefono,
    nombre_negocio: demo.nombreNegocio,
    guion: demo.guion,
    activa: demo.activa,
    vence_at: demo.venceAt,
    limite_mensajes: demo.limiteMensajes,
    creado_por: demo.creadoPor,
  })
}

export async function desactivarDemo(supabase: SupabaseClient, id: string) {
  // Seleccionar la fila distingue un apagado real de un id ausente u oculto por RLS.
  return (supabase as ClienteSinTipos).from('demos_agente')
    .update({ activa: false }).eq('id', id).select('id').maybeSingle()
}
