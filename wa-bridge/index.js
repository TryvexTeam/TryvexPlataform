// wa-bridge/index.js
//
// Puente WhatsApp Web (no oficial) para el CRM de Tryvex — Boton 2 del funnel.
// Corre como proceso standalone 24/7, separado de Next.js, porque whatsapp-web.js
// necesita una sesion de navegador persistente que no encaja en funciones
// serverless. Expone un servidor HTTP interno simple para que Next.js le hable
// en POST /send (consumido desde app/api/wa/send/route.ts).
//
// Reparto acordado en #chatia (2026-07-17): esta tabla (mensajes_wa) es propiedad
// de escritura de Spike; Jarvis la lee para la vista de Leads, Ariel/Vex la lee
// para "quien respondio". Columna direccion: 'in' | 'out'.
// Ver ENV-SETUP.md para las variables que lee este proceso.

import http from 'node:http'
import pkg from 'whatsapp-web.js'
import qrcode from 'qrcode-terminal'
import { createClient } from '@supabase/supabase-js'

const { Client, LocalAuth } = pkg
const env = process['env']

const PORT = Number(env.WA_BRIDGE_PORT || 4600)
const CHIP_ID = env.WA_BRIDGE_CHIP_ID || 'tryvex-principal'
const SEND_INTERVAL_MS = Number(env.WA_BRIDGE_SEND_INTERVAL_MS || 60000)
const INTERNAL_TOKEN = env.WA_BRIDGE_INTERNAL_TOKEN || ''

// Nombres de variable propios de este proceso (no los mismos que usa Next.js)
// para no chocar de config y para poder rotar la key de este servicio sin
// tocar la app principal.
const supabaseUrl = env.WA_BRIDGE_DB_URL
const supabaseKey = env.WA_BRIDGE_DB_SECRET

if (!supabaseUrl || !supabaseKey) {
  console.error('[wa-bridge] Faltan las credenciales de Supabase. Ver ENV-SETUP.md.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
})

// ---------------------------------------------------------------------------
// Cola de envio con throttle (1 mensaje cada SEND_INTERVAL_MS, ritmo humano).
// ---------------------------------------------------------------------------
const colaEnvio = []
let procesandoCola = false

function encolarEnvio(job) {
  colaEnvio.push(job)
  procesarCola()
}

async function procesarCola() {
  if (procesandoCola) return
  procesandoCola = true
  while (colaEnvio.length > 0) {
    const job = colaEnvio.shift()
    try {
      await enviarMensajeReal(job)
    } catch (err) {
      console.error('[wa-bridge] error enviando:', err)
      job.reject?.(err)
    }
    if (colaEnvio.length > 0) {
      await new Promise((r) => setTimeout(r, SEND_INTERVAL_MS))
    }
  }
  procesandoCola = false
}

