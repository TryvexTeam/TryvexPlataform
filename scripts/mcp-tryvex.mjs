#!/usr/bin/env node
// mcp-tryvex.mjs — EL CRM DE TRYVEX COMO HERRAMIENTAS MCP, CON EL TOKEN DEL
// AGENTE COMO ÚNICA LLAVE.
//
// El puente (puente-agente.mjs) le lleva los encargos al modelo. Esto es la
// otra mitad: que un modelo que ya está trabajando (Claude Code, Codex, lo que
// hable MCP) pueda leer el manual, sus encargos, las directivas y el chat del
// equipo, y escribir, como herramientas nativas.
//
// Pocas herramientas a propósito: cada una ocupa contexto del modelo en cada
// conversación. Las cinco frecuentes van con nombre propio; lo demás (consumo,
// rutinas, mejoras, citas, demos) pasa por `tryvex_api`, que SOLO acepta rutas
// /api/agentes/… — el token nunca sale hacia otra parte del CRM ni otro dominio.
//
// Sin dependencias: habla MCP por stdio (JSON-RPC, un mensaje por línea). La
// salida estándar es del protocolo; los avisos van a stderr.
//
// Instalar en Claude Code (una vez):
//   claude mcp add tryvex -- node /ruta/a/TryvexPlataform/scripts/mcp-tryvex.mjs
// con TRYVEX_AGENTE_TOKEN en el entorno o el token en ~/.claude/.tryvex-agente-token.
import { createInterface } from 'node:readline'
import { leerToken, rutaPermitida, sinTokens, urlCrm } from './puente-agente/llave.mjs'

const CRM = urlCrm()
const { token: TOKEN, aviso } = leerToken()
const MAX_TEXTO = 20_000
const aviso_ = (m) => process.stderr.write(`[mcp-tryvex] ${m}\n`)
if (aviso) aviso_(`ojo: ${aviso}`)
if (!TOKEN) aviso_('sin token de agente: las herramientas van a responder que falta la llave')

const HERRAMIENTAS = [
  {
    name: 'tryvex_manual',
    description: 'Quién soy (el agente dueño del token) y todo lo que puedo hacer en el CRM de Tryvex: rutas, reglas y el ciclo de trabajo recomendado. Llamar primero.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'tryvex_encargos',
    description: 'Mis encargos del CRM: lo aprobado y en curso (mi trabajo). Con todos=true incluye lo que espera permiso humano, que se puede ver pero NO trabajar.',
    inputSchema: {
      type: 'object',
      properties: { todos: { type: 'boolean', description: 'Incluir lo que espera permiso (solo lectura).' } },
      additionalProperties: false,
    },
  },
  {
    name: 'tryvex_encargo',
    description: 'Tomar un encargo aprobado, o responderlo al terminar. La respuesta es lo que el equipo lee: qué se hizo, cómo se verificó y qué quedó pendiente.',
    inputSchema: {
      type: 'object',
      properties: {
        accion: { type: 'string', enum: ['tomar', 'responder'] },
        id: { type: 'string', description: 'Id del encargo (uuid).' },
        respuesta: { type: 'string', description: 'Obligatoria al responder. Máximo 8000 caracteres.' },
      },
      required: ['accion', 'id'],
      additionalProperties: false,
    },
  },
  {
    name: 'tryvex_chat',
    description: 'El chat agéntico del equipo (canal "Equipo agéntico"). Leer los últimos mensajes o escribir uno. Nunca escribe en mensajes directos de personas.',
    inputSchema: {
      type: 'object',
      properties: {
        accion: { type: 'string', enum: ['leer', 'escribir'] },
        texto: { type: 'string', description: 'Obligatorio al escribir.' },
        limite: { type: 'number', description: 'Al leer: cuántos mensajes (1 a 200, por defecto 30).' },
      },
      required: ['accion'],
      additionalProperties: false,
    },
  },
  {
    name: 'tryvex_estado',
    description: 'Decir en qué estoy, para la oficina de Intelligence: trabajando, descansando o ausente, con una nota corta. Vence solo (por defecto 30 min).',
    inputSchema: {
      type: 'object',
      properties: {
        estado: { type: 'string', enum: ['trabajando', 'descansando', 'ausente'] },
        nota: { type: 'string', description: 'En pocas palabras, máximo 120 caracteres.' },
        minutos: { type: 'number', description: 'Cuánto vale lo declarado: 1 a 480 (por defecto 30).' },
      },
      required: ['estado'],
      additionalProperties: false,
    },
  },
  {
    name: 'tryvex_api',
    description: 'Cualquier otra ruta del manual: directivas, consumo, rutinas, mejoras, citas, demos. Solo rutas que empiezan con /api/agentes/.',
    inputSchema: {
      type: 'object',
      properties: {
        metodo: { type: 'string', enum: ['GET', 'POST', 'PATCH', 'PUT'] },
        ruta: { type: 'string', description: 'Ej.: /api/agentes/directivas?para=conversacion' },
        cuerpo: { type: 'object', description: 'JSON para POST, PATCH o PUT.' },
      },
      required: ['metodo', 'ruta'],
      additionalProperties: false,
    },
  },
]

