/**
 * Markdown mínimo para la bitácora del cerebro.
 *
 * Devuelve una estructura de datos, no HTML: el componente arma nodos de React
 * con ella. Es deliberado — el contenido llega desde Discord y desde lo que
 * escribe el equipo, así que nunca pasa por dangerouslySetInnerHTML y no hay
 * superficie de XSS que auditar.
 *
 * Cubre lo que realmente se usa al anotar: títulos, listas, citas, código,
 * negrita, itálica, tachado, `código` y enlaces. Nada de tablas ni HTML crudo.
 */

export type NodoInline =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'fuerte'; texto: string }
  | { tipo: 'enfasis'; texto: string }
  | { tipo: 'tachado'; texto: string }
  | { tipo: 'codigo'; texto: string }
  | { tipo: 'enlace'; texto: string; href: string }
  | { tipo: 'spoiler'; texto: string }
  /** Salto de línea dentro de un párrafo. Solo aparece en modo chat. */
  | { tipo: 'salto'; texto: '' }

export type BloqueMd =
  | { tipo: 'titulo'; nivel: 1 | 2 | 3; contenido: NodoInline[] }
  | { tipo: 'parrafo'; contenido: NodoInline[] }
  | { tipo: 'lista'; ordenada: boolean; items: NodoInline[][] }
  | { tipo: 'cita'; contenido: NodoInline[] }
  | { tipo: 'codigo'; texto: string; lenguaje: string | null }
  | { tipo: 'tabla'; encabezados: NodoInline[][]; filas: NodoInline[][][] }
  | { tipo: 'separador' }

/** Solo esquemas navegables: un `javascript:` en un enlace no se renderiza como tal. */
const ESQUEMAS_OK = /^(https?:\/\/|mailto:|\/)/i

// El destino admite un nivel de paréntesis anidados: sin eso, un
// `(javascript:alert(1))` corta en el primer `)` y deja basura suelta en el texto.
// El orden importa: `||` y `~~` van antes que `*`/`_` para que no los parta a medias.
// La URL suelta va última, para no pisar la que ya viene dentro de un [texto](url).
const INLINE =
  /(\[[^\]\n]+\]\((?:[^()\s]|\([^()\s]*\))+\))|(`[^`\n]+`)|(\|\|[^\n]+?\|\|)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(~~[^~\n]+~~)|(\*[^*\n]+\*)|(_[^_\n]+_)|(https?:\/\/[^\s<>()]+)/

/** Parte una línea en trozos con formato. Lo que no matchea queda como texto. */
export function parsearInline(linea: string): NodoInline[] {
  const nodos: NodoInline[] = []
  let resto = linea

  while (resto.length > 0) {
    const match = INLINE.exec(resto)
    if (!match || match.index === undefined) {
      nodos.push({ tipo: 'texto', texto: resto })
      break
    }

    if (match.index > 0) nodos.push({ tipo: 'texto', texto: resto.slice(0, match.index) })

    const token = match[0]
    if (token.startsWith('[')) {
      const corte = token.indexOf('](')
      const texto = token.slice(1, corte)
      const href = token.slice(corte + 2, -1)
      if (ESQUEMAS_OK.test(href)) nodos.push({ tipo: 'enlace', texto, href })
      else nodos.push({ tipo: 'texto', texto })
    } else if (token.startsWith('`')) {
      nodos.push({ tipo: 'codigo', texto: token.slice(1, -1) })
    } else if (token.startsWith('||')) {
      nodos.push({ tipo: 'spoiler', texto: token.slice(2, -2) })
    } else if (token.startsWith('**') || token.startsWith('__')) {
      nodos.push({ tipo: 'fuerte', texto: token.slice(2, -2) })
    } else if (token.startsWith('~~')) {
      nodos.push({ tipo: 'tachado', texto: token.slice(2, -2) })
    } else if (/^https?:\/\//.test(token)) {
      // URL escrita a secas. Se recorta la puntuación final: nadie quiere el punto
      // de "mirá https://tryvex.tech." dentro del enlace.
      const limpia = token.replace(/[.,;:!?]+$/, '')
      nodos.push({ tipo: 'enlace', texto: limpia, href: limpia })
      if (limpia.length < token.length) nodos.push({ tipo: 'texto', texto: token.slice(limpia.length) })
    } else {
      nodos.push({ tipo: 'enfasis', texto: token.slice(1, -1) })
    }

    resto = resto.slice(match.index + token.length)
  }

  return nodos.filter((n) => n.tipo !== 'texto' || n.texto.length > 0)
}

