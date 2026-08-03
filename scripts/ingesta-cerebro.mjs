/**
 * Ingesta on-demand hacia el cerebro del CRM.
 *
 * La bitácora (migración 020) se alimenta sola de lo que pasa DENTRO de la base.
 * Este script trae lo de afuera —lo que se decide en #chatia y lo que se
 * construye en GitHub— y lo deja como entradas fechadas, en markdown, con un
 * enlace al original.
 *
 * No corre por cron ni queda escuchando: se ejecuta cuando trabajamos en Tryvex.
 *
 * Uso:
 *   node --env-file=.env.local scripts/ingesta-cerebro.mjs chatia --desde 2026-07-14
 *       Baja el canal y escribe .cerebro/chatia-<rango>.json con un borrador por día.
 *
 *   node --env-file=.env.local scripts/ingesta-cerebro.mjs aplicar .cerebro/chatia-x.json
 *       Sube ese archivo a cerebro_entradas. Idempotente: reejecutar no duplica.
 *
 *   node --env-file=.env.local scripts/ingesta-cerebro.mjs github --desde 2026-07-14
 *       PR mergeados del repo (vía gh CLI) como entradas fuente=github.
 *
 *   node --env-file=.env.local scripts/ingesta-cerebro.mjs contexto
 *       Siembra lo fundacional: qué es Tryvex, el equipo, cómo trabajamos.
 *
 * Variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (del .env.local)
 *            DISCORD_BOT_TOKEN, DISCORD_CHANNEL_ID (del bridge de #chatia)
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const SALIDA = join(RAIZ, '.cerebro')
const REPO = 'TryvexTeam/TryvexPlataform'

// Cloudflare rechaza con 1010 cualquier llamada a Discord sin User-Agent propio.
const UA = 'TryvexCerebro (https://tryvexplataform.vercel.app, 1.0)'

// ── Utilidades ─────────────────────────────────────────────────────────────

/**
 * Las credenciales de Discord viven en el bridge de #chatia, no en este repo:
 * son de otro sistema y el repo es público. Se apunta con CHATIA_ENV_FILE.
 */
function cargarEnvChatia() {
  const ruta = process.env.CHATIA_ENV_FILE
  if (!ruta) return

  for (const linea of readFileSync(ruta, 'utf-8').split(/\r?\n/)) {
    if (!linea.includes('=') || linea.trim().startsWith('#')) continue
    const corte = linea.indexOf('=')
    const clave = linea.slice(0, corte).trim()
    // Lo que ya esté en el entorno manda: el archivo solo completa lo que falta.
    if (!process.env[clave]) process.env[clave] = linea.slice(corte + 1).trim()
  }
}

function exigir(nombre) {
  const valor = process.env[nombre]
  if (!valor) {
    console.error(`Falta ${nombre}. Revisá .env.local o el .env del bridge de #chatia.`)
    process.exit(1)
  }
  return valor
}

function argumento(bandera, porDefecto = null) {
  const i = process.argv.indexOf(bandera)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : porDefecto
}

/** Día local de Santiago: en UTC, lo de las 21:00 caería al día siguiente. */
function diaSantiago(iso) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

// ── Supabase (REST con service role; no hay DDL acá) ───────────────────────

