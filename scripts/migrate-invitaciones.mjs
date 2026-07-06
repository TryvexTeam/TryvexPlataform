/**
 * Ejecuta la migración de la tabla invitaciones en Supabase.
 * Uso: node scripts/migrate-invitaciones.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('❌ Faltan env vars. Ejecuta con:')
  console.error('  $env:NEXT_PUBLIC_SUPABASE_URL="..."; $env:SUPABASE_SERVICE_ROLE_KEY="..."; node scripts/migrate-invitaciones.mjs')
  process.exit(1)
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const sql = readFileSync(join(__dir, '../supabase/migrations/001_invitaciones.sql'), 'utf-8')

// Ejecutar cada statement por separado
const statements = sql
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean)

console.log(`📦 Ejecutando ${statements.length} statements...`)

for (const stmt of statements) {
  const { error } = await supabase.rpc('exec_sql', { sql: stmt }).catch(() => ({ error: null }))
  // rpc exec_sql no existe en proyectos normales — usar REST management API
  if (error) {
    // Silenciar — la tabla puede ya existir (IF NOT EXISTS)
  }
}

// Alternativa: usar el endpoint de query directo via fetch
const response = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
  method: 'POST',
  headers: {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: sql }),
})

if (!response.ok) {
  console.log('ℹ️  El endpoint rpc/exec_sql no está disponible.')
  console.log('📋 Copia y pega el siguiente SQL en el SQL Editor del dashboard de Supabase:')
  console.log('\n' + '─'.repeat(60))
  console.log(sql)
  console.log('─'.repeat(60))
  console.log('\n🔗 Dashboard: https://supabase.com/dashboard/project/kmqozwcwttafvwhqlhkq/sql/new')
} else {
  console.log('✅ Migración ejecutada correctamente')
}
