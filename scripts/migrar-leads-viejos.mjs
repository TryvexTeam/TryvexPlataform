/**
 * Task 10 — Migra los leads de la BD vieja (leads-dashboard) al CRM real.
 *
 * Mapea la tabla vieja `fact_leads` (id bigint, esquema scraper Google Maps)
 * al `fact_leads` nuevo del CRM (id uuid, esquema dimensional). Dedup por
 * teléfono normalizado + nombre. Idempotente: re-correr no duplica.
 *
 * Uso (PowerShell):
 *   $env:OLD_SUPABASE_URL="..."; $env:OLD_SUPABASE_SERVICE_KEY="...";
 *   $env:NEW_SUPABASE_URL="..."; $env:NEW_SUPABASE_SERVICE_KEY="...";
 *   node scripts/migrar-leads-viejos.mjs            # dry-run (no escribe)
 *   node scripts/migrar-leads-viejos.mjs --commit   # escribe de verdad
 *
 * Las 4 env vars salen de:
 *   OLD_* -> leads-dashboard/.env.local (SUPABASE_URL / SUPABASE_SERVICE_KEY)
 *   NEW_* -> TryvexPlataform/.env.local (NEXT_PUBLIC_SUPABASE_URL / SERVICE_ROLE_KEY)
 */
import { createClient } from '@supabase/supabase-js'

const COMMIT = process.argv.includes('--commit')

const oldUrl = process.env.OLD_SUPABASE_URL
const oldKey = process.env.OLD_SUPABASE_SERVICE_KEY
const newUrl = process.env.NEW_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const newKey = process.env.NEW_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!oldUrl || !oldKey || !newUrl || !newKey) {
  console.error('❌ Faltan env vars: OLD_SUPABASE_URL, OLD_SUPABASE_SERVICE_KEY, NEW_SUPABASE_URL, NEW_SUPABASE_SERVICE_KEY')
  process.exit(1)
}

const opts = { auth: { autoRefreshToken: false, persistSession: false } }
const viejo = createClient(oldUrl, oldKey, opts)
const nuevo = createClient(newUrl, newKey, opts)

// --- Mapeo de estados (viejo -> nuevo) --------------------------------------
const ESTADO = {
  nuevo: 'sin_contactar',
  contactado: 'contactado',
  interesado: 'interesado',
  cerrado: 'ganado',
  descartado: 'descartado',
}

// Normaliza teléfono chileno a solo dígitos con prefijo país (para dedup)
function normTel(t) {
  if (!t) return null
  const d = String(t).replace(/\D/g, '')
  if (!d) return null
  if (d.startsWith('56')) return '+' + d
  if (d.length === 9) return '+56' + d
  return '+' + d
}

// Compone info extra que no tiene columna propia en el CRM nuevo, hacia notas
function componerNotas(l) {
  const partes = []
  if (l.direccion) partes.push(`Dirección: ${l.direccion}`)
  if (l.rating != null) partes.push(`Rating: ${l.rating}★ (${l.num_resenas ?? 0} reseñas)`)
  if (l.horario) partes.push(`Horario: ${l.horario}`)
  if (l.email) partes.push(`Email: ${l.email}`)
  return partes.length ? partes.join(' · ') : null
}

function mapear(l) {
  return {
    nombre_negocio: l.nombre?.trim() || 'Sin nombre',
    telefono: normTel(l.telefono),
    info_texto: l.info_texto || null,
    redes_sociales: l.redes ? { origen: l.redes } : null,
    tiene_web: l.tiene_web ?? false,
    nicho: l.nicho || null,
    localidad: null,
    score: l.score ?? 0,
    estado: ESTADO[l.estado] || 'sin_contactar',
    origen: 'scraper',
    notas: componerNotas(l),
  }
}

// --- Carga de leads viejos (paginado) ---------------------------------------
async function traerViejos() {
  const todos = []
  const paso = 1000
  for (let desde = 0; ; desde += paso) {
    const { data, error } = await viejo
      .from('fact_leads')
      .select('*')
      .range(desde, desde + paso - 1)
    if (error) throw new Error('Leyendo viejos: ' + error.message)
    todos.push(...data)
    if (data.length < paso) break
  }
  return todos
}

// --- Set de dedup: teléfonos ya presentes en el CRM nuevo -------------------
async function telefonosNuevos() {
  const set = new Set()
  const paso = 1000
  for (let desde = 0; ; desde += paso) {
    const { data, error } = await nuevo
      .from('fact_leads')
      .select('telefono')
      .range(desde, desde + paso - 1)
    if (error) throw new Error('Leyendo nuevos: ' + error.message)
    for (const r of data) if (r.telefono) set.add(r.telefono)
    if (data.length < paso) break
  }
  return set
}

async function main() {
  console.log(`\n🔁 Migración de leads viejos → CRM  [${COMMIT ? 'COMMIT' : 'DRY-RUN'}]\n`)
  const viejos = await traerViejos()
  console.log(`   Leídos de la BD vieja: ${viejos.length}`)

  const yaExisten = await telefonosNuevos()
  console.log(`   Ya en el CRM (por teléfono): ${yaExisten.size}`)

  const vistos = new Set()
  const insertar = []
  let sinTel = 0, dupInterno = 0, dupCrm = 0
  for (const l of viejos) {
    const m = mapear(l)
    if (m.telefono) {
      if (yaExisten.has(m.telefono)) { dupCrm++; continue }
      if (vistos.has(m.telefono)) { dupInterno++; continue }
      vistos.add(m.telefono)
    } else {
      sinTel++ // sin teléfono no se puede dedup: se migra igual, se revisa a mano
    }
    insertar.push(m)
  }

  console.log(`   A insertar: ${insertar.length}  (de ellos con nota extra: ${insertar.filter((m) => m.notas).length}, sin teléfono: ${sinTel})`)
  console.log(`   Saltados — ya en CRM: ${dupCrm} · dup interno: ${dupInterno}`)
  // Cuadratura: cada lead viejo cae en insertar O en un salto. Si no cuadra, algo se pierde.
  const suma = insertar.length + dupCrm + dupInterno
  const cuadra = suma === viejos.length
  console.log(`   CUADRATURA: ${insertar.length} + ${dupCrm} + ${dupInterno} = ${suma} vs ${viejos.length} leídos → ${cuadra ? 'OK ✓' : '⚠️ NO CUADRA'}\n`)
  if (!cuadra) { console.error('❌ Abortado: la cuadratura falla, un lead se estaría perdiendo.'); process.exit(1) }

  if (!COMMIT) {
    console.log('   DRY-RUN: no se escribió nada. Muestra de 3:')
    console.log(JSON.stringify(insertar.slice(0, 3), null, 2))
    console.log('\n   Corré con --commit para escribir de verdad.\n')
    return
  }

  let ok = 0
  const lote = 200
  for (let i = 0; i < insertar.length; i += lote) {
    const trozo = insertar.slice(i, i + lote)
    const { error } = await nuevo.from('fact_leads').insert(trozo)
    if (error) throw new Error(`Insert lote ${i}: ${error.message}`)
    ok += trozo.length
    console.log(`   Insertados ${ok}/${insertar.length}`)
  }
  console.log(`\n✅ Migración completa: ${ok} leads nuevos en el CRM.\n`)
}

main().catch((e) => { console.error('❌', e.message); process.exit(1) })
