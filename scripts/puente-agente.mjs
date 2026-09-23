#!/usr/bin/env node
// puente-agente.mjs — EL PUENTE DE CADA AGENTE: los encargos aprobados en el
// CRM llegan al LLM de su dueño, y la respuesta vuelve al CRM.
//
// Uno solo para todos. Cada persona lo corre en su máquina con el token de SU
// agente (Ariel, Spike, Goku…): esa es la única llave. El puente le pregunta al
// CRM quién es y trabaja solo lo que le toca a ese agente.
//
// POR QUÉ ES BARATO: el puente no es un modelo. Consulta la cola con una
// petición condicional (si nada cambió, el CRM contesta 304 sin cuerpo) y
// espera más mientras está ocioso. El LLM se despierta SOLO cuando hay un
// encargo aprobado, uno a la vez y con tope por hora.
//
// POR QUÉ ES SEGURO:
//  · Lo `encolado` (esperando permiso humano) ni siquiera llega: la API no lo
//    entrega para trabajar.
//  · El encargo entra al ejecutor por la entrada estándar, nunca dentro del
//    comando: el texto lo escribe una persona y no debe poder ejecutarse.
//  · El token no va en el texto que lee el modelo.
//
// Uso (Node 18+, sin instalar nada):
//   node scripts/puente-agente.mjs --ejecutor "claude -p"          # servicio
//   node scripts/puente-agente.mjs --ejecutor "claude -p" --una-vez
//   node scripts/puente-agente.mjs --diag
//
// El ejecutor es cualquier comando que lea el encargo por la entrada estándar
// y escriba la respuesta por la salida estándar. `claude -p` lo hace.
//
// Entorno:
//   TRYVEX_CRM_URL        por defecto https://tryvexplataform.vercel.app
//   TRYVEX_AGENTE_TOKEN   el token del agente; si falta, se lee de TRYVEX_TOKEN_FILE
//   TRYVEX_TOKEN_FILE     por defecto ~/.claude/.tryvex-agente-token
//   PUENTE_EJECUTOR       igual que --ejecutor
//   PUENTE_MAX_HORA       encargos por hora como máximo (por defecto 6)
//   PUENTE_TIMEOUT_MIN    minutos por encargo antes de cortarlo (por defecto 30)
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  armarPrompt, armarRespuesta, decidir, respuestaRendida, siguienteEspera,
} from './puente-agente/reglas.mjs'
import { leerToken, urlCrm } from './puente-agente/llave.mjs'

const args = process.argv.slice(2)
const arg = (nombre) => {
  const i = args.indexOf(nombre)
  return i >= 0 ? args[i + 1] : undefined
}
const UNA_VEZ = args.includes('--una-vez')
const DIAG = args.includes('--diag')
const EJECUTOR = arg('--ejecutor') || process.env.PUENTE_EJECUTOR || ''
const CRM = urlCrm()
const MAX_HORA = Number(process.env.PUENTE_MAX_HORA || 6)
const TIMEOUT_MIN = Number(process.env.PUENTE_TIMEOUT_MIN || 30)
const TOPE_SALIDA = 256 * 1024

const log = (...a) => console.log(`[puente ${new Date().toISOString()}]`, ...a)

const { token: TOKEN, archivo: ARCHIVO_TOKEN, aviso: AVISO_TOKEN } = leerToken()
if (AVISO_TOKEN) console.error(`[puente] ojo: ${AVISO_TOKEN}`)

