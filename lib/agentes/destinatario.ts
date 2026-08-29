/**
 * A quién pertenece un número de WhatsApp.
 *
 * Los agentes conocen el teléfono de quien les escribe, no el `id` del lead.
 * Este módulo hace esa traducción, y vive aparte porque lo usan tres rutas:
 * `/api/agentes/lead` para dar contexto antes de responder, `/api/agentes/
 * wa-mensaje` para registrar lo conversado, y el panel de entrantes sin
 * identificar.
 *
 * **La búsqueda es por los últimos 8 dígitos, a propósito.** El mismo número
 * aparece escrito de formas distintas según de dónde venga: `+56 9 5035 8818`
 * en un formulario, `56950358818` en WhatsApp, `950358818` en una planilla.
 * Comparar el sufijo es lo que hace que las tres encuentren la misma ficha.
 *
 * **Y cuando el sufijo calza con dos fichas, no se elige ninguna.** Antes esto
 * terminaba en un `limit 1` que devolvía la primera que saliera. En la base hay
 * cuatro pares de negocios DISTINTOS con el mismo número anotado, así que esa
 * primera ficha era una moneda al aire: el mensaje quedaba en la conversación
 * de otro, y un agente que lee ese historial le responde a alguien con el
 * contexto equivocado. Un empate lo resuelve una persona, no un `limit 1`.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

/** Cantidad de dígitos finales que identifican a una persona sin ambigüedad. */
const DIGITOS_SUFIJO = 8

export interface Destinatario {
  tipo: 'lead' | 'cliente'
  id: string
  nombre: string | null
}

/**
 * Lo que se sabe del número, incluido «se sabe demasiado».
 *
 * `ambiguo` no es un error: es la respuesta correcta cuando la base tiene dos
 * fichas con ese número. Se separa de `desconocido` porque lo que hay que
 * hacer con cada uno es distinto — a un desconocido se le abre ficha, a un
 * empate se le corrige el dato.
 */
export type ResultadoDestinatario =
  | { estado: 'encontrado'; destinatario: Destinatario }
  | { estado: 'desconocido' }
  | { estado: 'ambiguo'; candidatos: Destinatario[] }

/**
 * El sufijo comparable de un teléfono, o `null` si no da para identificar a
 * nadie. Menos de 8 dígitos casaría con demasiadas fichas.
 *
 * Ojo: esto valida el número que LLEGA (el de WhatsApp, que siempre trae 8 o
 * más). Los teléfonos guardados cortos, sin código de área, sí se buscan — de
 * eso se encarga `buscar_por_telefono` en la base.
 */
export function sufijoTelefono(telefono: string | null | undefined): string | null {
  const digitos = String(telefono ?? '').replace(/\D/g, '')
  return digitos.length >= DIGITOS_SUFIJO ? digitos.slice(-DIGITOS_SUFIJO) : null
}

/**
 * Dos filas son la misma ficha si comparten `id`. La base puede devolver el
 * mismo lead dos veces si el número calza por más de un camino, y eso no es
 * una ambigüedad: es la misma persona.
 */
function unicas<T extends { id: string }>(filas: T[]): T[] {
  const vistos = new Set<string>()
  return filas.filter((f) => (vistos.has(f.id) ? false : (vistos.add(f.id), true)))
}

async function candidatosEn(
  admin: SB,
  sufijo: string,
  tabla: 'dim_clientes' | 'fact_leads'
): Promise<Destinatario[]> {
  const { data } = await admin.rpc('buscar_por_telefono', { p_sufijo: sufijo, p_tabla: tabla })
  const tipo = tabla === 'dim_clientes' ? 'cliente' : 'lead'
  return unicas((data ?? []) as Array<{ id: string; nombre: string | null }>).map((f) => ({
    tipo,
    id: f.id,
    nombre: f.nombre ?? null,
  }))
}

/**
 * Busca a quién corresponde ese número, distinguiendo los tres desenlaces.
 *
 * Los clientes se consultan primero: si alguien ya es cliente, esa relación
 * manda sobre cualquier ficha de lead que haya quedado de cuando lo era.
 */
export async function resolverDestinatario(
  admin: SB,
  telefono: string | null | undefined
): Promise<ResultadoDestinatario> {
  const sufijo = sufijoTelefono(telefono)
  if (!sufijo) return { estado: 'desconocido' }

  const clientes = await candidatosEn(admin, sufijo, 'dim_clientes')
  if (clientes.length === 1) return { estado: 'encontrado', destinatario: clientes[0] }
  if (clientes.length > 1) return { estado: 'ambiguo', candidatos: clientes }

  const leads = await candidatosEn(admin, sufijo, 'fact_leads')
  if (leads.length === 1) return { estado: 'encontrado', destinatario: leads[0] }
  if (leads.length > 1) return { estado: 'ambiguo', candidatos: leads }

  return { estado: 'desconocido' }
}

/**
 * La versión corta: la ficha, o `null` si no hay una sola respuesta posible.
 *
 * Un empate devuelve `null` igual que un desconocido, y está bien: para quien
 * solo quiere saber a qué ficha colgar algo, «hay dos» y «no hay ninguna»
 * llevan a la misma decisión — no tocar nada y que lo mire un humano. Quien
 * necesite explicar POR QUÉ no hay ficha, que use `resolverDestinatario`.
 */
export async function buscarDestinatario(
  admin: SB,
  telefono: string | null | undefined
): Promise<Destinatario | null> {
  const r = await resolverDestinatario(admin, telefono)
  return r.estado === 'encontrado' ? r.destinatario : null
}
