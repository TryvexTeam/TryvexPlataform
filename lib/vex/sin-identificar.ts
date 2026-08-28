import { obtenerConversaciones, obtenerMensajes, type ConversacionAgente } from './agente'
import { buscarDestinatario } from '@/lib/agentes/destinatario'

/**
 * Quién le escribió al WhatsApp de la empresa sin estar en la base.
 *
 * El agente no le responde a un número desconocido — es la regla que evita
 * contestarle a cualquiera, y la que mantiene seguro el número. Pero esos
 * mensajes tienen que verse en algún lado: alguien que escribe y a quien nadie
 * atiende es un cliente potencial perdido en silencio.
 *
 * Esta vista los junta para que el equipo decida: crear la ficha, o ignorarlo
 * porque era un proveedor o una equivocación. El filtro lo pone una persona,
 * que es lo que evita llenar la base con contactos que nadie quiso.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

/** Cuántos mensajes del hilo se traen para dar contexto sin abrumar. */
const MENSAJES_DE_MUESTRA = 5

/** Tope de hilos a revisar. Cada uno cuesta una consulta a la base. */
const MAX_HILOS = 40

export interface EntranteSinIdentificar {
  /** Id de la conversación en el agente, para pedir el hilo completo. */
  conversacion: number
  telefono: string
  /** Nombre que WhatsApp expone del contacto, si lo hay. */
  nombre: string | null
  /** Marca de tiempo del último mensaje, en segundos. */
  ultimoMensaje: number | null
  /** Los últimos mensajes, del más viejo al más nuevo. */
  muestra: Array<{ deEllos: boolean; texto: string; cuando: number }>
}

/**
 * Las conversaciones del agente que no corresponden a ningún lead ni cliente.
 *
 * Se consulta el destinatario de cada una en paralelo: son consultas cortas y
 * hacerlas en serie multiplicaría la espera por la cantidad de hilos.
 */
export async function entrantesSinIdentificar(admin: SB): Promise<EntranteSinIdentificar[]> {
  const conversaciones = await obtenerConversaciones()

  // Solo las que tienen actividad: un hilo sin mensajes no es nadie esperando.
  const candidatas = conversaciones
    .filter((c) => c.last_message_at !== null)
    .sort((a, b) => (b.last_message_at ?? 0) - (a.last_message_at ?? 0))
    .slice(0, MAX_HILOS)

  const revisadas = await Promise.all(
    candidatas.map(async (c) => ({
      conversacion: c,
      destinatario: await buscarDestinatario(admin, c.phone).catch(() => null),
    }))
  )

  const huerfanas = revisadas.filter((r) => r.destinatario === null).map((r) => r.conversacion)

  return Promise.all(huerfanas.map((c) => conMuestra(c)))
}

/**
 * Le agrega a la conversación los últimos mensajes.
 *
 * Sin ellos la lista sería una fila de números sin contexto, y decidir si crear
 * un lead exige saber qué dijo esa persona. Si el hilo no se puede traer, la
 * fila igual aparece: es peor esconder a alguien que mostrarlo sin su texto.
 */
async function conMuestra(c: ConversacionAgente): Promise<EntranteSinIdentificar> {
  const base = {
    conversacion: c.id,
    telefono: c.phone,
    nombre: c.name,
    ultimoMensaje: c.last_message_at,
  }

  try {
    const mensajes = await obtenerMensajes(c.id)
    return {
      ...base,
      muestra: mensajes.slice(-MENSAJES_DE_MUESTRA).map((m) => ({
        deEllos: m.role === 'user',
        texto: m.content,
        cuando: m.created_at,
      })),
    }
  } catch {
    return { ...base, muestra: [] }
  }
}
