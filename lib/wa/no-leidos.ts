/**
 * Cuenta, por lead, los mensajes entrantes de WhatsApp posteriores a la ultima
 * lectura del equipo.
 *
 * Vive aparte del endpoint para poder probarlo sin base de datos: los casos que
 * importan son de borde (nunca leido, leido justo en el mismo instante, leads
 * sin mensajes) y son exactamente los que se rompen en silencio.
 */

export interface LeadLeido {
  id: string
  wa_leido_hasta: string | null
}

export interface EntranteWa {
  lead_id: string | null
  created_at: string
}

/** `{ [lead_id]: cuantos sin leer }`. Los leads al dia no aparecen. */
export function contarNoLeidos(
  leads: LeadLeido[],
  entrantes: EntranteWa[]
): Record<string, number> {
  const leidoHasta = new Map<string, number>()
  for (const lead of leads) {
    // Nunca abierto: cuenta todo lo entrante. -Infinity y no 0, porque 0 es una
    // fecha real (1970) y no queremos que un dato raro pase por "ya leido".
    leidoHasta.set(lead.id, lead.wa_leido_hasta ? Date.parse(lead.wa_leido_hasta) : -Infinity)
  }

  const conteo: Record<string, number> = {}
  for (const msg of entrantes) {
    if (!msg.lead_id) continue
    const marca = leidoHasta.get(msg.lead_id)
    // Un mensaje de un lead que ya no existe no se cuenta: no hay donde mostrarlo.
    if (marca === undefined) continue

    const llegada = Date.parse(msg.created_at)
    if (Number.isNaN(llegada)) continue

    // Estrictamente posterior: el mensaje que llego en el mismo instante en que
    // se marco la lectura se considera leido, no pendiente. Si no, abrir el chat
    // dejaria un "1" fantasma imposible de sacar.
    if (llegada > marca) conteo[msg.lead_id] = (conteo[msg.lead_id] ?? 0) + 1
  }

  return conteo
}