async function subirEntradas(entradas) {
  const url = exigir('NEXT_PUBLIC_SUPABASE_URL')
  const key = exigir('SUPABASE_SERVICE_ROLE_KEY')

  const res = await fetch(`${url}/rest/v1/cerebro_entradas?on_conflict=origen_tabla,origen_ref`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      // merge-duplicates: reingestar el mismo día corrige el destilado en vez de duplicarlo.
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(entradas),
  })

  const texto = await res.text()
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${texto.slice(0, 400)}`)
  return JSON.parse(texto)
}

// ── #chatia ────────────────────────────────────────────────────────────────

async function bajarCanal(desde) {
  cargarEnvChatia()
  const token = exigir('DISCORD_BOT_TOKEN')
  const canal = exigir('DISCORD_CHANNEL_ID')
  const corte = desde ? new Date(`${desde}T00:00:00-04:00`).getTime() : 0

  const mensajes = []
  let before = null

  while (true) {
    const url =
      `https://discord.com/api/v10/channels/${canal}/messages?limit=100` + (before ? `&before=${before}` : '')
    const res = await fetch(url, { headers: { Authorization: `Bot ${token}`, 'User-Agent': UA } })
    if (!res.ok) throw new Error(`Discord ${res.status}: ${(await res.text()).slice(0, 200)}`)

    const lote = await res.json()
    if (lote.length === 0) break

    for (const m of lote) {
      if (new Date(m.timestamp).getTime() < corte) return mensajes
      mensajes.push({
        id: m.id,
        autor: m.author?.username ?? 'desconocido',
        ts: m.timestamp,
        texto: m.content ?? '',
        adjuntos: (m.attachments ?? []).length,
        url: `https://discord.com/channels/${m.guild_id ?? '@me'}/${canal}/${m.id}`,
      })
    }

    before = lote[lote.length - 1].id
    if (lote.length < 100) break
  }

  return mensajes
}

/**
 * Agrupa el canal por día. Cada día es una unidad de destilado: un borrador con
 * los mensajes crudos, para que quien ingesta (yo, un modelo, quien sea) escriba
 * el resumen y lo aplique con `aplicar`.
 */
function agruparPorDia(mensajes) {
  const dias = new Map()

  for (const m of mensajes) {
    const dia = diaSantiago(m.ts)
    const lista = dias.get(dia) ?? []
    lista.push(m)
    dias.set(dia, lista)
  }

  return [...dias.entries()]
    .map(([dia, msgs]) => {
      const orden = [...msgs].sort((a, b) => a.ts.localeCompare(b.ts))
      const participantes = [...new Set(orden.map((m) => m.autor))]
      return {
        dia,
        // origen_ref estable: reingestar el mismo día pisa la entrada, no la duplica.
        origen_ref: `chatia:${dia}`,
        participantes,
        mensajes: orden,
        url: orden[0].url,
        // Se completa a mano o con un modelo. Sin esto, `aplicar` lo saltea.
        titulo: '',
        destilado: '',
      }
    })
    .sort((a, b) => a.dia.localeCompare(b.dia))
}

async function comandoChatia() {
  const desde = argumento('--desde')
  const mensajes = await bajarCanal(desde)
  if (mensajes.length === 0) {
    console.log('No hay mensajes en ese rango.')
    return
  }

  const dias = agruparPorDia(mensajes)
  const rango = `${dias[0].dia}_a_${dias[dias.length - 1].dia}`
  mkdirSync(SALIDA, { recursive: true })

  const archivoJson = join(SALIDA, `chatia-${rango}.json`)
  writeFileSync(archivoJson, JSON.stringify({ fuente: 'chatia', dias }, null, 2), 'utf-8')

  // Copia legible: el crudo por día, para leerlo y escribir el destilado.
  const md = dias
    .map(
      (d) =>
        `## ${d.dia} — ${d.participantes.join(', ')}\n\n` +
        d.mensajes
          .map((m) => `**${m.autor}** (${m.ts.slice(11, 16)}): ${m.texto || `[${m.adjuntos} adjunto(s)]`}`)
          .join('\n\n'),
    )
    .join('\n\n---\n\n')
  writeFileSync(join(SALIDA, `chatia-${rango}.md`), md, 'utf-8')

  console.log(`${mensajes.length} mensajes · ${dias.length} días → ${archivoJson}`)
  console.log('Completá "titulo" y "destilado" de cada día y corré: aplicar <archivo>')
}

// ── Aplicar un borrador ya destilado ───────────────────────────────────────

