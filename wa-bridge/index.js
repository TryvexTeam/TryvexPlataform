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
import crypto from 'node:crypto'
import pkg from 'whatsapp-web.js'
import qrcodeTerminal from 'qrcode-terminal'
import qrcodeImage from 'qrcode'
import { createClient } from '@supabase/supabase-js'
import { parsearPermitidos, estaPermitido } from './permitidos.js'
import { crearFila } from './fila.js'
import { aJobDeEnvio } from './buzon.js'

const { Client, LocalAuth } = pkg
const env = process['env']

const PORT = Number(env.WA_BRIDGE_PORT || 4600)
const CHIP_ID = env.WA_BRIDGE_CHIP_ID || 'tryvex-principal'
const SEND_INTERVAL_MS = Number(env.WA_BRIDGE_SEND_INTERVAL_MS || 60000)

// Modo prueba: si esta puesta, el puente SOLO toca estas conversaciones.
// Vacia o ausente = comportamiento normal. Ver permitidos.js para el porque.
const SOLO_NUMEROS = parsearPermitidos(env.WA_BRIDGE_SOLO_NUMEROS)
if (SOLO_NUMEROS.length > 0) {
  console.warn(`[wa-bridge] MODO PRUEBA: solo se atienden ${SOLO_NUMEROS.length} numero(s). El resto se ignora entero.`)
}

// Nombres de variable propios de este proceso (no los mismos que usa Next.js)
// para no chocar de config y para poder rotar la key de este servicio sin
// tocar la app principal.
const supabaseUrl = env.WA_BRIDGE_DB_URL
const supabaseKey = env.WA_BRIDGE_DB_SECRET

if (!supabaseUrl || !supabaseKey) {
  console.error('[wa-bridge] Faltan las credenciales de Supabase. Ver ENV-SETUP.md.')
  process.exit(1)
}

// Fail-closed, no fail-open. Hallazgo de la revision de seguridad (2026-07-17):
// antes esto era `env.WA_BRIDGE_INTERNAL_TOKEN || ''` y los checks tenian la
// forma `if (INTERNAL_TOKEN && valor !== INTERNAL_TOKEN)` -- si la variable
// faltaba, INTERNAL_TOKEN quedaba en '' (falsy), el && cortaba, y TANTO /qr
// como /send quedaban servidos sin ninguna autenticacion a quien sea que
// llegue al puerto. Un typo o un archivo de entorno sin montar en el deploy
// de manana hubiera dejado el numero real de Tryvex abierto a cualquiera con
// la URL del tunel. Ahora el proceso ni arranca sin los dos tokens.
//
// Dos tokens separados (no uno solo): filtrar el de /qr (que se comparte por
// chat para coordinar el escaneo remoto) no debe dar de regalo la capacidad
// de /send (envio indefinido de WhatsApp real). Ver hallazgo de la revision
// sobre "mismo token para pairing y para envio, sin scoping de privilegios".
const SEND_TOKEN = env.WA_BRIDGE_INTERNAL_TOKEN || ''
const QR_TOKEN = env.WA_BRIDGE_QR_TOKEN || ''

if (!SEND_TOKEN || !QR_TOKEN) {
  console.error(
    '[wa-bridge] Faltan WA_BRIDGE_INTERNAL_TOKEN y/o WA_BRIDGE_QR_TOKEN. ' +
    'Sin estos, /send y /qr quedarian sin autenticacion. Genera valores con ' +
    '`node -e "console.log(require(\'crypto\').randomBytes(24).toString(\'hex\'))"` y agregalos a las variables de entorno. Ver ENV-SETUP.md.'
  )
  process.exit(1)
}

// Comparacion constant-time (defensa en profundidad contra timing attacks;
// el riesgo practico es bajo pero el fix es gratis).
function tokenValido(recibido, esperado) {
  if (!recibido) return false
  const a = Buffer.from(String(recibido))
  const b = Buffer.from(esperado)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
})

