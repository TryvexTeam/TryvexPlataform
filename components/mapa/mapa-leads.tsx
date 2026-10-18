'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp, ExternalLink, Globe, MapPin, Navigation, Plus, Star, X } from 'lucide-react'
import type { Map as MapaMapLibre, GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { ESTADOS_LEAD, type EstadoLead } from '@/lib/types/lead'
import { MAX_PARADAS, linkGoogleMaps, linkRuta, type DatosMapa, type LeadEnMapa } from '@/lib/types/mapa'
import { cn } from '@/lib/utils'

/**
 * El mapa 3D de los leads (idea de Ignacio): cada local es un punto con el color
 * de su estado, sobre la ciudad con edificios en 3D. Clic en un punto → su ficha,
 * su link a Google Maps y «agregar a la ruta» para armar un recorrido de visitas.
 *
 * Mapa base de OpenFreeMap (gratis, sin llave). La ruta se abre en Google Maps con
 * un link normal: tampoco usa API pagada. El panel se arma con React, nunca con
 * HTML armado a mano: el nombre de un lead viene de Google y no se inyecta.
 */

// Estilo oscuro, a juego con el CRM. No trae edificios en 3D: se agregan al cargar.
const ESTILO = 'https://tiles.openfreemap.org/styles/dark'
const SANTIAGO: [number, number] = [-70.6506, -33.4372]

function geojson(leads: LeadEnMapa[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: leads.map((l) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [l.lng, l.lat] },
      properties: { id: l.id, estado: l.estado },
    })),
  }
}

const COLOR_POR_ESTADO = [
  'match',
  ['get', 'estado'],
  ...ESTADOS_LEAD.flatMap((e) => [e.id, e.color]),
  '#94a3b8',
] as unknown as string