async function llamar(metodo, ruta, cuerpo) {
  if (!TOKEN) return { ok: false, texto: 'Falta la llave: configure TRYVEX_AGENTE_TOKEN o ~/.claude/.tryvex-agente-token.' }
  if (!rutaPermitida(ruta)) return { ok: false, texto: `Ruta no permitida: ${String(ruta).slice(0, 80)}. Solo /api/agentes/…` }
  try {
    const r = await fetch(`${CRM}${ruta}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json; charset=utf-8' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(20_000),
    })
    const texto = sinTokens(await r.text())
    const recortado = texto.length > MAX_TEXTO ? `${texto.slice(0, MAX_TEXTO)}\n[…recortado]` : texto
    return { ok: r.ok, texto: r.ok ? recortado : `El CRM respondió ${r.status}: ${recortado}` }
  } catch (e) {
    return { ok: false, texto: `No pude hablar con el CRM (${CRM}): ${e instanceof Error ? e.message : String(e)}` }
  }
}

function ejecutarHerramienta(nombre, a = {}) {
  switch (nombre) {
    case 'tryvex_manual':
      return llamar('GET', '/api/agentes/manual')
    case 'tryvex_encargos':
      return llamar('GET', a.todos ? '/api/agentes/encargos?todos=1' : '/api/agentes/encargos')
    case 'tryvex_encargo':
      if (a.accion === 'responder' && !a.respuesta?.trim()) return { ok: false, texto: 'Para responder hace falta la respuesta.' }
      return llamar('PATCH', '/api/agentes/encargos', { accion: a.accion, id: a.id, ...(a.accion === 'responder' ? { respuesta: a.respuesta } : {}) })
    case 'tryvex_chat': {
      if (a.accion === 'escribir') {
        if (!a.texto?.trim()) return { ok: false, texto: 'Para escribir hace falta el texto.' }
        return llamar('POST', '/api/agentes/mensajes', { contenido: a.texto })
      }
      const limite = Math.min(Math.max(Math.trunc(Number(a.limite) || 30), 1), 200)
      return llamar('GET', `/api/agentes/mensajes?limite=${limite}`)
    }
    case 'tryvex_estado':
      return llamar('PUT', '/api/agentes/estado', {
        estado: a.estado,
        ...(a.nota ? { nota: a.nota } : {}),
        ...(a.minutos ? { minutos: Math.trunc(Number(a.minutos)) } : {}),
      })
    case 'tryvex_api':
      return llamar(a.metodo, a.ruta, a.metodo === 'GET' ? undefined : a.cuerpo)
    default:
      return Promise.resolve({ ok: false, texto: `Herramienta desconocida: ${nombre}` })
  }
}

function enviar(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`)
}

async function atender(msg) {
  const { id, method, params } = msg
  const esPedido = id !== undefined && id !== null
  try {
    if (method === 'initialize') {
      return enviar({
        jsonrpc: '2.0', id,
        result: {
          protocolVersion: params?.protocolVersion ?? '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'tryvex-crm', version: '1.0.0' },
          instructions: 'CRM de Tryvex para agentes. Empiece por tryvex_manual. Lo que espera permiso humano se puede ver, no trabajar.',
        },
      })
    }
    if (method === 'tools/list') return enviar({ jsonrpc: '2.0', id, result: { tools: HERRAMIENTAS } })
    if (method === 'tools/call') {
      const r = await ejecutarHerramienta(params?.name, params?.arguments ?? {})
      return enviar({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: r.texto }], isError: !r.ok } })
    }
    if (method === 'ping') return enviar({ jsonrpc: '2.0', id, result: {} })
    // Las notificaciones (sin id) no llevan respuesta.
    if (esPedido) enviar({ jsonrpc: '2.0', id, error: { code: -32601, message: `Método no soportado: ${method}` } })
  } catch (e) {
    if (esPedido) enviar({ jsonrpc: '2.0', id, error: { code: -32603, message: e instanceof Error ? e.message : String(e) } })
  }
}

createInterface({ input: process.stdin }).on('line', (linea) => {
  if (!linea.trim()) return
  let msg
  try { msg = JSON.parse(linea) } catch {
    return enviar({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON inválido' } })
  }
  void atender(msg)
})
