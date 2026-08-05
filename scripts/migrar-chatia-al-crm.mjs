#!/usr/bin/env node
/**
 * Migra #chatia (Discord) al canal "Equipo agéntico" del CRM.
 *
 * A diferencia de `ingesta-cerebro.mjs`, que DESTILA el canal en conocimiento, este
 * script mueve la conversación tal cual: cada mensaje de Discord pasa a ser un mensaje
 * del chat interno, con su autor y su fecha original.
 *
 * Uso:
 *   node --env-file=.env.local scripts/migrar-chatia-al-crm.mjs --dry-run
 *       Baja y muestra qué haría, sin escribir nada. Empezar SIEMPRE por acá.
 *
 *   node --env-file=.env.local scripts/migrar-chatia-al-crm.mjs --desde 2026-07-14
 *       Migra de esa fecha en adelante.
 *
 *   node --env-file=.env.local scripts/migrar-chatia-al-crm.mjs
 *       Migra el canal completo.
 *
 * Variables:
 *   AGENTE_TOKEN       token del agente que ingesta (se crea en /api/agentes)
 *   CRM_URL            base del CRM. Por defecto la de producción.
 *   DISCORD_BOT_TOKEN  \ del bridge de #chatia. Se pueden tomar de otro .env
 *   DISCORD_CHANNEL_ID / apuntando con CHATIA_ENV_FILE.
 *
 * Es REPETIBLE: cada mensaje viaja con origen_ref 'discord:<id>' y el índice único
 * de la migración 031 impide que se duplique. Cortarlo a la mitad y volver a correrlo
 * retoma donde quedó.
 */

import { readFileSync } from 'node:fs'

const UA = 'TryvexCRM-ChatiaMigrator (https://tryvexplataform.vercel.app, 1.0)'
const CRM = (process.env.CRM_URL ?? 'https://tryvexplataform.vercel.app').replace(/\/$/, '')
const LOTE = 100

