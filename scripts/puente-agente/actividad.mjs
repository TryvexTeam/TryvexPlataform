// Qué se le cuenta a la oficina de cada herramienta que usa el agente.
//
// Lo mínimo para que el equipo vea en qué anda, y nada más: el CRM lo ve todo
// el equipo, y lo que pasa en la máquina de alguien puede traer datos que no
// son para compartir. Por eso:
//   · nunca el texto que se le pidió al agente;
//   · de un comando, su descripción si la trae, o solo el programa ("npm"),
//     nunca los argumentos (ahí aparecen claves, rutas y datos);
//   · de un archivo, solo su nombre, sin la carpeta;
//   · cualquier cosa con forma de clave se oculta igual, por si acaso.

const LARGO = 90

const SECRETO = /(txa_|sk-|ghp_|github_pat_|xox[bap]-|AKIA|eyJ)[A-Za-z0-9._-]{8,}/g

export function sinSecretos(texto) {
  return String(texto).replace(SECRETO, '[oculto]')
}

function corto(texto, largo = LARGO) {
  const t = sinSecretos(String(texto ?? '').replace(/\s+/g, ' ').trim())
  return t.length > largo ? `${t.slice(0, largo - 1)}…` : t
}

function nombreArchivo(ruta) {
  const partes = String(ruta ?? '').split(/[\\/]/).filter(Boolean)
  return partes.at(-1) ?? ''
}

function programa(comando) {
  // "cd x && npm test" → "npm": el primer programa que no es moverse de carpeta.
  const trozos = String(comando ?? '').split(/&&|\|\||;|\|/).map((t) => t.trim()).filter(Boolean)
  const util = trozos.find((t) => !/^(cd|export|set)\b/.test(t)) ?? trozos[0] ?? ''
  const primero = util.split(/\s+/)[0] ?? ''
  return /^[A-Za-z0-9._-]{1,30}$/.test(primero) ? primero : ''
}

/**
 * La etiqueta de una herramienta, para el panel de la oficina.
 * @param {string} nombre   tool_name del hook de Claude Code
 * @param {Record<string, unknown>} entrada  tool_input
 */
export function etiquetaHerramienta(nombre, entrada = {}) {
  const e = entrada ?? {}
  const n = String(nombre ?? 'Herramienta')

  if (n === 'Bash' || n === 'PowerShell') {
    const desc = e.description ? corto(e.description, 70) : ''
    const prog = programa(e.command)
    return corto(`${n} · ${desc || prog || 'comando'}`)
  }
  if (['Read', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(n)) {
    const archivo = nombreArchivo(e.file_path ?? e.notebook_path)
    return corto(archivo ? `${n} · ${archivo}` : n)
  }
  if (n === 'Grep' || n === 'Glob') return corto(`${n} · ${String(e.pattern ?? '').slice(0, 40)}`)
  if (n === 'WebSearch') return corto(`Búsqueda web · ${String(e.query ?? '').slice(0, 60)}`)
  if (n === 'WebFetch') {
    try {
      return corto(`Leyendo web · ${new URL(String(e.url)).hostname}`)
    } catch {
      return 'Leyendo web'
    }
  }
  if (n === 'Task' || n === 'Agent') return corto(`Subagente · ${e.description ?? ''}`)
  if (n.startsWith('mcp__')) {
    const [, servidor, herramienta] = n.split('__')
    return corto(`MCP · ${servidor ?? ''}${herramienta ? `/${herramienta}` : ''}`)
  }
  return corto(n)
}

/** ¿Hay que mandar este aviso, o el anterior fue hace muy poco? */
export function tocaAvisar(ultimoMs, ahoraMs, esperaMs = 4000) {
  return !ultimoMs || ahoraMs - ultimoMs >= esperaMs
}
