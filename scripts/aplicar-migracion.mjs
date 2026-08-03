/**
 * Aplica una migración al Postgres de Tryvex.
 * Uso: node --env-file=.env.local scripts/aplicar-migracion.mjs 018_jornadas.sql
 *
 * Requiere SUPABASE_DB_URL (Dashboard → Settings → Database → Connection string).
 * Sin esa variable, imprime el SQL para pegarlo en el SQL Editor.
 */
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const archivo = process.argv[2]

if (!archivo) {
  console.error('Falta el nombre del archivo. Ej: 018_jornadas.sql')
  process.exit(1)
}

const sql = readFileSync(join(__dir, '../supabase/migrations/', archivo), 'utf-8')
const dbUrl = process.env.SUPABASE_DB_URL

if (!dbUrl) {
  console.log('SUPABASE_DB_URL no está definida. Pega este SQL en el SQL Editor de Supabase:\n')
  console.log(sql)
  process.exit(0)
}

const { default: postgres } = await import('postgres')
const sqlClient = postgres(dbUrl, { max: 1 })

try {
  await sqlClient.unsafe(sql)
  console.log(`Migración ${archivo} aplicada.`)
} catch (err) {
  console.error(`Falló ${archivo}:`, err instanceof Error ? err.message : err)
  process.exitCode = 1
} finally {
  await sqlClient.end()
}
