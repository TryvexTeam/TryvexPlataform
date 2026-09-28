import { santiagoToUTC } from '@/lib/utils/fecha-santiago'

/**
 * Lee el .txt que genera WhatsApp con "Exportar chat" y lo convierte en
 * mensajes para el historial manual del lead.
 *
 * Soporta lo que de verdad llega:
 *   Android  28/09/26, 16:04 - Nombre: texto          (también 4:04 p. m.)
 *   iPhone   [28/09/2026, 16:04:12] Nombre: texto     (con una marca invisible delante)
 * Un mensaje de varias líneas sigue en las líneas sin fecha que vienen detrás.
 * Los avisos del sistema ("Los mensajes están cifrados…") no tienen autor y se
 * descartan. Las horas se leen como hora de Chile.
 *
 * No decide quién es "nosotros": devuelve los autores y eso lo elige la
 * persona, que es la única que sabe cómo quedó agendado cada uno.
 */

export interface MensajeImportado {
  autor: string
  texto: string
  /** ISO en UTC. */
  ocurridoAt: string
}

export interface ChatLeido {
  mensajes: MensajeImportado[]
  /** En orden de aparición, sin repetir. */
  autores: string[]
  /** Líneas que no calzaron con nada (si son todas, no era un chat exportado). */
  lineasSinFecha: number
}

// 1: día, 2: mes, 3: año, 4: hora, 5: min, 6: seg (opc), 7: am/pm (opc), 8: resto
const CABECERA =
  /^\[?(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?\s?m\.?)?\]?\s*(?:-\s*)?(.*)$/i

const MULTIMEDIA = /^<(multimedia omitido|media omitted|archivo omitido)>$|(imagen|video|audio|sticker|documento) omitid[oa]$/i

function aInstante(d: string, m: string, a: string, h: string, min: string, s: string | undefined, ampm: string | undefined): string | null {
  const anio = a.length === 2 ? `20${a}` : a
  let hora = Number(h)
  if (ampm) {
    const pm = /^p/i.test(ampm)
    if (pm && hora < 12) hora += 12
    if (!pm && hora === 12) hora = 0
  }
  const fecha = `${anio}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  const instante = santiagoToUTC(fecha, `${String(hora).padStart(2, '0')}:${min}`)
  if (Number.isNaN(instante.getTime())) return null
  return new Date(instante.getTime() + Number(s ?? 0) * 1000).toISOString()
}

export function leerChatExportado(texto: string): ChatLeido {
  const mensajes: MensajeImportado[] = []
  let lineasSinFecha = 0
  let actual: MensajeImportado | null = null

  for (const cruda of texto.replace(/\r\n?/g, '\n').split('\n')) {
    // Marcas de dirección que WhatsApp mete al exportar (iPhone sobre todo).
    const linea = cruda.replace(/[‎‏‪-‮⁦-⁩]/g, '')
    const c = CABECERA.exec(linea.trim())
    const instante = c ? aInstante(c[1], c[2], c[3], c[4], c[5], c[6], c[7]) : null

    if (c && instante) {
      const resto = c[8]
      const dosPuntos = resto.indexOf(': ')
      if (dosPuntos <= 0) {
        // Aviso del sistema: corta el mensaje anterior y no aporta nada.
        actual = null
        continue
      }
      const cuerpo = resto.slice(dosPuntos + 2).trim()
      actual = {
        autor: resto.slice(0, dosPuntos).trim(),
        texto: MULTIMEDIA.test(cuerpo) ? '[archivo o foto]' : cuerpo,
        ocurridoAt: instante,
      }
      mensajes.push(actual)
      continue
    }

    if (actual) {
      actual.texto += `\n${linea}`
    } else if (linea.trim()) {
      lineasSinFecha++
    }
  }

  for (const m of mensajes) m.texto = m.texto.replace(/\s+$/, '')
  const autores = [...new Set(mensajes.map((m) => m.autor))]
  return { mensajes: mensajes.filter((m) => m.texto), autores, lineasSinFecha }
}
