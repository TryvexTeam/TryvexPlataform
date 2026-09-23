#!/usr/bin/env node
// hook-oficina.mjs — CLAUDE CODE LE CUENTA A LA OFICINA DE INTELLIGENCE QUÉ
// ESTÁ HACIENDO EL AGENTE, EN VIVO.
//
// Es un hook de Claude Code. Con el token del agente como única llave, avisa:
//   · al recibir un mensaje (UserPromptSubmit) → "trabajando", empieza el turno
//   · en cada herramienta (PreToolUse)         → cuál usa ahora ("Bash · npm")
//   · al terminar el turno (Stop)              → "descansando"
//   · al cerrar la sesión (SessionEnd)         → "no está"
//
// Reglas que no se negocian:
//   · NO IMPRIME NADA. Lo que un hook de UserPromptSubmit escribe en la salida
//     entra al contexto de Claude; un aviso de la oficina no tiene nada que
//     hacer ahí.
//   · NUNCA BLOQUEA. Si el CRM no responde, sigue de largo en menos de 3 s y
//     sale con 0. La oficina es un espejo, no una condición para trabajar.
//   · NO MANDA el texto que se le pidió al agente ni comandos completos (ver
//     puente-agente/actividad.mjs).
//
// Instalar / quitar (fusiona con ~/.claude/settings.json, no lo pisa):
//   node scripts/hook-oficina.mjs --instalar
//   node scripts/hook-oficina.mjs --desinstalar
//   node scripts/hook-oficina.mjs --diag
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { leerToken, urlCrm } from './puente-agente/llave.mjs'
import { etiquetaHerramienta, tocaAvisar } from './puente-agente/actividad.mjs'

const CRM = urlCrm()
const EVENTOS = ['UserPromptSubmit', 'PreToolUse', 'Stop', 'SessionEnd']
const ESTE_ARCHIVO = resolve(fileURLToPath(import.meta.url))
const MARCA = 'hook-oficina.mjs'
// El estado "trabajando" vence a los 30 min: se renueva si el turno sigue.
const RENOVAR_MS = 20 * 60_000

// ── Instalación ────────────────────────────────────────────────────────────
function rutaAjustes() {
  return join(homedir(), '.claude', 'settings.json')
}

function instalar() {
  const ruta = rutaAjustes()
  mkdirSync(dirname(ruta), { recursive: true })
  let ajustes = {}
  if (existsSync(ruta)) {
    copyFileSync(ruta, `${ruta}.antes-hook-oficina`)
    ajustes = JSON.parse(readFileSync(ruta, 'utf8'))
  }
  const comando = `node "${ESTE_ARCHIVO.replace(/\\/g, '/')}"`
  ajustes.hooks ??= {}
  for (const evento of EVENTOS) {
    const lista = (ajustes.hooks[evento] ??= [])
    const ya = lista.some((g) => (g.hooks ?? []).some((h) => String(h.command ?? '').includes(MARCA)))
    if (!ya) lista.push({ ...(evento === 'PreToolUse' ? { matcher: '*' } : {}), hooks: [{ type: 'command', command: comando, timeout: 5 }] })
  }
  writeFileSync(ruta, `${JSON.stringify(ajustes, null, 2)}\n`)
  console.log(`Hook de la oficina instalado en ${ruta} (respaldo: settings.json.antes-hook-oficina).`)
  console.log('Vale desde la próxima sesión de Claude Code.')
}

function desinstalar() {
  const ruta = rutaAjustes()
  if (!existsSync(ruta)) return console.log('No hay settings.json: nada que quitar.')
  const ajustes = JSON.parse(readFileSync(ruta, 'utf8'))
  for (const evento of EVENTOS) {
    const lista = ajustes.hooks?.[evento]
    if (!Array.isArray(lista)) continue
    ajustes.hooks[evento] = lista
      .map((g) => ({ ...g, hooks: (g.hooks ?? []).filter((h) => !String(h.command ?? '').includes(MARCA)) }))
      .filter((g) => g.hooks.length > 0)
    if (ajustes.hooks[evento].length === 0) delete ajustes.hooks[evento]
  }
  writeFileSync(ruta, `${JSON.stringify(ajustes, null, 2)}\n`)
  console.log('Hook de la oficina quitado.')
}