/** Llama a la API de agentes. Nunca lanza. */
async function crm(metodo, ruta, { cuerpo, etag } = {}) {
  try {
    const r = await fetch(`${CRM}${ruta}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json; charset=utf-8',
        ...(etag ? { 'If-None-Match': etag } : {}),
      },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      signal: AbortSignal.timeout(20_000),
    })
    if (r.status === 304) return { ok: true, status: 304, cuerpo: null, etag }
    const texto = await r.text()
    let json = null
    try { json = JSON.parse(texto) } catch { /* se reporta abajo */ }
    return {
      ok: r.ok && json?.success !== false,
      status: r.status,
      cuerpo: json ?? { error: texto.slice(0, 200) },
      etag: r.headers.get('etag'),
    }
  } catch (e) {
    return { ok: false, status: 0, cuerpo: { error: e instanceof Error ? e.message : String(e) } }
  }
}

// ── Lo que esta máquina recuerda: qué encargos tomó y cuántas veces lo intentó.
function archivoEstado(agenteId) {
  const dir = join(homedir(), '.tryvex-puente')
  mkdirSync(dir, { recursive: true })
  return join(dir, `${agenteId}.json`)
}
function leerEstado(ruta) {
  try { return JSON.parse(readFileSync(ruta, 'utf8')) } catch { return { tomados: {} } }
}
function guardarEstado(ruta, estado) {
  writeFileSync(ruta, JSON.stringify(estado, null, 2))
}

/** Corta el proceso y sus hijos. En Windows `kill` no alcanza a los nietos. */
function matar(hijo) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(hijo.pid), '/T', '/F'])
  else hijo.kill('SIGKILL')
}

/** Corre el ejecutor con el encargo por la entrada estándar. */
function ejecutar(prompt, encargoId) {
  return new Promise((listo) => {
    const t0 = Date.now()
    const hijo = spawn(EJECUTOR, {
      shell: true,
      env: {
        ...process.env,
        TRYVEX_CRM_URL: CRM,
        TRYVEX_ENCARGO_ID: encargoId,
        // El modelo puede usar la API con su identidad, pero el token no va en
        // el texto que lee: va por el entorno, igual que lo recibió el puente.
        ...(ARCHIVO_TOKEN ? { TRYVEX_TOKEN_FILE: ARCHIVO_TOKEN } : {}),
      },
      windowsHide: true,
    })
    let salida = ''
    let error = ''
    let vencido = false
    hijo.stdout.on('data', (d) => { if (salida.length < TOPE_SALIDA) salida += d })
    hijo.stderr.on('data', (d) => { if (error.length < TOPE_SALIDA) error += d })
    const reloj = setTimeout(() => { vencido = true; matar(hijo) }, TIMEOUT_MIN * 60_000)
    hijo.on('error', (e) => { error += `\n${e.message}` })
    hijo.on('close', (codigo) => {
      clearTimeout(reloj)
      listo({ codigo, salida, error, vencido, minutos: TIMEOUT_MIN, ms: Date.now() - t0 })
    })
    hijo.stdin.on('error', () => { /* el ejecutor puede cerrar la entrada antes: no es fallo */ })
    hijo.stdin.end(prompt)
  })
}

const recientes = []
function quedaCupo() {
  const hace1h = Date.now() - 3_600_000
  while (recientes.length && recientes[0] < hace1h) recientes.shift()
  return recientes.length < MAX_HORA
}

async function responder(encargo, respuesta) {
  const r = await crm('PATCH', '/api/agentes/encargos', { cuerpo: { accion: 'responder', id: encargo.id, respuesta } })
  if (r.ok) log(`respondido "${encargo.titulo}"`)
  else log(`no pude responder "${encargo.titulo}" (${r.status}): ${r.cuerpo?.error ?? 'sin detalle'}`)
  return r.ok
}

/** Atiende UN encargo. Devuelve true si hizo algo (para volver a consultar pronto). */
async function atender(encargo, identidad, ctx) {
  const estado = leerEstado(ctx.rutaEstado)
  const local = estado.tomados[encargo.id]
  const accion = decidir(encargo, local)

  if (accion === 'ajeno') return false
  if (accion === 'rendirse') {
    if (await responder(encargo, respuestaRendida(local.intentos))) {
      delete estado.tomados[encargo.id]
      guardarEstado(ctx.rutaEstado, estado)
    }
    return true
  }
  if (!quedaCupo()) {
    log(`tope de ${MAX_HORA} encargos por hora; "${encargo.titulo}" espera`)
    return false
  }

  // Se anota ANTES de tomarlo: si la máquina se apaga justo después, al volver
  // sabe que era suyo y lo retoma en vez de dejarlo en curso para siempre.
  estado.tomados[encargo.id] = { intentos: (local?.intentos ?? 0) + 1, desde: new Date().toISOString() }
  guardarEstado(ctx.rutaEstado, estado)

  if (accion === 'tomar') {
    const t = await crm('PATCH', '/api/agentes/encargos', { cuerpo: { accion: 'tomar', id: encargo.id } })
    if (!t.ok) {
      log(`no pude tomar "${encargo.titulo}" (${t.status}): ${t.cuerpo?.error ?? 'sin detalle'}`)
      delete estado.tomados[encargo.id]
      guardarEstado(ctx.rutaEstado, estado)
      return false
    }
  }

  recientes.push(Date.now())
  log(`trabajando "${encargo.titulo}" (intento ${estado.tomados[encargo.id].intentos})`)
  const resultado = await ejecutar(armarPrompt(encargo, { agente: identidad, crm: CRM }), encargo.id)
  log(`ejecutor terminó en ${Math.round(resultado.ms / 1000)} s (código ${resultado.codigo}${resultado.vencido ? ', vencido' : ''})`)

  if (await responder(encargo, armarRespuesta(resultado))) {
    const despues = leerEstado(ctx.rutaEstado)
    delete despues.tomados[encargo.id]
    guardarEstado(ctx.rutaEstado, despues)
  }
  return true
}

async function quienSoy() {
  const m = await crm('GET', '/api/agentes/manual')
  if (!m.ok) return null
  const a = m.cuerpo?.agente
  return typeof a === 'object' && a ? { id: a.id, nombre: a.nombre } : null
}

async function diagnostico() {
  console.log(`CRM:      ${CRM}`)
  console.log(`Token:    ${TOKEN ? 'presente' : `FALTA (TRYVEX_AGENTE_TOKEN o ${ARCHIVO_TOKEN})`}`)
  console.log(`Ejecutor: ${EJECUTOR || 'FALTA (--ejecutor "claude -p")'}`)
  if (!TOKEN) return 1
  const yo = await quienSoy()
  console.log(`Agente:   ${yo ? `${yo.nombre} (${yo.id})` : 'no pude identificarme: token inválido, vencido o CRM caído'}`)
  if (!yo) return 1
  const e = await crm('GET', '/api/agentes/encargos?todos=1')
  if (!e.ok) { console.log(`Encargos: FALLA (${e.status}) ${e.cuerpo?.error ?? ''}`); return 1 }
  const lista = e.cuerpo.encargos ?? []
  const cuenta = lista.reduce((acc, x) => ({ ...acc, [x.estado]: (acc[x.estado] ?? 0) + 1 }), {})
  console.log(`Encargos: ${lista.length ? Object.entries(cuenta).map(([k, v]) => `${v} ${k}`).join(', ') : 'ninguno'}`)
  console.log(`Estado:   ${archivoEstado(yo.id)}`)
  return EJECUTOR ? 0 : 1
}

async function main() {
  if (DIAG) process.exit(await diagnostico())
  if (!TOKEN) { log('sin token de agente: no arranco (ver --diag)'); process.exit(1) }
  if (!EJECUTOR) { log('sin ejecutor: indique --ejecutor "claude -p" (ver --diag)'); process.exit(1) }

  const yo = await quienSoy()
  if (!yo) { log('el CRM no reconoce este token: no arranco (ver --diag)'); process.exit(1) }
  const ctx = { rutaEstado: archivoEstado(yo.id) }
  log(`${yo.nombre} escuchando ${CRM} · ejecutor "${EJECUTOR}" · tope ${MAX_HORA}/h`)

  let etag
  let espera = 15_000
  do {
    const r = await crm('GET', '/api/agentes/encargos', { etag })
    let huboCambios = false
    if (!r.ok) {
      log(`no pude leer los encargos (${r.status}): ${r.cuerpo?.error ?? 'sin detalle'}`)
    } else if (r.status !== 304) {
      etag = r.etag ?? undefined
      // Uno por pasada: después de cada encargo se vuelve a preguntar, así
      // uno urgente aprobado mientras tanto no queda detrás de los demás.
      for (const encargo of r.cuerpo.encargos ?? []) {
        try {
          if (await atender(encargo, yo.nombre, ctx)) { huboCambios = true; etag = undefined; break }
        } catch (e) {
          log(`error con "${encargo.titulo}": ${e instanceof Error ? e.message : String(e)}`)
        }
      }
    }
    if (UNA_VEZ) break
    espera = siguienteEspera(espera, huboCambios)
    await new Promise((listo) => setTimeout(listo, huboCambios ? 500 : espera))
  } while (true)
}

main().catch((e) => {
  log(`fatal: ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
})
