'use client'

import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { toast } from '@/lib/toast'
import type { Celda, DisponibilidadIntegrante } from '@/lib/types/disponibilidad'
import { AvatarIntegrante } from '@/components/shared/avatar-integrante'
import { DIAS_SEMANA } from '@/lib/types/disponibilidad'
import { hashColorHex, MEMBER_PALETTE } from '@/lib/utils/lead-utils'

/**
 * Lado del avatar dentro de una celda de la rejilla.
 *
 * 18 px es el punto de equilibrio: por debajo la foto deja de distinguirse de
 * una mancha, y por encima dejan de entrar en una columna de 80 px.
 */
const AVATAR_CELDA = 18

/**
 * Cuánto se monta cada avatar sobre el anterior: la mitad justa.
 *
 * Es lo que hace que quepan. En fila suelta, cinco personas ocupan 103 px y la
 * columna mide 80; solapados a la mitad ocupan 54 y sobra sitio. El montaje
 * además se lee como grupo — cinco discos separados parecen cinco cosas, y
 * apilados parecen un equipo.
 */
const SOLAPE = Math.round(AVATAR_CELDA / 2)

/**
 * Cuántas caras se muestran antes de resumir el resto en un "+N".
 *
 * Con el solape entran seis en el ancho mínimo de columna, así que el corte
 * casi nunca se alcanza: existe para que un equipo grande no rompa la celda,
 * no como comportamiento de todos los días.
 */
const MAX_EN_CELDA = 6

const HORA_MIN = 10
// 26 = 2:00 del día siguiente; filas 24-25 representan 0:00-1:00 de la madrugada
const HORA_MAX = 26
const HORAS = Array.from({ length: HORA_MAX - HORA_MIN }, (_, i) => i + HORA_MIN)

/** Normaliza a celda real: filas 24-25 (madrugada) se guardan como hora 0-1 del día siguiente */
function celdaKey(dia: number, hora: number): string {
  return hora >= 24 ? `${(dia + 1) % 7}-${hora - 24}` : `${dia}-${hora}`
}

function buildSet(celdas: Celda[]): Set<string> {
  return new Set(celdas.map((c) => celdaKey(c.dia_semana, c.hora)))
}