export function MapaLeads({ datos }: { datos: DatosMapa }) {
  const contenedor = useRef<HTMLDivElement>(null)
  const mapa = useRef<MapaMapLibre | null>(null)
  // Solo para el encuadre inicial: el mapa se crea una vez y no se rehace si cambian.
  const leadsIniciales = useRef(datos.leads)
  const [listo, setListo] = useState(false)
  const [errorMapa, setErrorMapa] = useState(false)
  const [estados, setEstados] = useState<Set<EstadoLead>>(
    () => new Set(ESTADOS_LEAD.map((e) => e.id).filter((e) => e !== 'descartado')),
  )
  const [nicho, setNicho] = useState('')
  const [elegidoId, setElegidoId] = useState<string | null>(null)
  const [ruta, setRuta] = useState<string[]>([])

  const porId = useMemo(() => new Map(datos.leads.map((l) => [l.id, l])), [datos.leads])
  const nichos = useMemo(
    () => [...new Set(datos.leads.map((l) => l.nicho).filter((n): n is string => Boolean(n)))].sort((a, b) => a.localeCompare(b, 'es')),
    [datos.leads],
  )
  const visibles = useMemo(
    () => datos.leads.filter((l) => estados.has(l.estado) && (!nicho || l.nicho === nicho)),
    [datos.leads, estados, nicho],
  )
  const elegido = elegidoId ? porId.get(elegidoId) ?? null : null
  const paradas = ruta.map((id) => porId.get(id)).filter((l): l is LeadEnMapa => Boolean(l))

  // Crear el mapa una vez. maplibre se importa acá adentro: necesita `window`.
  useEffect(() => {
    let cancelado = false
    let instancia: MapaMapLibre | null = null
    void (async () => {
      try {
        const { Map: MapLibre, NavigationControl, setWorkerUrl } = await import('maplibre-gl')
        if (cancelado || !contenedor.current) return
        // El worker se sirve desde public/maplibre (scripts/copiar-worker-mapa.mjs).
        setWorkerUrl('/maplibre/maplibre-gl-worker.mjs')
        instancia = new MapLibre({
          container: contenedor.current,
          style: ESTILO,
          center: SANTIAGO,
          zoom: 14,
          pitch: 55,
          bearing: -15,
          attributionControl: { compact: true },
        })
        instancia.addControl(new NavigationControl({ visualizePitch: true }), 'top-right')
        instancia.on('error', () => setErrorMapa(true))
        instancia.on('load', () => {
          if (!instancia) return
          const m = instancia
          // El estilo trae su propia cámara (plana) y pisa la del constructor. Se
          // encuadra en los leads y lo bastante cerca (≥14) para que se vean los
          // edificios en 3D de entrada; más lejos el mapa se ve plano.
          const iniciales = leadsIniciales.current
          if (iniciales.length > 0) {
            const lngs = iniciales.map((l) => l.lng)
            const lats = iniciales.map((l) => l.lat)
            m.fitBounds(
              [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
              { padding: 90, maxZoom: 15, pitch: 50, bearing: -15, duration: 0 },
            )
            if (m.getZoom() < 14) m.jumpTo({ zoom: 14, pitch: 55, bearing: -15 })
          } else {
            m.jumpTo({ zoom: 14, pitch: 55, bearing: -15 })
          }
          // Edificios en 3D si el estilo base no los trae ya extruidos.
          const tieneExtrusion = m.getStyle().layers?.some((c) => c.type === 'fill-extrusion')
          if (!tieneExtrusion && m.getSource('openmaptiles')) {
            m.addLayer({
              id: 'edificios-3d',
              type: 'fill-extrusion',
              source: 'openmaptiles',
              'source-layer': 'building',
              minzoom: 13.5,
              paint: {
                'fill-extrusion-color': '#3a3a46',
                'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
                'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
                'fill-extrusion-opacity': 0.75,
              },
            })
          }
          m.addSource('leads', { type: 'geojson', data: geojson([]) })
          m.addLayer({
            id: 'leads-halo',
            type: 'circle',
            source: 'leads',
            paint: { 'circle-radius': 11, 'circle-color': COLOR_POR_ESTADO, 'circle-opacity': 0.25, 'circle-blur': 0.6 },
          })
          m.addLayer({
            id: 'leads',
            type: 'circle',
            source: 'leads',
            paint: {
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 4, 15, 8],
              'circle-color': COLOR_POR_ESTADO,
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 1.5,
            },
          })
          m.on('click', 'leads', (e: MapLayerMouseEvent) => {
            const id = e.features?.[0]?.properties?.id as string | undefined
            if (id) setElegidoId(id)
          })
          m.on('mouseenter', 'leads', () => (m.getCanvas().style.cursor = 'pointer'))
          m.on('mouseleave', 'leads', () => (m.getCanvas().style.cursor = ''))
          mapa.current = m
          setListo(true)
        })
      } catch {
        setErrorMapa(true)
      }
    })()
    return () => {
      cancelado = true
      instancia?.remove()
      mapa.current = null
    }
  }, [])

  // Los filtros cambian los puntos sin recrear el mapa.
  useEffect(() => {
    if (!listo || !mapa.current) return
    ;(mapa.current.getSource('leads') as GeoJSONSource | undefined)?.setData(geojson(visibles))
  }, [listo, visibles])

  function enfocar(l: LeadEnMapa) {
    setElegidoId(l.id)
    mapa.current?.flyTo({ center: [l.lng, l.lat], zoom: 16, pitch: 60, duration: 1200 })
  }

  function alternarEstado(e: EstadoLead) {
    setEstados((prev) => {
      const s = new Set(prev)
      if (s.has(e)) s.delete(e)
      else s.add(e)
      return s
    })
  }

  function mover(i: number, delta: number) {
    setRuta((r) => {
      const j = i + delta
      if (j < 0 || j >= r.length) return r
      const copia = [...r]
      ;[copia[i], copia[j]] = [copia[j], copia[i]]
      return copia
    })
  }

  const urlRuta = linkRuta(paradas)

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--tx-ink-primary)]">Mapa de leads</h1>
          <p className="text-sm text-[var(--tx-ink-muted)]">
            {visibles.length.toLocaleString('es-CL')} en el mapa
            {datos.sinUbicacion > 0 && ` · ${datos.sinUbicacion.toLocaleString('es-CL')} todavía sin ubicación`}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-[var(--tx-ink-secondary)]">
          Rubro
          <select
            value={nicho}
            onChange={(e) => setNicho(e.target.value)}
            className="rounded-lg bg-[var(--tx-surface-2)] px-2.5 py-1.5 text-sm text-[var(--tx-ink-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--tx-accent)]"
          >
            <option value="">Todos</option>
            {nichos.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
      </header>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por estado">
        {ESTADOS_LEAD.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => alternarEstado(e.id)}
            aria-pressed={estados.has(e.id)}
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-opacity',
              estados.has(e.id) ? 'border-[var(--tx-border-strong)] text-[var(--tx-ink-primary)]' : 'border-[var(--tx-border)] text-[var(--tx-ink-muted)] opacity-50',
            )}
          >
            <span className="size-2 rounded-full" style={{ background: e.color }} aria-hidden="true" />
            {e.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="relative h-[65vh] min-h-[380px] overflow-hidden rounded-xl border border-[var(--tx-border)] bg-[var(--tx-surface-2)]">
          {/* h-full/w-full y no `absolute inset-0`: MapLibre le pone `position: relative`
              a su contenedor y el inset deja de valer (el mapa quedaba de alto 0). */}
          <div ref={contenedor} className="h-full w-full" aria-label="Mapa de leads" role="application" />
          {errorMapa && (
            <p className="absolute inset-x-4 top-4 rounded-lg bg-[var(--tx-bg-primary)]/90 p-3 text-sm text-[var(--tx-warning)]">
              No se pudo cargar el mapa base. Revisa la conexión; los leads siguen en la lista de la derecha.
            </p>
          )}
          {datos.leads.length === 0 && (
            <p className="absolute inset-x-4 bottom-4 rounded-lg bg-[var(--tx-bg-primary)]/90 p-3 text-sm text-[var(--tx-ink-secondary)]">
              Ningún lead tiene ubicación todavía. Los nuevos la traen del scraper; los viejos se rellenan con
              <code className="mx-1">scraper/rellenar_coordenadas.py</code>.
            </p>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          {elegido ? (
            <section className="flex flex-col gap-2 rounded-xl border border-[var(--tx-border)] p-4" aria-label="Local elegido">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold text-[var(--tx-ink-primary)]">{elegido.nombre}</h2>
                <button type="button" onClick={() => setElegidoId(null)} aria-label="Cerrar" className="text-[var(--tx-ink-muted)] hover:text-[var(--tx-ink-primary)]">
                  <X size={16} />
                </button>
              </div>
              <p className="flex items-center gap-1.5 text-xs text-[var(--tx-ink-secondary)]">
                <span className="size-2 rounded-full" style={{ background: ESTADOS_LEAD.find((e) => e.id === elegido.estado)?.color }} aria-hidden="true" />
                {ESTADOS_LEAD.find((e) => e.id === elegido.estado)?.label}
                {elegido.nicho && ` · ${elegido.nicho}`}
              </p>
              {elegido.localidad && (
                <p className="flex items-center gap-1.5 text-xs text-[var(--tx-ink-muted)]"><MapPin size={12} /> {elegido.localidad}</p>
              )}
              {elegido.rating !== null && (
                <p className="flex items-center gap-1.5 text-xs text-[var(--tx-ink-secondary)]">
                  <Star size={12} className="text-yellow-500" /> {elegido.rating.toLocaleString('es-CL')}
                  {elegido.resenas !== null && ` (${elegido.resenas.toLocaleString('es-CL')} reseñas)`}
                </p>
              )}
              <p className="flex items-center gap-1.5 text-xs text-[var(--tx-ink-secondary)]">
                <Globe size={12} />
                {elegido.tieneWeb === true ? (
                  elegido.urlWeb ? (
                    <a href={elegido.urlWeb} target="_blank" rel="noopener noreferrer" className="underline">Tiene web</a>
                  ) : 'Tiene web'
                ) : elegido.tieneWeb === false ? 'No tiene web' : 'No sabemos si tiene web'}
              </p>
              <div className="mt-1 flex flex-wrap gap-2">
                <Link href={`/leads/${elegido.id}`} className="rounded-lg bg-[var(--tx-accent)] px-3 py-1.5 text-xs font-medium text-[var(--tx-accent-fg)]">
                  Ver lead
                </Link>
                <a href={linkGoogleMaps(elegido)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 rounded-lg border border-[var(--tx-border)] px-3 py-1.5 text-xs text-[var(--tx-ink-primary)]">
                  <ExternalLink size={12} /> Google Maps
                </a>
                <button
                  type="button"
                  disabled={ruta.includes(elegido.id) || ruta.length >= MAX_PARADAS}
                  onClick={() => setRuta((r) => [...r, elegido.id])}
                  className="flex items-center gap-1 rounded-lg border border-[var(--tx-border)] px-3 py-1.5 text-xs text-[var(--tx-ink-primary)] disabled:opacity-40"
                >
                  <Plus size={12} /> {ruta.includes(elegido.id) ? 'En la ruta' : 'A la ruta'}
                </button>
              </div>
            </section>
          ) : (
            <p className="rounded-xl border border-dashed border-[var(--tx-border)] p-4 text-sm text-[var(--tx-ink-muted)]">
              Toca un punto del mapa para ver el local. Arrastra con el botón derecho (o dos dedos) para girar y ver los edificios en 3D.
            </p>
          )}

          <section className="flex flex-col gap-2 rounded-xl border border-[var(--tx-border)] p-4" aria-label="Ruta de visitas">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--tx-ink-secondary)]">
              <Navigation size={14} /> Ruta de visitas
              <span className="font-normal text-[var(--tx-ink-muted)]">{paradas.length}/{MAX_PARADAS}</span>
            </h2>
            {paradas.length === 0 ? (
              <p className="text-xs text-[var(--tx-ink-muted)]">Agrega locales con «A la ruta» y ábrela en Google Maps para ir a visitarlos.</p>
            ) : (
              <ol className="flex flex-col gap-1">
                {paradas.map((p, i) => (
                  <li key={p.id} className="flex items-center gap-1.5 text-sm">
                    <span className="w-4 text-xs tabular-nums text-[var(--tx-ink-muted)]">{i + 1}</span>
                    <button type="button" onClick={() => enfocar(p)} className="min-w-0 flex-1 truncate text-left text-[var(--tx-ink-primary)] hover:underline">
                      {p.nombre}
                    </button>
                    <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} aria-label={`Subir ${p.nombre}`} className="p-0.5 text-[var(--tx-ink-muted)] disabled:opacity-30"><ArrowUp size={12} /></button>
                    <button type="button" onClick={() => mover(i, 1)} disabled={i === paradas.length - 1} aria-label={`Bajar ${p.nombre}`} className="p-0.5 text-[var(--tx-ink-muted)] disabled:opacity-30"><ArrowDown size={12} /></button>
                    <button type="button" onClick={() => setRuta((r) => r.filter((x) => x !== p.id))} aria-label={`Quitar ${p.nombre}`} className="p-0.5 text-[var(--tx-ink-muted)] hover:text-red-500"><X size={12} /></button>
                  </li>
                ))}
              </ol>
            )}
            {urlRuta && (
              <a href={urlRuta} target="_blank" rel="noopener noreferrer" className="mt-1 flex items-center justify-center gap-1.5 rounded-lg bg-[var(--tx-accent)] px-3 py-2 text-sm font-medium text-[var(--tx-accent-fg)]">
                <Navigation size={14} /> Abrir ruta en Google Maps
              </a>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}
