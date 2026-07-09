'use client'

import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { Celda, DisponibilidadIntegrante } from '@/lib/types/disponibilidad'
import { DIAS_SEMANA } from '@/lib/types/disponibilidad'
import { hashColorHex, getInitials, MEMBER_PALETTE } from '@/lib/utils/lead-utils'

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
        {data.map((m, mi) => {
          const color = m.color ?? MEMBER_PALETTE[mi % MEMBER_PALETTE.length] ?? hashColorHex(m.nombre)
          return (
            <span
              key={m.integrante_id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--tx-ink-primary)',
                backgroundColor: 'rgba(255,255,255,0.06)',
                padding: '4px 10px',
                borderRadius: '100px',
                border: `1.5px solid ${color}`,
              }}
            >
              <span
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  backgroundColor: color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: '#000',
                  flexShrink: 0,
                }}
              >
                {getInitials(m.nombre)}
              </span>
              {m.nombre}
            </span>
          )
        })}
        {/* "Todos disponibles" chip */}
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--tx-accent)',
            backgroundColor: 'var(--tx-accent-subtle)',
            padding: '4px 10px',
            borderRadius: '100px',
            border: '1.5px solid var(--tx-accent)',
          }}
        >
          ✦ Todos disponibles
        </span>
      </div>

      {/* Common window counter */}
      <p
        style={{
          margin: 0,
          fontSize: '13px',
          fontWeight: 600,
          color: 'var(--tx-ink-secondary)',
        }}
      >
        {commonCount} hora{commonCount !== 1 ? 's' : ''} comunes a la semana
      </p>

      {/* Grid wrapper */}
      <div
        style={{
          overflowX: 'auto',
          borderRadius: '12px',
          border: '1px solid rgba(255,255,255,0.08)',
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
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--tx-ink-primary)',
                textAlign: 'center',
                padding: '10px 4px',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                borderLeft: '1px solid rgba(255,255,255,0.05)',
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
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--tx-ink-muted)',
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
                      gap: '2px',
                      padding: '3px',
                      flexWrap: 'wrap',
                    }}
                  >
                    {members.map((m) => {
                      const mi = data.findIndex((d2) => d2.integrante_id === m.integrante_id)
                      const color = (mi >= 0 ? data[mi].color : null)
                        ?? (mi >= 0 ? MEMBER_PALETTE[mi % MEMBER_PALETTE.length] : hashColorHex(m.nombre))
                      return (
                        <span
                          key={m.integrante_id}
                          title={m.nombre}
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: color,
                            flexShrink: 0,
                            opacity: 0.9,
                          }}
                        />
                      )
                    })}
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
