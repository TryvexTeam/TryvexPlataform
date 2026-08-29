/**
 * Qué dice el acuse de recibo de WhatsApp sobre un mensaje que mandamos.
 *
 * Existe porque «enviado» no significaba enviado. El CRM marcaba el mensaje
 * como enviado cuando el AGENTE ACEPTABA EL ENCARGO — no cuando WhatsApp lo
 * aceptaba. En agosto la diferencia costó dos días: WhatsApp devolvía el acuse
 * con `error: 463` (lo recibe y lo descarta) y el CRM mostraba todo enviado,
 * movía las fichas a «contactado» y el equipo trabajaba sobre gente que nunca
 * recibió nada.
 *
 * **Se interpreta el CÓDIGO del acuse, nunca los nombres de campo del
 * transporte.** La versión de Baileys que se está probando (7.0.0-rc14)
 * renombró `key.senderPn` a `remoteJidAlt`/`participantAlt` y agregó
 * `addressingMode`. Si mañana hay que volver a la 6.x, este módulo tiene que
 * seguir sabiendo distinguir entregado de descartado: que la versión sea
 * reversible no sirve de nada si nuestro código no lo es.
 */

/** Lo que el CRM guarda sobre un saliente. `pendiente` es el estado honesto. */
export type EstadoEnvio = 'pendiente' | 'enviado' | 'entregado' | 'leido' | 'fallido'

export interface LecturaAcuse {
  estado: EstadoEnvio
  /** El código tal cual llegó, para guardarlo sin interpretar. */
  codigo: string | null
  /** Explicación en castellano, para mostrarla al lado del mensaje. */
  motivo: string | null
}

/**
 * Códigos de error conocidos, con lo que significan para quien mira la pantalla.
 *
 * El 463 está acá con nombre y apellido porque es el que nos mordió: no es un
 * fallo de red ni un número mal escrito — WhatsApp acepta la conexión, acepta
 * el envío, devuelve id y descarta el mensaje. Sin excepción, así que el envío
 * «resuelve bien» y nadie se entera.
 */
const MOTIVOS: Record<string, string> = {
  '403': 'WhatsApp rechazó el envío: no se puede escribir a ese destinatario',
  '404': 'Ese número no existe en WhatsApp',
  '408': 'Se agotó el tiempo de espera; el mensaje no salió',
  '429': 'Demasiados envíos seguidos: WhatsApp está limitando el ritmo',
  '463': 'WhatsApp recibió el mensaje y lo descartó sin entregarlo',
  '500': 'Error del lado de WhatsApp',
}

/**
 * Traduce un acuse a lo que hay que guardar.
 *
 * Sin código y sin error, el acuse es bueno: WhatsApp confirma. Con cualquier
 * código de error, el mensaje NO llegó — y se prefiere `fallido` desconocido
 * antes que asumir entrega, porque el costo de los dos errores no es el mismo:
 * dar por entregado lo que se perdió es lo que hace que nadie vuelva a escribir.
 */
export function leerAcuse(entrada: {
  error?: string | number | null
  codigo?: string | number | null
  leido?: boolean
}): LecturaAcuse {
  const bruto = entrada.error ?? entrada.codigo ?? null
  const codigo = bruto === null || bruto === undefined || bruto === '' ? null : String(bruto)

  // Un acuse limpio es la ÚNICA prueba de entrega que tenemos.
  if (codigo === null || codigo === '0') {
    return {
      estado: entrada.leido ? 'leido' : 'entregado',
      codigo: codigo,
      motivo: null,
    }
  }

  return {
    estado: 'fallido',
    codigo,
    motivo: MOTIVOS[codigo] ?? `WhatsApp rechazó el envío (código ${codigo})`,
  }
}

/** ¿Este estado significa que el mensaje llegó de verdad? */
export function llego(estado: EstadoEnvio | null | undefined): boolean {
  return estado === 'entregado' || estado === 'leido'
}

/**
 * ¿Se puede afirmar algo sobre este mensaje?
 *
 * `pendiente` no es bueno ni malo: es «todavía no sabemos». Se separa a
 * propósito de `fallido` — presentar la espera como un fallo hace que alguien
 * reenvíe un mensaje que sí iba a llegar.
 */
export function sinConfirmar(estado: EstadoEnvio | null | undefined): boolean {
  return estado === 'pendiente' || estado === 'enviado' || estado == null
}
