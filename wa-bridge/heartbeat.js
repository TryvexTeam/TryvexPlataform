// wa-bridge/heartbeat.js
//
// Vigia del puente de WhatsApp. Nace de una discusion en #chatia (2026-07-17):
// que solo el nodo de Ariel este vigilando 24/7 es un punto unico de falla —
// si ese nodo cae, nadie se entera de que la sesion de WhatsApp murio.
//
// Por eso este vigia NO depende de en que maquina corre el propio wa-bridge:
// hace polling HTTP a /health y, si detecta caida, avisa por un webhook de
// Discord (no por un archivo local ni por el mismo proceso que podria estar
// caido). Correlo como proceso separado de index.js — si el bridge se cae,
// el vigia sigue vivo y puede avisar.
//
// Uso: node heartbeat.js  (correrlo con un supervisor tipo systemd/pm2 para
// que se reinicie solo si el proceso del vigia mismo muere).

const env = process['env']

const BRIDGE_HEALTH_URL = env.WA_BRIDGE_HEALTH_URL || 'http://localhost:' + (env.WA_BRIDGE_PORT || 4600) + '/health'
const WEBHOOK_URL = env.WA_BRIDGE_HEARTBEAT_WEBHOOK_URL
const CHECK_INTERVAL_MS = Number(env.WA_BRIDGE_HEARTBEAT_INTERVAL_MS || 60000)
const FALLOS_PARA_ALERTAR = Number(env.WA_BRIDGE_HEARTBEAT_UMBRAL || 3)

if (!WEBHOOK_URL) {
  console.warn('[wa-bridge:heartbeat] WA_BRIDGE_HEARTBEAT_WEBHOOK_URL no configurado — el vigia corre pero no puede avisar al equipo si algo se cae.')
}

let fallosConsecutivos = 0
let estadoActual = 'desconocido' // 'sano' | 'caido'

async function avisar(texto) {
  if (!WEBHOOK_URL) {
    console.error('[wa-bridge:heartbeat] ALERTA (sin webhook para reenviar):', texto)
    return
  }
  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: texto }),
    })
  } catch (err) {
    console.error('[wa-bridge:heartbeat] no se pudo avisar por webhook:', err)
  }
}

async function chequear() {
  try {
    const res = await fetch(BRIDGE_HEALTH_URL, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) throw new Error('health respondio status ' + res.status)
    const data = await res.json()
    if (!data.ok || !data.sesionLista) throw new Error('bridge activo pero sesion de WhatsApp no lista')

    fallosConsecutivos = 0
    if (estadoActual !== 'sano') {
      estadoActual = 'sano'
      await avisar('🟢 [VIGIA wa-bridge] Sesion de WhatsApp recuperada, todo sano de nuevo.')
      console.log('[wa-bridge:heartbeat] recuperado')
    }
  } catch (err) {
    fallosConsecutivos += 1
    console.error(`[wa-bridge:heartbeat] chequeo fallido (${fallosConsecutivos}/${FALLOS_PARA_ALERTAR}):`, err.message)

    if (fallosConsecutivos >= FALLOS_PARA_ALERTAR && estadoActual !== 'caido') {
      estadoActual = 'caido'
      await avisar(
        `🔴 [VIGIA wa-bridge] La sesion de WhatsApp parece caida (${fallosConsecutivos} chequeos fallidos seguidos, cada ${CHECK_INTERVAL_MS / 1000}s). ` +
        `Ultimo error: ${err.message}. El funnel de contacto esta ciego hasta que alguien lo revise.`
      )
    }
  }
}

console.log(`[wa-bridge:heartbeat] vigilando ${BRIDGE_HEALTH_URL} cada ${CHECK_INTERVAL_MS / 1000}s`)
chequear()
setInterval(chequear, CHECK_INTERVAL_MS)