async function comandoAplicar() {
  const archivo = process.argv[3]
  if (!archivo) {
    console.error('Falta el archivo. Ej: aplicar .cerebro/chatia-2026-07-14_a_2026-08-03.json')
    process.exit(1)
  }

  const { fuente, dias } = JSON.parse(readFileSync(archivo, 'utf-8'))
  const listos = dias.filter((d) => d.titulo?.trim() && d.destilado?.trim())
  const pendientes = dias.length - listos.length

  if (listos.length === 0) {
    console.error('Ningún día tiene titulo + destilado. No hay nada que subir.')
    process.exit(1)
  }

  const entradas = listos.map((d) => ({
    entidad_tipo: 'equipo',
    entidad_id: null,
    fuente,
    titulo: d.titulo.trim(),
    contenido: d.destilado.trim(),
    autor_externo: d.participantes?.join(', ') ?? null,
    // Mediodía de Santiago: la entrada cae en su día sin importar el huso.
    ocurrio_at: new Date(`${d.dia}T12:00:00-04:00`).toISOString(),
    metadata: {
      url: d.url,
      participantes: d.participantes ?? [],
      mensajes: d.mensajes?.length ?? 0,
    },
    origen_tabla: fuente,
    origen_ref: d.origen_ref,
  }))

  const subidas = await subirEntradas(entradas)
  console.log(`${subidas.length} entradas en el cerebro (fuente=${fuente}).`)
  if (pendientes > 0) console.log(`${pendientes} día(s) sin destilar quedaron fuera.`)
}

// ── GitHub ─────────────────────────────────────────────────────────────────

async function comandoGithub() {
  const desde = argumento('--desde')
  const { execSync } = await import('node:child_process')

  const crudo = execSync(
    `gh pr list --repo ${REPO} --state merged --limit 100 --json number,title,body,mergedAt,author,url`,
    { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 },
  )

  const prs = JSON.parse(crudo).filter((pr) => !desde || pr.mergedAt >= desde)
  if (prs.length === 0) {
    console.log('No hay PR mergeados en ese rango.')
    return
  }

  const entradas = prs.map((pr) => ({
    entidad_tipo: 'equipo',
    entidad_id: null,
    fuente: 'github',
    titulo: `PR #${pr.number} — ${pr.title}`,
    // El cuerpo del PR ya viene en markdown: la bitácora lo muestra tal cual.
    contenido: (pr.body ?? '').trim().slice(0, 6000) || null,
    autor_externo: pr.author?.login ?? null,
    ocurrio_at: pr.mergedAt,
    metadata: { url: pr.url, numero: pr.number },
    origen_tabla: 'github',
    origen_ref: `pr-${pr.number}`,
  }))

  const subidas = await subirEntradas(entradas)
  console.log(`${subidas.length} PR mergeados en el cerebro.`)
}

// ── Contexto fundacional ───────────────────────────────────────────────────

async function comandoContexto() {
  const archivo = join(RAIZ, 'cerebro', 'contexto-tryvex.md')
  const texto = readFileSync(archivo, 'utf-8')

  // Cada `## ` del documento es una entrada: se filtran y se leen por separado.
  const secciones = texto
    .split(/\n(?=## )/)
    .map((bloque) => {
      const [primera, ...resto] = bloque.split('\n')
      return { titulo: primera.replace(/^#+\s*/, '').trim(), cuerpo: resto.join('\n').trim() }
    })
    .filter((s) => s.titulo && s.cuerpo)

  const entradas = secciones.map((s, i) => ({
    entidad_tipo: 'equipo',
    entidad_id: null,
    fuente: 'contexto',
    titulo: s.titulo,
    contenido: s.cuerpo,
    autor_externo: 'Equipo Tryvex',
    // Anteriores a todo lo demás: es el piso sobre el que pasa el resto.
    ocurrio_at: new Date('2026-01-01T12:00:00-04:00').toISOString(),
    metadata: { documento: 'contexto-tryvex.md', orden: i },
    origen_tabla: 'contexto',
    origen_ref: `contexto:${i}:${s.titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}`,
  }))

  const subidas = await subirEntradas(entradas)
  console.log(`${subidas.length} secciones de contexto en el cerebro.`)
}

// ── Entrada ────────────────────────────────────────────────────────────────

const COMANDOS = {
  chatia: comandoChatia,
  aplicar: comandoAplicar,
  github: comandoGithub,
  contexto: comandoContexto,
}

const comando = COMANDOS[process.argv[2]]
if (!comando) {
  console.error(`Comandos: ${Object.keys(COMANDOS).join(' · ')}`)
  process.exit(1)
}

try {
  await comando()
} catch (err) {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
}
