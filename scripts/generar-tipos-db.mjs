/**
 * Regenera `lib/types/database.ts` desde el esquema real de la base.
 *
 * La fuente es el spec OpenAPI que publica PostgREST — la misma que ve la
 * aplicación en tiempo de ejecución, así que no puede quedar desfasada de lo
 * que la app consulta de verdad. No hace falta el CLI de Supabase ni un token
 * de acceso: alcanza con las variables que ya están en `.env.local`.
 *
 *   node scripts/generar-tipos-db.mjs
 *
 * Correrlo DESPUÉS de aplicar una migración que cambie columnas. Si no, los
 * tipos dicen una cosa y la base otra, que es exactamente el estado que dejaba
 * pasar consultas a columnas inexistentes.
 */
import fs from 'node:fs'
import path from 'node:path'

const RAIZ = path.resolve(import.meta.dirname, '..')
const SALIDA = path.join(RAIZ, 'lib/types/database.ts')

/** Vistas: van en `Views` y no en `Tables`, como espera el cliente de Supabase. */
const VISTAS = new Set([
  'v_equipo_publico',
  'presencia_equipo',
  'cerebro_timeline',
  'finanzas_resumen_mensual',
  'jornadas_resumen',
  'llamadas_resumen_mes',
  'agentes_publicos',
])

function leerEnv() {
  const ruta = path.join(RAIZ, '.env.local')
  if (!fs.existsSync(ruta)) {
    throw new Error('Falta .env.local: sin él no hay a qué proyecto preguntarle.')
  }
  const env = {}
  for (const linea of fs.readFileSync(ruta, 'utf8').split('\n')) {
    const i = linea.indexOf('=')
    if (i < 0 || linea.trim().startsWith('#')) continue
    env[linea.slice(0, i).trim()] = linea.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  return env
}

/**
 * Las claves foráneas que declara el spec, en el formato que pide
 * `GenericRelationship` de postgrest-js.
 *
 * PostgREST las publica dentro de la descripción de cada columna, así:
 *   <fk table='dim_integrantes' column='id'/>
 *
 * No es cosmético: sin el campo `Relationships`, el tipo no satisface el
 * constraint `GenericTable` de la librería, el esquema entero degrada a `never`
 * y cada consulta falla con "not assignable to parameter of type 'never'".
 * Además, tenerlas bien es lo que permite tipar los embeds del estilo
 * `select('*, eventos_asistentes(integrante_id)')`.
 */
function relaciones(nombre, def) {
  const salida = []
  for (const [columna, prop] of Object.entries(def.properties ?? {})) {
    const m = /<fk table='([^']+)' column='([^']+)'\/>/.exec(prop.description ?? '')
    if (!m) continue
    salida.push(
      `          {
` +
        `            foreignKeyName: '${nombre}_${columna}_fkey'
` +
        `            columns: ['${columna}']
` +
        `            isOneToOne: false
` +
        `            referencedRelation: '${m[1]}'
` +
        `            referencedColumns: ['${m[2]}']
` +
        `          }`
    )
  }
  return salida
}

/** El tipo TypeScript de una propiedad del spec. */
function tipoTS(prop) {
  const { type, format } = prop
  if (format === 'jsonb' || format === 'json') return 'Json'
  if (type === 'array') return `${tipoTS(prop.items ?? {})}[]`
  if (type === 'integer' || type === 'number') return 'number'
  if (type === 'boolean') return 'boolean'
  return 'string'
}

/**
 * Un bloque Row/Insert/Update.
 *
 * `required` del spec son las columnas NOT NULL; una columna con `default` es
 * opcional al insertar aunque sea NOT NULL.
 */
function bloque(nombre, def, sangria = '      ') {
  const requeridas = new Set(def.required ?? [])
  const columnas = Object.entries(def.properties ?? {})
  const lineas = [`${sangria}${nombre}: {`]

  for (const seccion of ['Row', 'Insert', 'Update']) {
    lineas.push(`${sangria}  ${seccion}: {`)
    for (const [columna, prop] of columnas) {
      const nulable = !requeridas.has(columna)
      /*
       * PostgREST no publica el `default` cuando no lo puede representar en
       * JSON, y eso pasa justo con los que llevan cast: `'{}'::jsonb`,
       * `'[]'::jsonb`, `'{}'::text[]`. Sin esta excepción, columnas como
       * `jornadas.pausas` o `dim_proyectos.servicios_ids` —que SÍ tienen
       * default en la base, verificado en las migraciones— salían como
       * obligatorias al insertar y TypeScript exigía mandarlas a mano.
       */
      const defaultInvisible = prop.type === 'array' || prop.format === 'jsonb' || prop.format === 'json'
      const opcional =
        seccion === 'Row'
          ? ''
          : seccion === 'Update'
            ? '?'
            : nulable || 'default' in prop || defaultInvisible
              ? '?'
              : ''
      lineas.push(`${sangria}    ${columna}${opcional}: ${tipoTS(prop)}${nulable ? ' | null' : ''}`)
    }
    lineas.push(`${sangria}  }`)
  }

  const rels = relaciones(nombre, def)
  lineas.push(
    rels.length === 0
      ? `${sangria}  Relationships: []`
      : `${sangria}  Relationships: [\n${rels.join(',\n')}\n${sangria}  ]`
  )

  lineas.push(`${sangria}}`)
  return lineas.join('\n')
}

/**
 * Las funciones llamables por RPC, con sus argumentos.
 *
 * PostgREST las publica como rutas `/rpc/<nombre>`. Sin esto, `Functions` solo
 * declaraba `is_integrante` y cualquier otra llamada fallaba con «not
 * assignable to parameter of type "is_integrante"» — que es TypeScript
 * avisando, correctamente, de que estaba llamando algo que el esquema no
 * declaraba.
 *
 * El tipo de retorno no viene en el spec, así que se deja en `unknown`: obliga
 * a que quien llama afirme la forma, en vez de fingir que la sabemos.
 */
function funciones(spec) {
  const salida = []
  for (const [ruta, def] of Object.entries(spec.paths ?? {})) {
    if (!ruta.startsWith('/rpc/')) continue
    const nombre = ruta.slice('/rpc/'.length)
    const cuerpo = (def.post?.parameters ?? []).find((p) => p.in === 'body')
    const props = Object.entries(cuerpo?.schema?.properties ?? {})
    const requeridos = new Set(cuerpo?.schema?.required ?? [])

    const args =
      props.length === 0
        ? '        Args: Record<string, never>'
        : `        Args: {\n${props
            .map(
              ([n, p]) =>
                // `| null` en todos: en los argumentos de una función,
                // `required` del spec significa «no tiene valor por defecto»,
                // no «no acepta NULL». Un parámetro sin default igual puede
                // recibir NULL, y marcarlo como no-nulable hace que TypeScript
                // rechace llamadas que la base acepta sin problema.
                `          ${n}${requeridos.has(n) ? '' : '?'}: ${tipoTS(p)} | null`
            )
            .join('\n')}\n        }`

    salida.push(`      ${nombre}: {\n${args}\n        Returns: unknown\n      }`)
  }
  return salida
}

const env = leerEnv()
const url = env.NEXT_PUBLIC_SUPABASE_URL
const clave = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !clave) {
  throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
}

