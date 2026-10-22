// Copia el worker de MapLibre (y el módulo que importa) a public/maplibre/, para
// que el mapa de leads lo cargue desde el mismo origen. MapLibre 6 busca su worker
// junto a su propio archivo, y con el bundler de Next ese archivo no queda en
// /_next/static: sin esto el mapa no dibuja nada ("Worker failed to load").
// Corre solo antes de `dev` y de `build`, así siempre calza con la versión instalada.
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const origen = join(dirname(createRequire(import.meta.url).resolve('maplibre-gl/package.json')), 'dist')
const destino = join(raiz, 'public', 'maplibre')
mkdirSync(destino, { recursive: true })
for (const archivo of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  copyFileSync(join(origen, archivo), join(destino, archivo))
}
console.log('worker del mapa copiado a public/maplibre/')
