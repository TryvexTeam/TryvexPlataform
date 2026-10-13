import type { Mensaje } from '@/lib/types/chat'

export const VENTANA_RACHA_MS = 5 * 60 * 1000

export interface MensajeAgrupado {
  mensaje: Mensaje
  iniciaRacha: boolean
  separacion: 'racha' | 'autor'
}

function autorDe(mensaje: Mensaje): string {
  return mensaje.autor_id ?? `agente:${mensaje.agente_id ?? 'sistema'}`
}

export function agruparRachas(mensajes: Mensaje[]): MensajeAgrupado[] {
  return mensajes.map((mensaje, indice) => {
    const previo = mensajes[indice - 1]
    const mismaRacha = Boolean(
      previo &&
        autorDe(previo) === autorDe(mensaje) &&
        new Date(mensaje.created_at).getTime() - new Date(previo.created_at).getTime() <= VENTANA_RACHA_MS,
    )
    return {
      mensaje,
      iniciaRacha: !mismaRacha,
      separacion: mismaRacha ? 'racha' : 'autor',
    }
  })
}