// ── El aviso ───────────────────────────────────────────────────────────────
function archivoMemoria(token) {
  // Por agente: dos agentes en la misma máquina no se pisan el ritmo.
  const id = createHash('sha256').update(token).digest('hex').slice(0, 12)
  return join(tmpdir(), `tryvex-hook-oficina-${id}.json`)
}
function leerMemoria(ruta) {
  try { return JSON.parse(readFileSync(ruta, 'utf8')) } catch { return {} }
}
function guardarMemoria(ruta, m) {
  try { writeFileSync(ruta, JSON.stringify(m)) } catch { /* sin memoria solo se avisa de más */ }
}

async function avisar(token, cuerpo) {
  try {
    const r = await fetch(`${CRM}/api/agentes/estado`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(2500),
    })
    return r.ok
  } catch {
    return false
  }
}

async function leerEntrada() {
  let texto = ''
  for await (const trozo of process.stdin) texto += trozo
  try { return JSON.parse(texto) } catch { return {} }
}

async function hook() {
  const { token } = leerToken()
  if (!token) return
  const e = await leerEntrada()
  const evento = e.hook_event_name
  const proyecto = e.cwd ? basename(String(e.cwd)) : ''
  const memoria = archivoMemoria(token)
  const m = leerMemoria(memoria)
  const ahora = Date.now()

  if (evento === 'UserPromptSubmit') {
    if (await avisar(token, { estado: 'trabajando', nota: proyecto ? `En ${proyecto}` : 'En Claude Code', minutos: 30, turno: 'inicio' })) {
      guardarMemoria(memoria, { ...m, declarado: ahora, herramienta: 0 })
    }
  } else if (evento === 'PreToolUse') {
    if (!tocaAvisar(m.herramienta, ahora)) return
    const cuerpo = { herramienta: etiquetaHerramienta(e.tool_name, e.tool_input) }
    // Un turno largo renueva el "trabajando" antes de que venza.
    if (!m.declarado || ahora - m.declarado > RENOVAR_MS) {
      Object.assign(cuerpo, { estado: 'trabajando', nota: proyecto ? `En ${proyecto}` : 'En Claude Code', minutos: 30 })
    }
    if (await avisar(token, cuerpo)) {
      guardarMemoria(memoria, { ...m, herramienta: ahora, ...(cuerpo.estado ? { declarado: ahora } : {}) })
    }
  } else if (evento === 'Stop') {
    await avisar(token, { estado: 'descansando', nota: 'Esperando la próxima tarea', minutos: 30, turno: 'fin' })
    guardarMemoria(memoria, { ...m, herramienta: 0 })
  } else if (evento === 'SessionEnd') {
    await avisar(token, { estado: 'ausente', minutos: 480, turno: 'fin' })
  }
}

async function diag() {
  const { token, archivo } = leerToken()
  console.log(`CRM:   ${CRM}`)
  console.log(`Token: ${token ? 'presente' : `FALTA (TRYVEX_AGENTE_TOKEN o ${archivo})`}`)
  if (!token) return
  const ok = await avisar(token, { herramienta: 'Diagnóstico del hook' })
  console.log(`Aviso de prueba: ${ok ? 'aceptado por el CRM' : 'RECHAZADO (token, CRM caído o ruta sin publicar)'}`)
  const ajustes = existsSync(rutaAjustes()) ? readFileSync(rutaAjustes(), 'utf8') : ''
  console.log(`Instalado en settings.json: ${ajustes.includes(MARCA) ? 'sí' : 'no (node scripts/hook-oficina.mjs --instalar)'}`)
}

const arg = process.argv[2]
if (arg === '--instalar') instalar()
else if (arg === '--desinstalar') desinstalar()
else if (arg === '--diag') await diag()
else await hook().catch(() => {})
process.exit(0)