async function enviarMensajeReal({ telefono, texto, lead_id, cliente_id, es_bot, enviado_por, resolve, reject }) {
  const numeroWid = `${telefono}@c.us`
  const sentMsg = await waClient.sendMessage(numeroWid, texto)

  const { data, error } = await supabase
    .from('mensajes_wa')
    .insert({
      lead_id: lead_id ?? null,
      cliente_id: cliente_id ?? null,
      direccion: 'out',
      texto,
      wa_message_id: sentMsg?.id?._serialized ?? null,
      chip_id: CHIP_ID,
      es_bot: Boolean(es_bot),
      enviado_por,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[wa-bridge] mensaje salio pero fallo el registro en mensajes_wa:', error)
    reject?.(new Error('Mensaje enviado pero no se pudo registrar: ' + error.message))
    return
  }

  console.log(`[wa-bridge] enviado a ${telefono} (fila ${data.id})`)
  resolve?.(data.id)
}

// ---------------------------------------------------------------------------
// Cliente WhatsApp Web
// ---------------------------------------------------------------------------
const waClient = new Client({
  authStrategy: new LocalAuth({ clientId: CHIP_ID, dataPath: './session' }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
})

let sesionLista = false

waClient.on('qr', (qr) => {
  console.log('[wa-bridge] Escanea este QR con el telefono del numero de Tryvex (una sola vez):')
  qrcode.generate(qr, { small: true })
})

waClient.on('ready', () => {
  sesionLista = true
  console.log('[wa-bridge] Sesion de WhatsApp lista.')
})

waClient.on('disconnected', (reason) => {
  sesionLista = false
  console.error('[wa-bridge] Sesion desconectada:', reason)
})

// Mensajes entrantes: se resuelve el lead por telefono y se guarda direccion='in'.
waClient.on('message', async (msg) => {
  if (msg.fromMe) return
  try {
    const numero = msg.from.replace('@c.us', '')
    const lead = await resolverLeadPorTelefono(numero)

    const { error } = await supabase.from('mensajes_wa').insert({
      lead_id: lead?.id ?? null,
      cliente_id: null,
      direccion: 'in',
      texto: msg.body,
      wa_message_id: msg.id?._serialized ?? null,
      chip_id: CHIP_ID,
      es_bot: false,
      enviado_por: null,
    })

    if (error) {
      console.error('[wa-bridge] error guardando mensaje entrante:', error)
      return
    }

    if (!lead) {
      console.warn(`[wa-bridge] mensaje entrante de ${numero} sin lead asociado, quedo huerfano (lead_id null). Definir con el equipo que hacer con estos.`)
    }
  } catch (err) {
    console.error('[wa-bridge] error procesando mensaje entrante:', err)
  }
})

async function resolverLeadPorTelefono(numero) {
  // Heuristica simple: matchea por los ultimos 8 digitos para tolerar
  // diferencias de formato/prefijo entre lo que guarda fact_leads y lo que
  // entrega WhatsApp.
  const sufijo = numero.replace(/\D/g, '').slice(-8)
  const { data, error } = await supabase
    .from('fact_leads')
    .select('id, telefono')
    .not('telefono', 'is', null)
    .ilike('telefono', `%${sufijo}`)
    .limit(1)

  if (error) {
    console.error('[wa-bridge] error resolviendo lead por telefono:', error)
    return null
  }
  return data?.[0] ?? null
}

waClient.initialize()

// ---------------------------------------------------------------------------
// Servidor HTTP interno — Next.js le habla por aca via app/api/wa/send/route.ts.
// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, sesionLista, colaPendiente: colaEnvio.length }))
    return
  }

  if (req.method === 'POST' && req.url === '/send') {
    if (INTERNAL_TOKEN && req.headers['x-bridge-token'] !== INTERNAL_TOKEN) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'token invalido' }))
      return
    }

    if (!sesionLista) {
      res.writeHead(503, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Sesion de WhatsApp no esta lista todavia' }))
      return
    }

    let body = ''
    for await (const chunk of req) body += chunk
    let payload
    try {
      payload = JSON.parse(body)
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'JSON invalido' }))
      return
    }

    // Contrato acordado con Jarvis: { lead_id, telefono, texto, enviado_por }
    // (cliente_id y es_bot son opcionales, no los usa su panel todavia).
    const { telefono, texto, lead_id, cliente_id, es_bot, enviado_por } = payload
    if (!telefono || !texto || !enviado_por) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'faltan telefono, texto o enviado_por' }))
      return
    }

    const resultado = await new Promise((resolve, reject) => {
      encolarEnvio({ telefono, texto, lead_id, cliente_id, es_bot, enviado_por, resolve, reject })
    }).catch((err) => ({ error: err.message }))

    if (resultado?.error) {
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: resultado.error, encolado: true }))
      return
    }

    res.writeHead(202, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, mensajeWaId: resultado, posicionCola: colaEnvio.length }))
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'no encontrado' }))
})

server.listen(PORT, () => {
  console.log(`[wa-bridge] servidor HTTP interno escuchando en :${PORT}`)
})
