/**
 * A quién pertenece un número de WhatsApp.
 *
 * Los agentes conocen el teléfono de quien les escribe, no el `id` del lead.
 * Este módulo hace esa traducción, y vive aparte porque lo usan dos rutas:
 * `/api/agentes/lead` para dar contexto antes de responder, y
 * `/api/agentes/wa-mensaje` para registrar lo conversado.
 *
 * **La búsqueda es por los últimos 8 dígitos, a propósito.** El mismo número
 * aparece escrito de formas distintas según de dónde venga: `+56 9 5035 8818`
 * en un formulario, `56950358818` en WhatsApp, `950358818` en una planilla.
 * Comparar el sufijo es lo que hace que las tres encuentren la misma ficha.
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
 * El sufijo comparable de un teléfono, o `null` si no da para identificar a
 * nadie. Menos de 8 dígitos casaría con demasiadas fichas.
 */
export function sufijoTelefono(telefono: string | null | undefined): string | null {
  const digitos = String(telefono ?? '').replace(/\D/g, '')
  return digitos.length >= DIGITOS_SUFIJO ? digitos.slice(-DIGITOS_SUFIJO) : null
}

/**
 * Busca a quién corresponde ese número.
 *
 * Los clientes se consultan primero: si alguien ya es cliente, esa relación
 * manda sobre cualquier ficha de lead que haya quedado de cuando lo era.
 *
 * Devuelve `null` si el número no está en la base — que para un agente
 * significa «no le respondas, no sabemos quién es».
 */
export async function buscarDestinatario(
  admin: SB,
  telefono: string | null | undefined
): Promise<Destinatario | null> {
  const sufijo = sufijoTelefono(telefono)
  if (!sufijo) return null

  const { data: clientes } = await admin.rpc('buscar_por_telefono', {
    p_sufijo: sufijo,
    p_tabla: 'dim_clientes',
  })

  const cliente = (clientes ?? [])[0]
  if (cliente) {
    return { tipo: 'cliente', id: cliente.id, nombre: cliente.nombre ?? null }
  }

  const { data: leads } = await admin.rpc('buscar_por_telefono', {
    p_sufijo: sufijo,
    p_tabla: 'fact_leads',
  })

  const lead = (leads ?? [])[0]
  if (lead) {
    return { tipo: 'lead', id: lead.id, nombre: lead.nombre ?? null }
  }

  return null
}