function cargarEnvChatia() {
  const ruta = process.env.CHATIA_ENV_FILE
  if (!ruta) return
  for (const linea of readFileSync(ruta, 'utf-8').split(/\r?\n/)) {
    if (!linea.includes('=') || linea.trim().startsWith('#')) continue
    const corte = linea.indexOf('=')
    const clave = linea.slice(0, corte).trim()
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

const DRY = process.argv.includes('--dry-run')

/** Baja el canal completo (o desde una fecha), del más viejo al más nuevo. */
async function bajarCanal(desde) {
  cargarEnvChatia()
  const token = exigir('DISCORD_BOT_TOKEN')
  const canal = exigir('DISCORD_CHANNEL_ID')
  const corte = desde ? new Date(`${desde}T00:00:00-04:00`).getTime() : 0

  const mensajes = []
  let before = null

  while (true) {
    const url =
      `https://discord.com/api/v10/channels/${canal}/messages?limit=100` +
      (before ? `&before=${before}` : '')
    const res = await fetch(url, { headers: { Authorization: `Bot ${token}`, 'User-Agent': UA } })

    if (res.status === 429) {
      const espera = Number(res.headers.get('retry-after') ?? 5)
      console.log(`  Discord pide esperar ${espera}s...`)
      await new Promise((r) => setTimeout(r, espera * 1000))
      continue
    }
    if (!res.ok) throw new Error(`Discord ${res.status}: ${(await res.text()).slice(0, 200)}`)

    const pagina = await res.json()
    if (pagina.length === 0) break

    let alcanzoElCorte = false
    for (const m of pagina) {
      if (new Date(m.timestamp).getTime() < corte) { alcanzoElCorte = true; break }
      mensajes.push(m)
    }

    if (alcanzoElCorte) break
    before = pagina[pagina.length - 1].id
    if (pagina.length < 100) break
  }

  // Discord entrega del más nuevo al más viejo; el chat se lee al revés.
  return mensajes.reverse()
}

/**
 * Un mensaje de Discord como mensaje del CRM.
 *
 * El autor va DENTRO del texto y no como agente distinto: en el CRM todos entran
 * bajo el mismo agente ingestor. Separarlos por autor exigiría un agente por persona
 * y un mapeo Discord→integrante que hoy no existe; y perder quién dijo qué sería peor
 * que este prefijo.
 */
function aMensajeCRM(m) {
  const texto = (m.content ?? '').trim()
  const adjuntos = (m.attachments ?? []).length
  const nota = adjuntos > 0 ? `\n\n_(${adjuntos} adjunto${adjuntos > 1 ? 's' : ''} en Discord)_` : ''

  // Un mensaje que solo traía una imagen queda sin texto: se conserva igual, con la
  // marca, porque su ausencia rompería el hilo de la conversación.
  const cuerpo = texto || '_(sin texto)_'

  return {
    contenido: `**${m.author?.username ?? 'desconocido'}:** ${cuerpo}${nota}`,
    origen_ref: `discord:${m.id}`,
    created_at: new Date(m.timestamp).toISOString(),
  }
}

async function enviarLote(token, mensajes) {
  const res = await fetch(`${CRM}/api/agentes/mensajes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ mensajes }),
  })

  const cuerpo = await res.json().catch(() => null)
  if (!res.ok || !cuerpo?.success) {
    throw new Error(`CRM ${res.status}: ${JSON.stringify(cuerpo?.error ?? cuerpo).slice(0, 300)}`)
  }
  return cuerpo.data
}

async function main() {
  const desde = argumento('--desde')

  console.log(`Bajando #chatia${desde ? ` desde ${desde}` : ' (canal completo)'}...`)
  const crudos = await bajarCanal(desde)
  console.log(`  ${crudos.length} mensajes en Discord`)

  if (crudos.length === 0) return

  const mensajes = crudos.map(aMensajeCRM)
  const primero = crudos[0].timestamp.slice(0, 16).replace('T', ' ')
  const ultimo = crudos[crudos.length - 1].timestamp.slice(0, 16).replace('T', ' ')
  console.log(`  rango: ${primero}  ->  ${ultimo}`)

  if (DRY) {
    console.log('\n--dry-run: no se escribe nada. Muestra de los 3 primeros:\n')
    for (const m of mensajes.slice(0, 3)) {
      console.log(`  [${m.origen_ref}] ${m.created_at.slice(0, 16).replace('T', ' ')}`)
      console.log(`    ${m.contenido.slice(0, 120).replace(/\n/g, ' ')}\n`)
    }
    console.log(`Se enviarían ${mensajes.length} mensajes en ${Math.ceil(mensajes.length / LOTE)} lotes.`)
    return
  }

  const token = exigir('AGENTE_TOKEN')

  // Sonda antes de mandar nada: si el token está mal, mejor saberlo ahora que a
  // mitad del backfill.
  const sonda = await fetch(`${CRM}/api/agentes/mensajes?limite=1`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!sonda.ok) {
    console.error(`El CRM rechazó el token (${sonda.status}). Revisá AGENTE_TOKEN.`)
    process.exit(1)
  }

  let insertados = 0
  let duplicados = 0

  for (let i = 0; i < mensajes.length; i += LOTE) {
    const lote = mensajes.slice(i, i + LOTE)
    const r = await enviarLote(token, lote)
    insertados += r.insertados ?? 0
    duplicados += r.duplicados ?? 0
    console.log(
      `  lote ${Math.floor(i / LOTE) + 1}/${Math.ceil(mensajes.length / LOTE)}: ` +
        `+${r.insertados ?? 0} nuevos, ${r.duplicados ?? 0} ya estaban`,
    )
  }

  console.log(`\nListo. ${insertados} mensajes migrados, ${duplicados} ya estaban.`)
  if (duplicados > 0) {
    console.log('Los duplicados son esperables si ya habías corrido esto antes.')
  }
}

main().catch((e) => {
  console.error('\nFalló:', e.message)
  process.exit(1)
})