const res = await fetch(`${url}/rest/v1/`, {
  headers: { apikey: clave, Authorization: `Bearer ${clave}` },
})
if (!res.ok) throw new Error(`PostgREST respondió ${res.status} al pedir el esquema`)

const spec = await res.json()
const { definitions = {} } = spec
const nombres = Object.keys(definitions)
if (nombres.length === 0) throw new Error('El esquema vino vacío; no se sobrescribe nada.')

const tablas = nombres.filter((n) => !VISTAS.has(n)).sort()
const vistas = nombres.filter((n) => VISTAS.has(n)).sort()

const contenido = `/**
 * Tipos de la base, generados desde el esquema real.
 *
 * NO editar a mano: se regenera con \`node scripts/generar-tipos-db.mjs\`.
 *
 * La versión anterior de este archivo cubría 12 de las 48 relaciones, y los
 * repositorios la esquivaban con \`type SB = any\`, así que TypeScript no
 * validaba ninguna consulta: pedir una columna inexistente compilaba. No es
 * hipotético — \`convertirEnCliente\` pedía \`nombre_contacto\` y \`email\` a
 * \`fact_leads\` sin que existieran, y salió en producción como 42703 al marcar
 * un lead como ganado.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
${tablas.map((t) => bloque(t, definitions[t])).join('\n')}
    }
    Views: {
${vistas.map((v) => bloque(v, definitions[v])).join('\n')}
    }
    Functions: {
${funciones(spec).join('\n')}
    }
    Enums: Record<string, never>
  }
}
`

fs.writeFileSync(SALIDA, contenido, 'utf8')
console.log(`lib/types/database.ts regenerado: ${tablas.length} tablas y ${vistas.length} vistas.`)