export interface OpcionesMd {
  /**
   * Modo chat, como Discord: un salto de línea simple ES un salto de línea.
   *
   * En markdown clásico dos líneas seguidas se juntan en un párrafo, y en un chat
   * eso arruina el mensaje: quien escribe tres líneas cortas las ve pegadas en un
   * bloque. Acá cada Enter se respeta tal como se escribió.
   */
  chat?: boolean
}

/** La línea que separa el encabezado del cuerpo: |---|:--:|---:| */
const SEPARADOR_TABLA = /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/

/**
 * Parte una fila en celdas. Las barras de los extremos son opcionales, que es
 * como las escriben tanto la gente como los agentes.
 */
function celdas(linea: string): NodoInline[][] {
  return linea
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => parsearInline(c.trim()))
}

/** Convierte el texto completo en bloques listos para pintar. */
export function parsearMarkdown(fuente: string, opciones: OpcionesMd = {}): BloqueMd[] {
  const lineas = fuente.replace(/\r\n/g, '\n').split('\n')
  const bloques: BloqueMd[] = []
  let i = 0

  while (i < lineas.length) {
    const linea = lineas[i]

    if (linea.trim() === '') {
      i++
      continue
    }

    // Bloque de código: se corta en el cierre o al final del texto.
    const vallado = /^```(\w*)\s*$/.exec(linea.trim())
    if (vallado) {
      const cuerpo: string[] = []
      i++
      while (i < lineas.length && lineas[i].trim() !== '```') {
        cuerpo.push(lineas[i])
        i++
      }
      i++ // consume el cierre
      bloques.push({ tipo: 'codigo', texto: cuerpo.join('\n'), lenguaje: vallado[1] || null })
      continue
    }

    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(linea.trim())) {
      bloques.push({ tipo: 'separador' })
      i++
      continue
    }

    const titulo = /^(#{1,3})\s+(.*)$/.exec(linea)
    if (titulo) {
      bloques.push({
        tipo: 'titulo',
        nivel: titulo[1].length as 1 | 2 | 3,
        contenido: parsearInline(titulo[2].trim()),
      })
      i++
      continue
    }

    if (/^>\s?/.test(linea)) {
      const cuerpo: string[] = []
      while (i < lineas.length && /^>\s?/.test(lineas[i])) {
        cuerpo.push(lineas[i].replace(/^>\s?/, ''))
        i++
      }
      bloques.push({ tipo: 'cita', contenido: parsearInline(cuerpo.join(' ')) })
      continue
    }

    // Tabla: una fila de celdas y debajo la línea separadora (|---|---|).
    // Los agentes del equipo mandan tablas todo el tiempo; sin esto se leían como
    // una sopa de barras verticales.
    if (linea.includes('|') && i + 1 < lineas.length && SEPARADOR_TABLA.test(lineas[i + 1])) {
      const encabezados = celdas(linea)
      i += 2
      const filas: NodoInline[][][] = []
      while (i < lineas.length && lineas[i].includes('|') && lineas[i].trim() !== '') {
        filas.push(celdas(lineas[i]))
        i++
      }
      bloques.push({ tipo: 'tabla', encabezados, filas })
      continue
    }

    const esItem = (l: string) => /^\s*([-*+]|\d+[.)])\s+/.test(l)
    if (esItem(linea)) {
      const ordenada = /^\s*\d+[.)]\s+/.test(linea)
      const items: NodoInline[][] = []
      while (i < lineas.length && esItem(lineas[i])) {
        items.push(parsearInline(lineas[i].replace(/^\s*([-*+]|\d+[.)])\s+/, '')))
        i++
      }
      bloques.push({ tipo: 'lista', ordenada, items })
      continue
    }

    // Párrafo: líneas seguidas hasta un blanco o el inicio de otro bloque.
    const cuerpo: string[] = []
    while (
      i < lineas.length &&
      lineas[i].trim() !== '' &&
      !esItem(lineas[i]) &&
      !/^>\s?/.test(lineas[i]) &&
      !/^#{1,3}\s+/.test(lineas[i]) &&
      !/^```/.test(lineas[i].trim())
    ) {
      cuerpo.push(lineas[i])
      i++
    }

    if (opciones.chat) {
      // Cada línea conserva su salto, con un marcador entre medio.
      const contenido: NodoInline[] = []
      cuerpo.forEach((linea, indice) => {
        if (indice > 0) contenido.push({ tipo: 'salto', texto: '' })
        contenido.push(...parsearInline(linea))
      })
      bloques.push({ tipo: 'parrafo', contenido })
    } else {
      bloques.push({ tipo: 'parrafo', contenido: parsearInline(cuerpo.join(' ')) })
    }
  }

  return bloques
}

/**
 * El texto sin marcas, en una línea. Para la vista previa de la bandeja del chat:
 * ahí un `**hola**` tiene que leerse "hola", no con los asteriscos.
 */
export function textoPlano(fuente: string): string {
  return parsearMarkdown(fuente)
    .map((bloque) => {
      switch (bloque.tipo) {
        case 'codigo':
          return bloque.texto
        case 'separador':
          return ''
        case 'lista':
          return bloque.items.map(inlineAPlano).join(' · ')
        case 'tabla':
          return [bloque.encabezados, ...bloque.filas]
            .map((fila) => fila.map(inlineAPlano).join(' · '))
            .join(' | ')
        default:
          return inlineAPlano(bloque.contenido)
      }
    })
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function inlineAPlano(nodos: NodoInline[]): string {
  // El spoiler no se revela en la vista previa de la bandeja: para eso está oculto.
  return nodos.map((n) => (n.tipo === 'spoiler' ? '▮▮▮' : n.tipo === 'salto' ? ' ' : n.texto)).join('')
}

/** ¿Vale la pena tratarlo como markdown, o es texto plano y basta? */
export function pareceMarkdown(texto: string): boolean {
  return /(^|\n)\s*(#{1,3}\s|[-*+]\s|\d+[.)]\s|>\s|```)|\*\*|__|`[^`\n]+`|\[[^\]\n]+\]\(/.test(texto)
}

/**
 * ¿Es JSON serializado colado como contenido de mensaje? Pasa cuando algo (un
 * evento de llamada, un webhook) mete `JSON.stringify(...)` directo en
 * `contenido` en vez de un texto pensado para leerse. Se detecta por forma
 * -- empieza con `[` o `{` y efectivamente parsea -- y se renderiza aparte,
 * en un bloque monoespaciado, en vez de como párrafo normal.
 */
export function pareceJson(texto: string): boolean {
  const t = texto.trim()
  if (!t) return false
  if (t.startsWith('{') || t.startsWith('[')) {
    try {
      JSON.parse(t)
      return true
    } catch {
      return false
    }
  }
  // Doblemente serializado: alguien guardó `JSON.stringify(JSON.stringify(x))`
  // y lo que queda en `contenido` es una STRING de JSON -- empieza con `"`,
  // no con `[`/`{`, así que el chequeo de arriba no la agarra. Se intenta
  // desenvolver una capa y, si lo de adentro es objeto o arreglo, cuenta igual.
  if (t.startsWith('"') && t.endsWith('"')) {
    try {
      const interior = JSON.parse(t)
      if (typeof interior !== 'string') return false
      const t2 = interior.trim()
      if (!(t2.startsWith('{') || t2.startsWith('['))) return false
      JSON.parse(t2)
      return true
    } catch {
      return false
    }
  }
  return false
}