export function DisponibilidadGrid() {
  const [data, setData] = useState<DisponibilidadIntegrante[] | null>(null)
  const [myCells, setMyCells] = useState<Set<string>>(new Set())
  const [savedCells, setSavedCells] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Drag state — refs to avoid re-renders mid-drag
  const isDragging = useRef(false)
  const dragMode = useRef<'add' | 'remove'>('add')

  // ---------- Fetch ----------
  useEffect(() => {
    let cancelled = false
    fetch('/api/disponibilidad')
      .then((r) => r.json())
      .then((json: { success: boolean; data: DisponibilidadIntegrante[] }) => {
        if (cancelled) return
        if (!json.success) {
          setError('Error al cargar disponibilidad')
          return
        }
        setData(json.data)
        const own = json.data.find((i) => i.es_propio)
        if (own) {
          const s = buildSet(own.celdas)
          setMyCells(s)
          setSavedCells(new Set(s))
        }
      })
      .catch(() => {
        if (!cancelled) setError('Error de conexión')
      })
    return () => {
      cancelled = true
    }
  }, [])

  // ---------- Global mouseup ----------
  useEffect(() => {
    const up = () => {
      isDragging.current = false
    }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  // ---------- Derived ----------
  const hasChanges = (() => {
    if (myCells.size !== savedCells.size) return true
    for (const k of myCells) {
      if (!savedCells.has(k)) return true
    }
    return false
  })()

  const totalMembers = data?.length ?? 0

  const commonSet = (() => {
    if (!data || data.length === 0) return new Set<string>()
    // Build a count map; use myCells for the own member (reflects local edits)
    const counts = new Map<string, number>()
    for (const member of data) {
      const cells = member.es_propio ? myCells : buildSet(member.celdas)
      for (const k of cells) {
        counts.set(k, (counts.get(k) ?? 0) + 1)
      }
    }
    const s = new Set<string>()
    for (const [k, v] of counts) {
      if (v === totalMembers) s.add(k)
    }
    return s
  })()

  const commonCount = commonSet.size

  // ---------- Handlers ----------
  const toggleCell = useCallback(
    (key: string) => {
      setMyCells((prev) => {
        const next = new Set(prev)
        if (dragMode.current === 'add') {
          next.add(key)
        } else {
          next.delete(key)
        }
        return next
      })
    },
    [],
  )

  const handleMouseDown = useCallback(
    (dia: number, hora: number) => {
      const key = celdaKey(dia, hora)
      isDragging.current = true
      dragMode.current = myCells.has(key) ? 'remove' : 'add'
      toggleCell(key)
    },
    [myCells, toggleCell],
  )

  const handleMouseEnter = useCallback(
    (dia: number, hora: number) => {
      if (!isDragging.current) return
      toggleCell(celdaKey(dia, hora))
    },
    [toggleCell],
  )

  const handleSave = async () => {
    setSaving(true)
    const celdas: Celda[] = []
    for (const k of myCells) {
      const [d, h] = k.split('-').map(Number)
      celdas.push({ dia_semana: d, hora: h })
    }
    try {
      const res = await fetch('/api/disponibilidad', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ celdas }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Error al guardar')
      setSavedCells(new Set(myCells))
      toast.success('Disponibilidad guardada')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al guardar'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  // ---------- Loading / Error ----------
  if (error) {
    return (
      <p style={{ color: 'var(--tx-ink-muted)', fontSize: '13px' }}>{error}</p>
    )
  }

  if (!data) {
    return (
      <p style={{ color: 'var(--tx-ink-muted)', fontSize: '13px' }}>
        Cargando disponibilidad...
      </p>
    )
  }

  // ---------- Cell content builder ----------
  const membersByCell = new Map<string, DisponibilidadIntegrante[]>()
  for (const member of data) {
    const cells = member.es_propio ? myCells : buildSet(member.celdas)
    for (const k of cells) {
      const arr = membersByCell.get(k)
      if (arr) arr.push(member)
      else membersByCell.set(k, [member])
    }
  }

  // ---------- Render ----------
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Legend */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        {/* La foto de perfil de cada uno, no un disco con iniciales sobre su
            color: la cara identifica antes que cualquier código de color, y
            las iniciales siguen ahí de respaldo dentro del propio avatar.
            El color del integrante queda para las celdas de la rejilla, que es
            donde de verdad hace falta distinguir de quién es cada banda. */}
        {data.map((m, mi) => {
          const color = m.color ?? MEMBER_PALETTE[mi % MEMBER_PALETTE.length] ?? hashColorHex(m.nombre)
          return (
            <span
              key={m.integrante_id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '12.5px',
                fontWeight: 500,
                color: m.es_propio ? 'var(--tx-ink-primary)' : 'var(--tx-ink-secondary)',
                marginRight: '10px',
              }}
            >
              <AvatarIntegrante
                nombre={m.nombre}
                avatarUrl={m.avatar_url}
                color={color}
                size={26}
                destacado={m.es_propio}
              />
              {m.nombre.split(' ')[0]}
              {m.es_propio && (
                <span style={{ color: 'var(--tx-ink-muted)', fontSize: '11px' }}>tú</span>
              )}
            </span>
          )
        })}

        {/* La clave de "todos disponibles" muestra el mismo relleno que usa la
            rejilla, en vez de describirlo con un símbolo: así se reconoce en
            la cuadrícula sin tener que traducir nada. Antes iba con un dingbat
            (✦) haciendo de icono, que ni escala ni se recolorea. */}
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12.5px',
            fontWeight: 500,
            color: 'var(--tx-ink-secondary)',
          }}
        >
          <span
            style={{
              width: '22px',
              height: '14px',
              borderRadius: '5px',
              background: 'var(--tx-accent-subtle)',
              boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--tx-accent) 45%, transparent)',
              flexShrink: 0,
            }}
          />
          Todos disponibles
        </span>
      </div>

      {/* Common window counter */}
      {/* El número manda: es la respuesta a "¿cuándo podemos juntarnos?", que
          es a lo que se entra a esta pantalla. Antes iba del mismo tamaño que
          la leyenda de al lado y se perdía entre los nombres. */}
      <p
        style={{
          margin: 0,
          display: 'flex',
          alignItems: 'baseline',
          gap: '9px',
        }}
      >
        <span
          style={{
            fontSize: '30px',
            fontWeight: 600,
            letterSpacing: '-0.04em',
            lineHeight: 1,
            color: commonCount > 0 ? 'var(--tx-ink-primary)' : 'var(--tx-ink-muted)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {commonCount}
        </span>
        <span style={{ fontSize: '13px', color: 'var(--tx-ink-secondary)' }}>
          {commonCount === 1 ? 'hora común a la semana' : 'horas comunes a la semana'}
        </span>
      </p>

      {/* Grid wrapper */}
      <div
        style={{
          overflowX: 'auto',
          borderRadius: '16px',
          border: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(255,255,255,0.02)',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '52px repeat(7, minmax(80px, 1fr))',
            userSelect: 'none',
            minWidth: '620px',
          }}
        >
          {/* Header row */}
          <div
            style={{
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              padding: '8px 4px',
            }}
          />
          {DIAS_SEMANA.map((dia, i) => (
            <div
              key={i}
              style={{
                fontSize: '11px',
                fontWeight: 500,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--tx-ink-muted)',
                textAlign: 'center',
                padding: '12px 4px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                borderLeft: '1px solid rgba(255,255,255,0.04)',
              }}
            >
              {dia}
            </div>
          ))}

          {/* Body rows */}
          {HORAS.map((hora) => (
            <Fragment key={`row-${hora}`}>
              {/* Hour label */}
              <div
                style={{
                  fontSize: '10.5px',
                  fontWeight: 500,
                  color: 'var(--tx-ink-muted)',
                  fontVariantNumeric: 'tabular-nums',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  paddingRight: '8px',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  minHeight: '36px',
                }}
              >
                {hora % 24}:00
              </div>

              {/* Day cells */}
              {DIAS_SEMANA.map((_, dia) => {
                const key = celdaKey(dia, hora)
                const isCommon = commonSet.has(key)
                const members = membersByCell.get(key) ?? []
                const isOwn = myCells.has(key)

                return (
                  <div
                    key={key}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      handleMouseDown(dia, hora)
                    }}
                    onMouseEnter={() => handleMouseEnter(dia, hora)}
                    style={{
                      position: 'relative',
                      minHeight: '36px',
                      borderLeft: '1px solid rgba(255,255,255,0.05)',
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                      cursor: 'pointer',
                      transition: 'background 0.1s, box-shadow 0.1s',
                      background: isCommon
                        ? 'var(--tx-accent-subtle)'
                        : isOwn
                          ? 'rgba(255,255,255,0.05)'
                          : 'transparent',
                      boxShadow: isCommon
                        ? 'inset 0 0 0 1.5px var(--tx-accent)'
                        : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 0,
                      padding: '3px',
                      /* Sin envolver: si una celda pasa a dos filas, esa fila
                         de la rejilla crece y se desalinea de la regleta. */
                      flexWrap: 'nowrap',
                      overflow: 'hidden',
                    }}
                  >
                    {/* La cara de cada uno con un anillo de su color, en vez de
                        un punto de color a secas: se ve QUIÉN puede a esa hora
                        sin tener que memorizar qué color es cada persona.

                        Solo caben MAX_EN_CELDA: la columna mide 80 px de ancho
                        mínimo y el equipo puede ser de cinco, así que a partir
                        de ahí el resto se resume en un "+N". Dejarlos envolver
                        haría crecer la fila y la rejilla se desalinearía de la
                        regleta de horas de la izquierda. */}
                    {members.slice(0, MAX_EN_CELDA).map((m, idx) => {
                      const mi = data.findIndex((d2) => d2.integrante_id === m.integrante_id)
                      const color = (mi >= 0 ? data[mi].color : null)
                        ?? (mi >= 0 ? MEMBER_PALETTE[mi % MEMBER_PALETTE.length] : hashColorHex(m.nombre))
                      return (
                        <span
                          key={m.integrante_id}
                          title={m.nombre}
                          style={{
                            /* El anillo va por `box-shadow` y no por `border`:
                               un borde real sumaría al tamaño de la caja y
                               descuadraría el solape, que se calcula sobre el
                               lado del avatar. */
                            boxShadow: `0 0 0 1.5px ${color}`,
                            borderRadius: '50%',
                            flexShrink: 0,
                            lineHeight: 0,
                            /* Fondo OPACO bajo cada avatar. El relleno del
                               avatar es translúcido, y apilados se
                               transparentaban entre sí: se veían las iniciales
                               del de atrás cruzando la cara del de delante.
                               `color-mix` contra el fondo del panel da el mismo
                               tono que se veía antes, pero tapando. */
                            background: `color-mix(in srgb, ${color} 16%, #15141a)`,
                            marginLeft: idx === 0 ? 0 : `-${SOLAPE}px`,
                            /* El primero queda encima y cada siguiente detrás.
                               Al revés, la pila se leería de derecha a
                               izquierda y el orden de la lista dejaría de
                               coincidir con lo que se ve. */
                            zIndex: MAX_EN_CELDA - idx,
                            position: 'relative',
                          }}
                        >
                          <AvatarIntegrante
                            nombre={m.nombre}
                            avatarUrl={data[mi]?.avatar_url ?? null}
                            color={color}
                            size={AVATAR_CELDA}
                          />
                        </span>
                      )
                    })}

                    {members.length > MAX_EN_CELDA && (
                      <span
                        title={members.slice(MAX_EN_CELDA).map((m) => m.nombre).join(', ')}
                        style={{
                          fontSize: '9.5px',
                          fontWeight: 500,
                          color: 'var(--tx-ink-secondary)',
                          fontVariantNumeric: 'tabular-nums',
                          flexShrink: 0,
                          marginLeft: '4px',
                        }}
                      >
                        +{members.length - MAX_EN_CELDA}
                      </span>
                    )}
                  </div>
                )
              })}
            </Fragment>
          ))}
        </div>
      </div>

      {/* Save button */}
      {hasChanges && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--tx-accent-fg)',
              background: saving ? 'var(--tx-ink-muted)' : 'var(--tx-accent)',
              padding: '8px 18px',
              borderRadius: '10px',
              border: 'none',
              cursor: saving ? 'not-allowed' : 'pointer',
              transition: 'opacity 0.15s, background 0.15s',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Guardando...' : 'Guardar mi disponibilidad'}
          </button>
        </div>
      )}
    </div>
  )
}
