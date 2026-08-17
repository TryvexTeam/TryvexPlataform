import type { SupabaseClient } from "@supabase/supabase-js";
import { coincideTermino } from "./texto";

/** Estados posibles de un lead en el CRM (schema 000 + migración 003 won/lost). */
export const ESTADOS_LEAD = [
  "sin_contactar",
  "contactado",
  "interesado",
  "reunion_agendada",
  "ganado",
  "perdido",
  "descartado",
] as const;

export type EstadoLead = (typeof ESTADOS_LEAD)[number];

export type LeadResumen = {
  id: string;
  nombre_negocio: string;
  nicho: string | null;
  localidad: string | null;
  score: number | null;
  telefono: string | null;
  redes_sociales: Record<string, string> | null;
  // Lo que de verdad personaliza un mensaje. Estaba declarado como opcional en
  // draft.ts pero ningun select lo traia, asi que llegaba siempre vacio: el
  // redactor escribia sobre el negocio sin saber nada del negocio.
  tiene_web: boolean | null;
  info_texto: string | null;
  url_web: string | null;
};

/** Cuenta los leads agrupados por estado (para el reporte de cartera). */
export async function reporteCartera(
  sb: SupabaseClient
): Promise<Record<EstadoLead, number> & { total: number }> {
  const conteos = await Promise.all(
    ESTADOS_LEAD.map(async (e) => {
      const { count } = await sb
        .from("fact_leads")
        .select("*", { count: "exact", head: true })
        .eq("estado", e);
      return [e, count ?? 0] as const;
    })
  );
  const out = Object.fromEntries(conteos) as Record<EstadoLead, number>;
  const total = conteos.reduce((s, [, n]) => s + n, 0);
  return { ...out, total };
}

/**
 * Lista leads con nombres, priorizados por score. Filtro opcional por
 * estado / nicho / localidad.
 * - Por defecto (sin estado) devuelve los `sin_contactar` CON canal de contacto
 *   → los que conviene contactar (la "recomendación" clásica).
 * - Con `estado` explícito, lista los leads de ESE estado (ej. "quiénes son los
 *   contactados") — sin exigir canal de contacto, porque acá el usuario quiere
 *   VER quiénes son, no a quién contactar.
 */
export async function recomendarLeads(
  sb: SupabaseClient,
  opts: { nicho?: string; localidad?: string; cantidad?: number; estado?: EstadoLead } = {}
): Promise<LeadResumen[]> {
  const limite = Math.max(1, Math.min(opts.cantidad ?? 10, 50));
  const estado = opts.estado ?? "sin_contactar";
  // Traemos amplio y filtramos en memoria para tolerar tildes y singular/plural
  // (la base es chica). ilike de Postgres no ignora acentos: "barberias" != "barberías".
  const { data, error } = await sb
    .from("fact_leads")
    .select("id,nombre_negocio,nicho,localidad,score,telefono,redes_sociales,tiene_web,info_texto,url_web")
    .eq("estado", estado)
    .order("score", { ascending: false })
    // TODO: tope de escaneo; revisar si la cartera supera 800 leads
    .limit(800);
  if (error) throw new Error(error.message);

  let leads = (data ?? []) as LeadResumen[];
  // Solo al RECOMENDAR a quién contactar exigimos canal; al LISTAR un estado, no.
  if (!opts.estado) leads = leads.filter((l) => l.telefono || l.redes_sociales);
  if (opts.nicho) leads = leads.filter((l) => coincideTermino(l.nicho, opts.nicho));
  if (opts.localidad) leads = leads.filter((l) => coincideTermino(l.localidad, opts.localidad));
  return leads.slice(0, limite);
}

/** Busca leads cuyo nombre coincida (ignorando tildes/may/min) con el término. */
export async function buscarLeadsPorNombre(
  sb: SupabaseClient,
  nombre: string,
  limite = 5
): Promise<(Pick<LeadResumen, "id" | "nombre_negocio"> & { estado: EstadoLead })[]> {
  const { data, error } = await sb
    .from("fact_leads")
    .select("id,nombre_negocio,estado")
    .order("score", { ascending: false })
    // TODO: tope de escaneo; revisar si la cartera supera 800 leads
    .limit(800);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string; nombre_negocio: string; estado: EstadoLead }[])
    .filter((l) => coincideTermino(l.nombre_negocio, nombre))
    .slice(0, limite);
}

/** Marca el estado de uno o varios leads. Devuelve cuántos se actualizaron. */
export async function marcarEstado(
  sb: SupabaseClient,
  leadIds: string[],
  estado: EstadoLead
): Promise<number> {
  if (!(ESTADOS_LEAD as readonly string[]).includes(estado)) {
    throw new Error(`Estado inválido: ${estado}`);
  }
  if (!leadIds.length) return 0;
  const { data, error } = await sb
    .from("fact_leads")
    .update({ estado })
    .in("id", leadIds)
    .select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}
