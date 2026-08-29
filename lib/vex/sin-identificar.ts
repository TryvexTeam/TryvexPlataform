import { obtenerConversaciones, obtenerMensajes, type ConversacionAgente } from './agente'
import { resolverDestinatario, type Destinatario } from '@/lib/agentes/destinatario'

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

/**
 * Por qué esta conversación no tiene ficha. No es lo mismo, y lo que hay que
 * hacer con cada una es distinto:
 *
 * - `desconocido`: nadie con ese número en la base. Se crea la ficha.
 * - `ambiguo`: hay DOS o más fichas con ese número. Crear una tercera sería
 *   empeorar el problema — hay que elegir cuál queda y corregir la otra.
 *
 * La distinción sale de `resolverDestinatario`. Antes acá se usaba
 * `buscarDestinatario`, que devuelve `null` para los dos casos, así que un
 * empate se mostraba como si fuera gente nueva y el botón "Crear lead"
 * duplicaba una ficha más.
 */
export type MotivoSinFicha = 'desconocido' | 'ambiguo'

export interface EntranteSinIdentificar {
  /** Por qué no tiene ficha: cambia qué se le ofrece hacer al equipo. */
  motivo: MotivoSinFicha
  /** Las fichas que empatan. Solo con `motivo: 'ambiguo'`. */
  candidatos?: Destinatario[]
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
      // Si la consulta falla, se trata como desconocido: es preferible mostrar
      // a alguien de más que esconderlo. Lo que no se hace es inventar que
      // tiene ficha.
      resultado: await resolverDestinatario(admin, c.phone).catch(
        () => ({ estado: 'desconocido' }) as const
      ),
    }))
  )

  const sinFicha = revisadas.filter((r) => r.resultado.estado !== 'encontrado')

  return Promise.all(
    sinFicha.map((r) =>
      conMuestra(
        r.conversacion,
        r.resultado.estado === 'ambiguo' ? 'ambiguo' : 'desconocido',
        r.resultado.estado === 'ambiguo' ? r.resultado.candidatos : undefined
      )
    )
  )
}

/**
 * Le agrega a la conversación los últimos mensajes.
 *
 * Sin ellos la lista sería una fila de números sin contexto, y decidir si crear
 * un lead exige saber qué dijo esa persona. Si el hilo no se puede traer, la
 * fila igual aparece: es peor esconder a alguien que mostrarlo sin su texto.
 */
async function conMuestra(
  c: ConversacionAgente,
  motivo: MotivoSinFicha,
  candidatos?: Destinatario[]
): Promise<EntranteSinIdentificar> {
  const base = {
    motivo,
    candidatos,
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
