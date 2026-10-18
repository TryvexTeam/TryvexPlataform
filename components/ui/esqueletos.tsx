/**
 * Piezas de esqueleto compartidas por los `loading.tsx` de cada sección.
 *
 * La regla que las gobierna: un esqueleto tiene que tener la FORMA de lo que
 * viene. Uno genérico —tres tarjetas y un bloque— puesto delante de un kanban
 * es peor que no poner nada: promete un layout, y cuando llegan los datos todo
 * salta de sitio. El esqueleto sirve para que el ojo ya sepa dónde mirar.
 *
 * Nada de muescas aquí: la muesca del panel promete un destino, y mientras
 * carga todavía no hay ninguno al que ir.
 *
 * Todo es `aria-hidden`: quien usa lector de pantalla no gana nada oyendo la
 * descripción de unos rectángulos. El aviso de "cargando" lo pone el
 * contenedor de cada ruta, una sola vez.
 */

/** Superficie base de cualquier bloque en carga. */
const BLOQUE = 'animate-pulse rounded-2xl bg-white/[0.045]'

/** Línea de texto fantasma. */
export function LineaEsq({ w = '100%', h = 12 }: { w?: string | number; h?: number }) {
  return (
    <div
      aria-hidden="true"
      className="animate-pulse rounded-md bg-white/[0.055]"
      style={{ width: w, height: h }}
    />
  )
}

/**
 * Cabecera de sección: título grande y su bajada.
 *
 * Las medidas no son redondas a propósito — un esqueleto con todas las líneas
 * del mismo ancho se lee como una plantilla vacía, no como texto que viene.
 */
export function CabeceraEsq({ conAcciones = false }: { conAcciones?: boolean }) {
  return (
    <div aria-hidden="true" className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex flex-col gap-3">
        <LineaEsq w={172} h={26} />
        <LineaEsq w={268} h={13} />
      </div>
      {conAcciones && (
        <div className="flex gap-2">
          <div className={`${BLOQUE} h-10 w-10 !rounded-full`} />
          <div className={`${BLOQUE} h-10 w-28 !rounded-full`} />
        </div>
      )}
    </div>
  )
}

/** Fila de chips de filtro. */
export function ChipsEsq({ n = 4 }: { n?: number }) {
  // Anchos alternados: cuatro píldoras idénticas parecen un componente roto,
  // no unos filtros cargando.
  const anchos = [76, 104, 88, 120, 92, 110]
  return (
    <div aria-hidden="true" className="flex flex-wrap gap-2">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className={`${BLOQUE} h-9 !rounded-full`} style={{ width: anchos[i % anchos.length] }} />
      ))}
    </div>
  )
}

/**
 * Tablero kanban: columnas con tarjetas de altura despareja.
 *
 * La altura variable importa. Un kanban real nunca tiene todas las tarjetas
 * iguales, y clonar la misma altura delata el esqueleto de inmediato.
 */
export function KanbanEsq({ columnas = 4 }: { columnas?: number }) {
  const alturas = [
    [92, 128, 76],
    [116, 84],
    [72, 104, 96, 68],
    [88, 112],
    [96, 76, 120],
  ]

  return (
    <div aria-hidden="true" className="flex gap-4 overflow-hidden">
      {Array.from({ length: columnas }, (_, c) => (
        <div key={c} className="flex min-w-[260px] flex-1 flex-col gap-3">
          <div className="flex items-center gap-2">
            <LineaEsq w={92} h={13} />
            <div className={`${BLOQUE} h-5 w-7 !rounded-full`} />
          </div>
          <div className="flex flex-col gap-2.5 rounded-xl p-2">
            {(alturas[c % alturas.length] ?? [96, 80]).map((alto, i) => (
              <div
                key={i}
                className={`${BLOQUE} !rounded-xl border border-white/[0.05]`}
                style={{ height: alto, animationDelay: `${(c * 3 + i) * 70}ms` }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Lista de filas — clientes, integrantes, resultados. */
export function ListaEsq({ filas = 6 }: { filas?: number }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-2">
      {Array.from({ length: filas }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-3.5 rounded-[20px] border border-white/[0.05] px-4 py-3.5"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <div className={`${BLOQUE} h-9 w-9 !rounded-full`} style={{ animationDelay: `${i * 60}ms` }} />
          <div className="flex flex-1 flex-col gap-2">
            <LineaEsq w={`${52 + ((i * 13) % 26)}%`} h={13} />
            <LineaEsq w={`${28 + ((i * 9) % 18)}%`} h={11} />
          </div>
          <div className={`${BLOQUE} h-6 w-16 !rounded-full`} style={{ animationDelay: `${i * 60}ms` }} />
        </div>
      ))}
    </div>
  )
}

/** Rejilla de tarjetas — el patrón del panel y de finanzas. */
export function TarjetasEsq({
  n = 4,
  alto = 150,
  clases = 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4',
}: {
  n?: number
  alto?: number
  clases?: string
}) {
  return (
    <div aria-hidden="true" className={`grid gap-5 ${clases}`}>
      {Array.from({ length: n }, (_, i) => (
        <div
          key={i}
          className={`${BLOQUE} !rounded-[28px] border border-white/[0.05]`}
          style={{ height: alto, animationDelay: `${i * 70}ms` }}
        />
      ))}
    </div>
  )
}

/** Cifras de cabecera: números grandes separados por hairlines. */
export function CifrasEsq({ n = 3 }: { n?: number }) {
  return (
    <div aria-hidden="true" className="flex items-end">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex items-end">
          {i > 0 && <div className="mb-1 h-10 w-px bg-white/[0.07]" />}
          <div className={`flex flex-col gap-3 ${i === 0 ? 'pr-11' : 'px-11'}`}>
            <LineaEsq w={62} h={38} />
            <LineaEsq w={96} h={11} />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Rejilla del calendario semanal: franja de días y columnas horarias. */
export function CalendarioEsq() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3">
      <div className="flex gap-2">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-2 py-2">
            <LineaEsq w={30} h={10} />
            <LineaEsq w={22} h={18} />
          </div>
        ))}
      </div>

      <div className="flex gap-2 overflow-hidden rounded-2xl border border-white/[0.05] p-2">
        {Array.from({ length: 7 }, (_, dia) => (
          <div key={dia} className="relative flex-1" style={{ height: 340 }}>
            {/* Bloques a distinta hora y altura: una semana real no tiene los
                eventos alineados, y alinearlos delata el esqueleto. */}
            {[
              [40, 64],
              [120, 48],
              [230, 80],
            ]
              .filter((_, i) => (dia + i) % 3 !== 0)
              .map(([arriba, alto], i) => (
                <div
                  key={i}
                  className={`${BLOQUE} absolute inset-x-1 !rounded-lg`}
                  style={{ top: arriba, height: alto, animationDelay: `${(dia * 2 + i) * 60}ms` }}
                />
              ))}
          </div>
        ))}
      </div>
    </div>
  )
}