// ---------------------------------------------------------------------------
// Validacion de input (hallazgos de la revision de seguridad: nada de esto
// se validaba antes -- telefono arbitrario, texto sin limite, atribucion sin
// whitelist. Todo llega ya autenticado por token, pero el token es un secreto
// compartido, no identidad por-usuario, asi que igual conviene acotar el daño
// que puede hacer cualquier poseedor del token, sea legitimo o filtrado).
// ---------------------------------------------------------------------------

// Misma heuristica que lib/vex/telefono.ts del lado Next.js (duplicada a
// proposito: wa-bridge es un proceso Node separado, con su propio
// package.json, no comparte modulos con la app).
function normalizarTelefono(telefono) {
  if (!telefono) return null
  let d = String(telefono).replace(/\D/g, '')
  if (d.length < 8) return null
  if (d.startsWith('56')) return d
  if (d.length === 9) return '56' + d
  if (d.length === 8) return '569' + d
  return d
}

const TEXTO_MAX_LEN = 4096 // limite practico de WhatsApp, ver hallazgo "texto sin limite de longitud"
const AGENTES_ENVIADOR = ['JARVIS', 'ARIEL', 'SPIKE']
// enviado_por tambien acepta nombre de humano (migracion 015 lo documenta asi:
// 'JARVIS'|'ARIEL'|'SPIKE'|nombre del humano) -- no es un enum cerrado, pero
// tampoco texto libre sin cota: bloquea vacios, strings gigantes y caracteres
// de control que no pintan en un nombre real.
function enviadoPorValido(valor) {
  if (typeof valor !== 'string') return false
  const v = valor.trim()
  if (v.length < 2 || v.length > 60) return false
  if (AGENTES_ENVIADOR.includes(v.toUpperCase())) return true
  return /^[\p{L}\s.'-]+$/u.test(v)
}

const MAX_BODY_BYTES = 8 * 1024 // el payload esperado es chico: telefono/texto/ids/enviado_por
const MAX_COLA = 500 // tope de encolado -- ver hallazgo "cola sin cota superior"

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
let ultimoQr = null

waClient.on('qr', (qr) => {
  ultimoQr = qr
  console.log('[wa-bridge] Escanea este QR con el telefono del numero de Tryvex (una sola vez):')
  qrcodeTerminal.generate(qr, { small: true })
})

waClient.on('ready', () => {
  sesionLista = true
  ultimoQr = null
  reintentosReconexion = 0
  console.log('[wa-bridge] Sesion de WhatsApp lista.')
})

// Reconexion automatica. Sin esto, una desconexion (WhatsApp cierra la sesion
// del lado del telefono, se cae el socket, etc.) dejaba el proceso vivo pero
// mudo: /health seguia respondiendo 200 con sesionLista:false para siempre,
// hasta que un humano notaba y reiniciaba el proceso a mano. `initialize()`
// solo se llamaba una vez, al arrancar (mas abajo).
//
// 'LOGOUT' es un caso aparte: significa que la sesion ya no existe del lado
// de WhatsApp (alguien la cerro desde el telefono, o WhatsApp la invalido).
// Llamar initialize() ahi de nuevo solo generaria un QR nuevo que nadie esta
// mirando -- no hay forma de que el reintento automatico "arregle" un logout,
// asi que no se reintenta: se loguea fuerte para que quede claro que hace
// falta reescanear el QR a mano (via /qr), y se deja que el heartbeat.js
// existente avise al equipo por el webhook de que sesionLista quedo en false.
const RECONEXION_INTERVALO_MS = Number(env.WA_BRIDGE_RECONEXION_INTERVALO_MS || 30000)
const RECONEXION_MAX_INTENTOS = Number(env.WA_BRIDGE_RECONEXION_MAX_INTENTOS || 5)
let reintentosReconexion = 0
let reconectando = false

waClient.on('disconnected', (reason) => {
  sesionLista = false
  console.error('[wa-bridge] Sesion desconectada:', reason)

  if (reason === 'LOGOUT') {
    console.error(
      '[wa-bridge] LOGOUT: la sesion ya no existe del lado de WhatsApp. ' +
      'No se reintenta automaticamente -- reescanea el QR a mano en /qr. ' +
      'El heartbeat existente (heartbeat.js) va a alertar por webhook mientras sesionLista siga en false.'
    )
    return
  }

  programarReconexion(reason)
})

function programarReconexion(reason) {
  if (reconectando) return
  reconectando = true
  reintentosReconexion += 1

  if (reintentosReconexion > RECONEXION_MAX_INTENTOS) {
    console.error(
      `[wa-bridge] Se agotaron los ${RECONEXION_MAX_INTENTOS} reintentos de reconexion tras "${reason}". ` +
      'Me rindo -- queda esperando la alerta del heartbeat existente (heartbeat.js) y una intervencion manual.'
    )
    reconectando = false
    return
  }

  console.warn(
    `[wa-bridge] Reintentando conexion en ${RECONEXION_INTERVALO_MS / 1000}s ` +
    `(intento ${reintentosReconexion}/${RECONEXION_MAX_INTENTOS}, motivo: ${reason})`
  )

  setTimeout(async () => {
    try {
      await waClient.destroy()
      await waClient.initialize()
      // Si initialize() no tira error, el evento 'ready' (que resetea
      // reintentosReconexion a 0 mas abajo) confirma la reconexion real.
    } catch (err) {
      console.error('[wa-bridge] fallo el intento de reconexion:', err)
    } finally {
      reconectando = false
    }
  }, RECONEXION_INTERVALO_MS)
}

// Mensajes entrantes: se resuelve el lead por telefono y se guarda direccion='in'.
//
// IMPORTANTE: mensajes_wa tiene el constraint chk_mensajes_wa_dueno
// (lead_id IS NOT NULL OR cliente_id IS NOT NULL) — un insert con los dos en
// null falla y el mensaje se pierde. Por eso, si no matchea ningun lead
// existente, se crea uno minimo (ver crearLeadDesdeNumeroDesconocido) en vez
// de arriesgarse a perder un mensaje real de un cliente potencial. Se marca
// claramente para que el equipo lo triage — no es una decision de producto
// silenciosa, es la unica forma de no perder el mensaje.
// Ver fila.js: serializa por numero para no duplicar fichas en una rafaga.
const enFilaPara = crearFila()

waClient.on('message', async (msg) => {
  if (msg.fromMe) return
  try {
    // WhatsApp ya no siempre entrega el telefono: manda un LID (identificador
    // interno, '...@lid') que NO tiene los digitos del numero. Sin traducirlo,
    // NINGUN entrante queda identificado: la lista blanca los bota a todos y,
    // sin lista, se crean fichas cuyo campo telefono guarda un ID falso al que
    // nadie puede responder (asi se ensuciaron 9 fichas entre jul y ago 2026).
    // La traduccion la da la propia libreria.
    let numero = msg.from.replace('@c.us', '')
    if (msg.from.endsWith('@lid')) {
      try {
        const [par] = await waClient.getContactLidAndPhone([msg.from])
        if (!par?.pn) {
          console.log('[wa-bridge] entrante IGNORADO: el LID no se pudo traducir a un telefono')
          return
        }
        numero = par.pn.replace('@c.us', '')
      } catch (err) {
        // Ante la duda no se guarda nada de nadie: mejor perder un mensaje que
        // registrar a una persona bajo un identificador que no es su numero.
        console.log('[wa-bridge] entrante IGNORADO: fallo la traduccion del LID:', err?.message ?? err)
        return
      }
    }

    // Modo prueba: si no esta autorizado, no se guarda NADA — ni el texto, ni
    // el numero, ni una ficha. Va antes de resolverLeadPorTelefono a proposito:
    // ese camino crea leads, y crear una ficha ya seria registrar a la persona.
    if (!estaPermitido(numero, SOLO_NUMEROS)) {
      // Se descarta, pero dejando rastro: sin esta linea no habia forma de
      // distinguir "no escribio nadie" de "escribio alguien y lo filtramos", y
      // eso fue justo lo que escondio el bug del LID durante semanas. Solo los
      // ultimos 4 digitos: alcanza para diagnosticar sin registrar a la persona.
      console.log(`[wa-bridge] entrante IGNORADO (numero no autorizado, ...${numero.slice(-4)})`)
      return
    }

    await enFilaPara(numero, async () => {
      let lead = await resolverLeadPorTelefono(numero)
      let leadCreadoAhora = false

      if (!lead) {
        lead = await crearLeadDesdeNumeroDesconocido(numero)
        leadCreadoAhora = true
      }

      const { error } = await supabase.from('mensajes_wa').insert({
        lead_id: lead.id,
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

      if (leadCreadoAhora) {
        console.warn(`[wa-bridge] mensaje entrante de ${numero} sin lead previo — se creo lead nuevo ${lead.id} para no perder el mensaje. Revisar/triage manual.`)
      }
    })
  } catch (err) {
    console.error('[wa-bridge] error procesando mensaje entrante:', err)
  }
})

async function crearLeadDesdeNumeroDesconocido(numero) {
  // Default conservador y reversible: se crea el lead para que el mensaje
  // (y el numero de quien escribe) no se pierdan. Un humano puede corregir
  // nombre/estado despues desde el CRM. estado='contactado' porque ya hubo
  // contacto real (ellos escribieron), aunque el significado habitual de ese
  // estado en el resto del código es "nosotros los contactamos" — es una
  // aproximacion, señalada acá a propósito para que el equipo la revise.
  const { data, error } = await supabase
    .from('fact_leads')
    .insert({
      nombre_negocio: `WhatsApp +${numero}`,
      telefono: numero,
      origen: 'manual',
      estado: 'contactado',
      notas: 'Lead creado automáticamente por wa-bridge: mensaje de WhatsApp entrante de un número sin match previo. Revisar y completar datos.',
    })
    .select('id, telefono')
    .single()

  if (error) {
    // Ultimo recurso: si ni siquiera se puede crear el lead, no hay donde
    // colgar el mensaje sin violar el constraint de la tabla. Se loguea con
    // el texto completo para no perder la evidencia, aunque no quede en DB.
    console.error(`[wa-bridge] CRITICO: no se pudo crear lead para ${numero}, el mensaje no se pudo guardar en mensajes_wa:`, error)
    throw error
  }
  return data
}

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

// Lee el body con un tope de bytes -- sin esto, un POST con un body enorme
// se acumula entero en memoria del unico proceso que sostiene la sesion de
// WhatsApp (hallazgo: "DoS por memoria"). Dos bugs encontrados y corregidos
// en carne propia mientras se probaba esto (no teoricos, tumbaron el
// proceso entero en Windows):
//   1. Llamar req.destroy() DENTRO de un `for await (const chunk of req)`
//      mientras el iterador sigue consumiendo el stream -> excepcion no
//      controlada a nivel de runtime. Se cambio a un patron basado en
//      eventos ('data'/'end'), sin async iterator.
//   2. Llamar req.destroy() y DESPUES intentar responder (res.writeHead/
//      res.end) sobre el socket ya destruido -> tira una excepcion sincrona
//      dentro del handler async, que Node trata como promesa rechazada sin
//      manejar y MATA EL PROCESO (comportamiento default desde Node 15+).
//      Fix: nunca destruir el socket aca. Dejar que quien llama responda
//      normal (413) y que el ciclo normal de request/response cierre la
//      conexion -- no hace falta cortar el socket a mano para lograr el
//      mismo resultado (rechazar el body demasiado grande).
function leerBodyConLimite(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const contentLength = Number(req.headers['content-length'] || 0)
    if (contentLength > maxBytes) {
      reject(new Error('body excede el tamaño maximo permitido'))
      return
    }

    let total = 0
    let rechazado = false
    const chunks = []
    req.on('data', (chunk) => {
      if (rechazado) return
      total += chunk.length
      if (total > maxBytes) {
        rechazado = true
        reject(new Error('body excede el tamaño maximo permitido'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (!rechazado) resolve(Buffer.concat(chunks).toString('utf-8'))
    })
    req.on('error', (err) => {
      if (!rechazado) reject(err)
    })
  })
}

// ---------------------------------------------------------------------------
// Servidor HTTP interno — Next.js le habla por aca via app/api/wa/send/route.ts.
// Bindeado a loopback a proposito (hallazgo: "escucha en 0.0.0.0, exposicion
// que no depende del tunel"): cloudflared/cualquier tunel apunta a localhost
// igual, no hace falta escuchar en todas las interfaces de red del host.
// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, sesionLista, colaPendiente: colaEnvio.length }))
    return
  }

  // Sirve el QR actual como pagina HTML (se abre directo en el navegador,
  // pensado para escaneo REMOTO cuando quien tiene el telefono no esta en la
  // misma maquina que corre el bridge). Token por query param porque lo abre
  // un navegador humano, no un fetch con headers custom -- por eso es un
  // token DISTINTO al de /send (QR_TOKEN, no SEND_TOKEN): que se filtre por
  // historial de navegador o por el chat donde se comparte para coordinar el
  // escaneo no debe dar de regalo la capacidad de mandar mensajes.
  if (req.method === 'GET' && url.pathname === '/qr') {
    if (!tokenValido(url.searchParams.get('token'), QR_TOKEN)) {
      res.writeHead(401, { 'Content-Type': 'text/plain' })
      res.end('token invalido')
      return
    }

    if (sesionLista) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end('<html><body style="font-family:sans-serif;text-align:center;margin-top:4em"><h2>Sesion ya conectada</h2><p>No hace falta escanear nada.</p></body></html>')
      return
    }

    if (!ultimoQr) {
      res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end('<html><body style="font-family:sans-serif;text-align:center;margin-top:4em"><h2>Todavia no hay QR</h2><p>El bridge esta arrancando, recarga en unos segundos.</p></body></html>')
      return
    }

    const dataUrl = await qrcodeImage.toDataURL(ultimoQr, { width: 400 })
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(`<html><head><meta http-equiv="refresh" content="20"></head><body style="font-family:sans-serif;text-align:center;margin-top:2em">
      <h2>Escanea con WhatsApp -> Dispositivos vinculados</h2>
      <img src="${dataUrl}" alt="QR de WhatsApp" />
      <p>Esta pagina se refresca sola cada 20s (el QR expira y se regenera solo).</p>
      <p style="color:#888;font-size:0.85em">Cierra esta pestaña y avisa al equipo apenas termines de escanear -- el link deja de servir para nada mas una vez conectado, pero mejor cerrar el tunel igual.</p>
    </body></html>`)
    return
  }

  if (req.method === 'POST' && url.pathname === '/send') {
    // Orden a proposito: auth -> tamaño del body -> forma del JSON -> validez
    // de cada campo -> RECIEN AHI el chequeo de sesionLista/cola. Asi un
    // request mal formado siempre da 400 (rechazo rapido, informativo),
    // nunca queda enmascarado detras de un 503 de "sesion no lista" que no
    // dice nada sobre si el request en si era valido.
    if (!tokenValido(req.headers['x-bridge-token'], SEND_TOKEN)) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'token invalido' }))
      return
    }

    let body
    try {
      body = await leerBodyConLimite(req, MAX_BODY_BYTES)
    } catch {
      res.writeHead(413, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'body demasiado grande' }))
      return
    }

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
    const { texto, lead_id, cliente_id, es_bot, enviado_por } = payload

    const telefono = normalizarTelefono(payload.telefono)
    if (!telefono) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'telefono invalido o ausente' }))
      return
    }

    // En modo prueba, un envio a un numero no autorizado se rechaza: una prueba
    // no puede terminar llegandole a un lead real.
    if (!estaPermitido(telefono, SOLO_NUMEROS)) {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'modo prueba activo: ese numero no esta en WA_BRIDGE_SOLO_NUMEROS' }))
      return
    }
    if (typeof texto !== 'string' || texto.length === 0 || texto.length > TEXTO_MAX_LEN) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: `texto ausente o excede ${TEXTO_MAX_LEN} caracteres` }))
      return
    }
    if (!enviadoPorValido(enviado_por)) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'enviado_por invalido (agente conocido o nombre de humano, 2-60 caracteres)' }))
      return
    }

    if (!sesionLista) {
      res.writeHead(503, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Sesion de WhatsApp no esta lista todavia' }))
      return
    }

    if (colaEnvio.length >= MAX_COLA) {
      res.writeHead(429, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: `cola llena (${MAX_COLA} pendientes), reintenta mas tarde` }))
      return
    }

    const resultado = await new Promise((resolve, reject) => {
      encolarEnvio({ telefono, texto, lead_id, cliente_id, es_bot, enviado_por: enviado_por.trim(), resolve, reject })
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


// ---------------------------------------------------------------------------
// El buzon: el CRM anota en outreach_messages y este ciclo lo pasa a buscar.
// El CRM corre en Vercel y este proceso escucha en 127.0.0.1 — no hay forma de
// que nos llame. Ver la migracion 041 y el diseno del 10-ago-2026.
// ---------------------------------------------------------------------------
const BUZON_INTERVALO_MS = Number(env.WA_BRIDGE_BUZON_INTERVALO_MS || 10000)

async function vaciarBuzon() {
  if (!sesionLista) return

  // Una por vuelta: el envio real ya tiene su propio throttle de un mensaje por
  // minuto, no tiene sentido acumular aca.
  const { data: filas, error } = await supabase
    .from('outreach_messages')
    .select('id, lead_id, texto, enviado_por')
    .eq('estado', 'encolado')
    .eq('canal', 'whatsapp')
    .order('created_at')
    .limit(1)

  if (error) {
    console.error('[wa-bridge] no pude leer el buzon:', error)
    return
  }
  if (!filas || filas.length === 0) return

  const fila = filas[0]

  // Se RESERVA antes de mandar. Si se marcara despues, dos vueltas solapadas
  // (o un reinicio a mitad de camino) mandarian el mismo mensaje dos veces —
  // y un mensaje repetido a un cliente no se puede deshacer.
  //
  // 'enviando' y no 'enviado': todavia no salio, y decir que salio seria
  // mentir. Si el proceso muere aca, la fila queda trabada en 'enviando' — es
  // visible y se puede revisar, que es mucho mejor que un duplicado silencioso.
  const { data: tomada } = await supabase
    .from('outreach_messages')
    .update({ estado: 'enviando' })
    .eq('id', fila.id)
    .eq('estado', 'encolado')
    .select('id')
  if (!tomada || tomada.length === 0) return   // otra vuelta se lo llevo

  const { data: lead } = await supabase
    .from('fact_leads')
    .select('telefono')
    .eq('id', fila.lead_id)
    .single()

  const job = aJobDeEnvio(fila, lead)
  if (!job) {
    await supabase
      .from('outreach_messages')
      .update({ estado: 'fallido', error: 'el lead no tiene un telefono usable' })
      .eq('id', fila.id)
    console.warn(`[wa-bridge] buzon: ${fila.id} sin telefono usable`)
    return
  }

  if (!estaPermitido(job.telefono, SOLO_NUMEROS)) {
    await supabase
      .from('outreach_messages')
      .update({ estado: 'fallido', error: 'modo prueba: numero no autorizado' })
      .eq('id', fila.id)
    console.warn(`[wa-bridge] buzon: ${fila.id} bloqueado por modo prueba`)
    return
  }

  try {
    await new Promise((resolve, reject) => encolarEnvio({ ...job, resolve, reject }))
    // Recien AHORA salio de verdad.
    await supabase
      .from('outreach_messages')
      .update({ estado: 'enviado', enviado_at: new Date().toISOString() })
      .eq('id', fila.id)
    console.log(`[wa-bridge] buzon: ${fila.id} enviado a ${job.telefono}`)
  } catch (err) {
    await supabase
      .from('outreach_messages')
      .update({ estado: 'fallido', error: String(err?.message || err) })
      .eq('id', fila.id)
    console.error(`[wa-bridge] buzon: fallo ${fila.id}:`, err)
  }
}

setInterval(() => {
  vaciarBuzon().catch((err) => console.error('[wa-bridge] vuelta del buzon fallida:', err))
}, BUZON_INTERVALO_MS)

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[wa-bridge] servidor HTTP interno escuchando en 127.0.0.1:${PORT}`)
})
