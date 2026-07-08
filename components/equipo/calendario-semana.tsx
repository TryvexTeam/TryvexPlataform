'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { Evento, EventoInsert } from '@/lib/types/evento'
import { TIPOS_EVENTO } from '@/lib/types/evento'
import type { DisponibilidadIntegrante } from '@/lib/types/disponibilidad'
import { DIAS_SEMANA } from '@/lib/types/disponibilidad'
import { getInitials, hashColorHex, MEMBER_PALETTE } from '@/lib/utils/lead-utils'

// ─── Constants ────────────────────────────────────────────────────────
const HORA_MIN = 8
const HORA_MAX = 22
const HORAS = Array.from({ length: HORA_MAX - HORA_MIN }, (_, i) => i + HORA_MIN)
const ROW_H = 48

type TipoEvento = (typeof TIPOS_EVENTO)[number]['id']

// ─── Date helpers ─────────────────────────────────────────────────────
function getMonday(d: Date): Date {
  const copy = new Date(d)
  const day = copy.getDay()
  const diff = day === 0 ? -6 : 1 - day
  copy.setHours(0, 0, 0, 0)
  copy.setDate(copy.getDate() + diff)
  return copy
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function fmt2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

function hhmm(d: Date): string {
  return `${fmt2(d.getHours())}:${fmt2(d.getMinutes())}`
}

function rangeLabel(start: Date): string {
  const end = addDays(start, 6)
  const months = [
    'ene', 'feb', 'mar', 'abr', 'may', 'jun',
    'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
  ]
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()} – ${end.getDate()} ${months[start.getMonth()]} ${start.getFullYear()}`
  }
  return `${start.getDate()} ${months[start.getMonth()]} – ${end.getDate()} ${months[end.getMonth()]} ${end.getFullYear()}`
}

function toLocalISO(d: Date): string {
  return d.toISOString()
}

function tipoColor(tipo: TipoEvento): string {
  return TIPOS_EVENTO.find((t) => t.id === tipo)?.color ?? '#a78bfa'
}

/** Snap a fractional hour to the nearest 15-min boundary */
function snap15(h: number): number {
  return Math.round(h * 4) / 4
}

/** Compute the local GMT offset string, e.g. "GMT-4" */
function gmtOffsetLabel(): string {
  const offset = new Date().getTimezoneOffset()
  const sign = offset <= 0 ? '+' : '-'
  const absH = Math.floor(Math.abs(offset) / 60)
  const absM = Math.abs(offset) % 60
  return absM === 0 ? `GMT${sign}${absH}` : `GMT${sign}${absH}:${fmt2(absM)}`
}

// ─── Overlap layout ───────────────────────────────────────────────────
interface LayoutEvent {
  ev: Evento
  top: number
  height: number
  col: number
  totalCols: number
}

function layoutEventsForDay(events: Evento[]): LayoutEvent[] {
  if (events.length === 0) return []

  const items = events
    .map((ev) => {
      const s = new Date(ev.inicio)
      const e = new Date(ev.fin)
      const startMin = (s.getHours() - HORA_MIN) * 60 + s.getMinutes()
      const endMin = (e.getHours() - HORA_MIN) * 60 + e.getMinutes()
      const top = (startMin / 60) * ROW_H
      const height = Math.max(((endMin - startMin) / 60) * ROW_H, 22)
      return { ev, top, height, startMin, endMin, col: 0, totalCols: 1 }
    })
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)

  // greedy column assignment
  const columns: { endMin: number }[][] = []
  for (const item of items) {
    let placed = false
    for (let c = 0; c < columns.length; c++) {
      const last = columns[c][columns[c].length - 1]
      if (last.endMin <= item.startMin) {
        item.col = c
        columns[c].push(item)
        placed = true
        break
      }
    }
    if (!placed) {
      item.col = columns.length
      columns.push([item])
    }
  }

  // resolve total columns for overlapping groups
  const totalCols = columns.length
  for (const item of items) {
    item.totalCols = totalCols
  }

  return items
}

// ─── Component ────────────────────────────────────────────────────────
export function CalendarioSemana() {
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()))
  const [showDisp, setShowDisp] = useState(true)
  const [disp, setDisp] = useState<DisponibilidadIntegrante[] | null>(null)
  const [eventos, setEventos] = useState<Evento[]>([])
  const [now, setNow] = useState(new Date())

  // Modal state
  const [modal, setModal] = useState<{
    dayIdx: number
    startHour: number
    startMin: number
    endHour: number
    endMin: number
  } | null>(null)
  const [modalTitulo, setModalTitulo] = useState('')
  const [modalTipo, setModalTipo] = useState<TipoEvento>('interno')
  const [modalInicio, setModalInicio] = useState('09:00')
  const [modalFin, setModalFin] = useState('10:00')
  const [modalAsistentes, setModalAsistentes] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)

  // Detail popover
  const [detailEvento, setDetailEvento] = useState<Evento | null>(null)
  const [detailPos, setDetailPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

  // Drag state
  const dragRef = useRef<{
    dayIdx: number
    startY: number
    colEl: HTMLDivElement
    startHour: number
  } | null>(null)
  const [dragGhost, setDragGhost] = useState<{
    dayIdx: number
    top: number
    height: number
    startLabel: string
    endLabel: string
  } | null>(null)

  // Hover slot state
  const [hoverSlot, setHoverSlot] = useState<{ dayIdx: number; hora: number } | null>(null)

  // Grid scroll container ref (for auto-scroll)
  const gridScrollRef = useRef<HTMLDivElement>(null)

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  // Check if the current week contains today
  const isCurrentWeek = useMemo(() => {
    const todayMonday = getMonday(new Date())
    return isSameDay(weekStart, todayMonday)
  }, [weekStart])

  // ─── Fetch disponibilidad (once) ─────────────────────────────────
  useEffect(() => {
    let cancelled = false
    fetch('/api/disponibilidad')
      .then((r) => r.json())
      .then((json: { success: boolean; data: DisponibilidadIntegrante[] }) => {
        if (cancelled) return
        if (json.success) setDisp(json.data)
      })
      .catch(() => {
        if (!cancelled) toast.error('Error al cargar disponibilidad')
      })
    return () => { cancelled = true }
  }, [])

  // ─── Fetch eventos (when week changes) ───────────────────────────
  const fetchEventos = useCallback(() => {
    const desde = toLocalISO(weekStart)
    const hasta = toLocalISO(addDays(weekStart, 7))
    fetch(`/api/eventos?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`)
      .then((r) => r.json())
      .then((json: { success: boolean; data: Evento[] }) => {
        if (json.success) setEventos(json.data)
      })
      .catch(() => toast.error('Error al cargar eventos'))
  }, [weekStart])

  useEffect(() => { fetchEventos() }, [fetchEventos])

  // ─── Now line interval ────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  // ─── Auto-scroll to now line at ~1/3 of visible height ────────────
  useEffect(() => {
    if (!isCurrentWeek) return
    const el = gridScrollRef.current
    if (!el) return
    const nowH = now.getHours()
    const nowM = now.getMinutes()
    if (nowH >= HORA_MIN && nowH < HORA_MAX) {
      const nowTop = ((nowH - HORA_MIN) * 60 + nowM) / 60 * ROW_H
      const target = Math.max(0, nowTop - el.clientHeight / 3)
      el.scrollTop = target
    }
    // Only run on mount / week change, not on every `now` tick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, isCurrentWeek])

  // ─── Navigation ──────────────────────────────────────────────────
  const prevWeek = useCallback(() => setWeekStart((w) => addDays(w, -7)), [])
  const nextWeek = useCallback(() => setWeekStart((w) => addDays(w, 7)), [])
  const goToday = useCallback(() => setWeekStart(getMonday(new Date())), [])

  const closeModal = useCallback(() => { setModal(null); setDetailEvento(null) }, [])

  // ─── Keyboard shortcuts (Cron-style) ──────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore if focus is inside input/textarea or modal is open
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if (e.key === 'Escape') {
        closeModal()
        return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        prevWeek()
        return
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        nextWeek()
        return
      }
      if (e.key === 't' || e.key === 'T') {
        e.preventDefault()
        goToday()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prevWeek, nextWeek, goToday])

  // ─── Availability map ────────────────────────────────────────────
  const totalMembers = disp?.length ?? 0

  // Color estable por integrante (paleta por índice; hash como fallback)
  const memberColorMap = useMemo(() => {
    const map = new Map<string, string>()
    if (disp) {
      disp.forEach((m, i) => {
        map.set(m.integrante_id, MEMBER_PALETTE[i % MEMBER_PALETTE.length])
      })
    }
    return map
  }, [disp])

  const memberColor = useCallback(
    (integranteId: string, nombre: string): string =>
      memberColorMap.get(integranteId) ?? hashColorHex(nombre),
    [memberColorMap],
  )

  const dispCountMap = new Map<string, number>()
  // Por celda: qué integrantes están disponibles (para pintar bandas por color)
  const dispMembersMap = new Map<string, { id: string; nombre: string }[]>()
  if (disp) {
    for (const m of disp) {
      for (const c of m.celdas) {
        const k = `${c.dia_semana}-${c.hora}`
        dispCountMap.set(k, (dispCountMap.get(k) ?? 0) + 1)
        const list = dispMembersMap.get(k) ?? []
        list.push({ id: m.integrante_id, nombre: m.nombre })
        dispMembersMap.set(k, list)
      }
    }
  }

  // ─── Events per day ──────────────────────────────────────────────
  const eventsByDay: Evento[][] = days.map((d) =>
    eventos.filter((ev) => isSameDay(new Date(ev.inicio), d))
  )

  // ─── Best windows ───────────────────────────────────────────────
  const bestWindows: { dayIdx: number; hora: number }[] = []
  if (disp && totalMembers > 0) {
    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
      for (const hora of HORAS) {
        const k = `${dayIdx}-${hora}`
        if ((dispCountMap.get(k) ?? 0) === totalMembers) {
          // check no event overlaps this slot
          const slotStart = new Date(days[dayIdx])
          slotStart.setHours(hora, 0, 0, 0)
          const slotEnd = new Date(slotStart)
          slotEnd.setHours(hora + 1, 0, 0, 0)
          const hasConflict = eventsByDay[dayIdx].some((ev) => {
            const evS = new Date(ev.inicio).getTime()
            const evE = new Date(ev.fin).getTime()
            return evS < slotEnd.getTime() && evE > slotStart.getTime()
          })
          if (!hasConflict && bestWindows.length < 3) {
            bestWindows.push({ dayIdx, hora })
          }
        }
      }
    }
  }

  // ─── Drag to create (15-min snap + live label) ────────────────────
  const handleColMouseDown = (e: React.MouseEvent<HTMLDivElement>, dayIdx: number) => {
    // Ignore clicks on event blocks
    if ((e.target as HTMLElement).closest('[data-event-block]')) return
    const col = e.currentTarget
    const rect = col.getBoundingClientRect()
    const y = e.clientY - rect.top + col.scrollTop
    const hour = HORA_MIN + y / ROW_H
    const snapped = snap15(hour)
    dragRef.current = { dayIdx, startY: (snapped - HORA_MIN) * ROW_H, colEl: col, startHour: snapped }

    const onMove = (me: MouseEvent) => {
      if (!dragRef.current) return
      const curY = me.clientY - rect.top + col.scrollTop
      const curHour = snap15(Math.max(HORA_MIN, Math.min(HORA_MAX, HORA_MIN + curY / ROW_H)))
      const startSnapped = dragRef.current.startHour
      const minH = Math.min(startSnapped, curHour)
      const maxH = Math.max(startSnapped, curHour)
      const finalEnd = maxH === minH ? minH + 0.25 : maxH
      const top = (minH - HORA_MIN) * ROW_H
      const height = Math.max((finalEnd - minH) * ROW_H, ROW_H / 4)
      const sHr = Math.floor(minH)
      const sMin = Math.round((minH - sHr) * 60)
      const eHr = Math.floor(finalEnd)
      const eMin = Math.round((finalEnd - eHr) * 60)
      setDragGhost({
        dayIdx: dragRef.current.dayIdx,
        top,
        height,
        startLabel: `${fmt2(sHr)}:${fmt2(sMin)}`,
        endLabel: `${fmt2(eHr)}:${fmt2(eMin)}`,
      })
    }

    const onUp = (me: MouseEvent) => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      if (!dragRef.current) return
      const curY = me.clientY - rect.top + col.scrollTop
      const curHour = snap15(Math.max(HORA_MIN, Math.min(HORA_MAX, HORA_MIN + curY / ROW_H)))
      const startSnapped = dragRef.current.startHour
      const minH = Math.min(startSnapped, curHour)
      const maxH = Math.max(startSnapped, curHour)
      const finalEnd = maxH === minH ? minH + 1 : maxH
      const startHourInt = Math.floor(minH)
      const startMinInt = Math.round((minH - startHourInt) * 60)
      const endHourInt = Math.floor(finalEnd)
      const endMinInt = Math.round((finalEnd - endHourInt) * 60)
      openModal(dayIdx, startHourInt, startMinInt, endHourInt, Math.min(endMinInt, 59))
      setDragGhost(null)
      dragRef.current = null
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // ─── Hover slot handler ───────────────────────────────────────────
  const handleColMouseMove = (e: React.MouseEvent<HTMLDivElement>, dayIdx: number) => {
    if (dragRef.current) return // don't show hover while dragging
    if ((e.target as HTMLElement).closest('[data-event-block]')) {
      setHoverSlot(null)
      return
    }
    const col = e.currentTarget
    const rect = col.getBoundingClientRect()
    const y = e.clientY - rect.top + col.scrollTop
    const hora = Math.floor(HORA_MIN + y / ROW_H)
    if (hora >= HORA_MIN && hora < HORA_MAX) {
      setHoverSlot({ dayIdx, hora })
    } else {
      setHoverSlot(null)
    }
  }

  const handleColMouseLeave = () => {
    setHoverSlot(null)
  }

  // ─── Modal helpers ──────────────────────────────────────────────
  const openModal = (
    dayIdx: number,
    sH: number,
    sM: number,
    eH: number,
    eM: number,
  ) => {
    setModal({ dayIdx, startHour: sH, startMin: sM, endHour: eH, endMin: eM })
    setModalTitulo('')
    setModalTipo('interno')
    setModalInicio(`${fmt2(sH)}:${fmt2(sM)}`)
    setModalFin(`${fmt2(eH)}:${fmt2(eM)}`)
    const ownId = disp?.find((m) => m.es_propio)?.integrante_id
    setModalAsistentes(ownId ? new Set([ownId]) : new Set())
    setCreating(false)
  }


  const handleCreate = async () => {
    if (!modal) return
    if (!modalTitulo.trim()) { toast.error('Título requerido'); return }
    const parseHora = (v: string): [number, number] | null => {
      const m = /^(\d{1,2}):(\d{2})$/.exec(v)
      if (!m) return null
      const h = Number(m[1])
      const min = Number(m[2])
      if (h > 23 || min > 59) return null
      return [h, min]
    }
    const ini = parseHora(modalInicio)
    const end = parseHora(modalFin)
    if (!ini || !end) { toast.error('Hora de inicio y fin son requeridas'); return }
    const day = days[modal.dayIdx]
    const inicio = new Date(day)
    inicio.setHours(ini[0], ini[1], 0, 0)
    const fin = new Date(day)
    fin.setHours(end[0], end[1], 0, 0)
    if (fin <= inicio) { toast.error('El fin debe ser posterior al inicio'); return }
    const body: EventoInsert = {
      titulo: modalTitulo.trim(),
      tipo: modalTipo,
      inicio: inicio.toISOString(),
      fin: fin.toISOString(),
      asistentes_ids: Array.from(modalAsistentes),
    }
    setCreating(true)
    try {
      const res = await fetch('/api/eventos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json().catch(() => ({})) as {
        error?: string
        data?: { google_sync?: boolean; meet_link?: string | null }
      }
      if (!res.ok) {
        throw new Error(j.error ?? 'Error al crear evento')
      }
      if (j.data?.google_sync) {
        toast.success(j.data.meet_link
          ? 'Evento creado con Meet e invitaciones enviadas'
          : 'Evento creado y sincronizado con Google Calendar')
      } else {
        toast.warning('Evento creado en el CRM, pero no se pudo sincronizar con Google')
      }
      closeModal()
      fetchEventos()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al crear evento')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/eventos/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Error al eliminar')
      toast.success('Evento eliminado')
      setDetailEvento(null)
      fetchEventos()
    } catch {
      toast.error('Error al eliminar evento')
    }
  }

  // ─── Compute now-line position (used in gutter + columns) ─────────
  const nowH = now.getHours()
  const nowM = now.getMinutes()
  const nowInRange = nowH >= HORA_MIN && nowH < HORA_MAX
  const nowTop = nowInRange ? ((nowH - HORA_MIN) * 60 + nowM) / 60 * ROW_H : null
  const nowTimeLabel = `${fmt2(nowH)}:${fmt2(nowM)}`

  // Which gutter hour does the now-line collide with?
  // The gutter label sits centered at (hora - HORA_MIN) * ROW_H, so we check proximity
  const nowCollidesHour = nowInRange ? nowH : -1

  // ─── Styles ──────────────────────────────────────────────────────
  const navBtn: React.CSSProperties = {
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: '8px',
    padding: '5px 10px',
    background: 'transparent',
    color: 'var(--tx-ink-primary)',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    transition: 'background 0.15s',
  }

  const todayBtnDisabled = isCurrentWeek

  // ─── Render ──────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          flexWrap: 'wrap',
        }}
      >
        <button type="button" style={navBtn} onClick={prevWeek} onMouseEnter={(e) => { (e.currentTarget.style.background = 'rgba(255,255,255,0.05)') }} onMouseLeave={(e) => { (e.currentTarget.style.background = 'transparent') }}>
          ←
        </button>
        <button
          type="button"
          style={{
            ...navBtn,
            opacity: todayBtnDisabled ? 0.4 : 1,
            cursor: todayBtnDisabled ? 'default' : 'pointer',
            pointerEvents: todayBtnDisabled ? 'none' : 'auto',
          }}
          onClick={goToday}
          onMouseEnter={(e) => { if (!todayBtnDisabled) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        >
          Hoy
        </button>
        <button type="button" style={navBtn} onClick={nextWeek} onMouseEnter={(e) => { (e.currentTarget.style.background = 'rgba(255,255,255,0.05)') }} onMouseLeave={(e) => { (e.currentTarget.style.background = 'transparent') }}>
          →
        </button>
        <span
          style={{
            fontSize: '15px',
            fontWeight: 700,
            color: 'var(--tx-ink-primary)',
            marginLeft: '4px',
          }}
        >
          {rangeLabel(weekStart)}
        </span>

        {/* Keyboard shortcuts hint (desktop only) */}
        <span
          style={{
            fontSize: '10.5px',
            color: 'var(--tx-ink-muted)',
            marginLeft: '4px',
            whiteSpace: 'nowrap',
          }}
          className="hidden md:block"
        >
          ← → semanas · T hoy
        </span>

        {/* Toggle disponibilidad */}
        <label
          style={{
            marginLeft: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--tx-ink-secondary)',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <span
            role="switch"
            aria-checked={showDisp}
            tabIndex={0}
            onClick={() => setShowDisp((v) => !v)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setShowDisp((v) => !v) }}
            style={{
              width: '34px',
              height: '18px',
              borderRadius: '9px',
              background: showDisp ? 'var(--tx-accent)' : 'rgba(255,255,255,0.12)',
              position: 'relative',
              transition: 'background 0.2s',
              flexShrink: 0,
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: '2px',
                left: showDisp ? '18px' : '2px',
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                background: '#fff',
                transition: 'left 0.2s',
              }}
            />
          </span>
          Ver disponibilidad
        </label>
      </div>

      {/* ── Leyenda de disponibilidad por integrante ───────────── */}
      {showDisp && disp && disp.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--tx-ink-secondary)',
          }}
        >
          <span style={{ color: 'var(--tx-ink-muted)' }}>Disponibilidad:</span>
          {disp.map((m) => {
            const c = memberColor(m.integrante_id, m.nombre)
            return (
              <span
                key={m.integrante_id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '3px 10px',
                  borderRadius: '100px',
                  background: `color-mix(in srgb, ${c} 14%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${c} 45%, transparent)`,
                  color: `color-mix(in oklab, ${c} 70%, white)`,
                  fontSize: '11.5px',
                }}
              >
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: c,
                    flexShrink: 0,
                  }}
                />
                {m.nombre}
                {m.es_propio && ' (tú)'}
              </span>
            )
          })}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              color: 'var(--tx-ink-muted)',
              fontWeight: 500,
            }}
          >
            <span
              style={{
                width: '14px',
                height: '10px',
                borderRadius: '2px',
                background: 'var(--tx-accent-subtle)',
                border: '1px solid color-mix(in srgb, var(--tx-accent) 35%, transparent)',
                flexShrink: 0,
              }}
            />
            todos disponibles
          </span>
        </div>
      )}

      {/* ── Best windows panel ─────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'wrap',
          fontSize: '12px',
          fontWeight: 600,
          color: 'var(--tx-ink-secondary)',
        }}
      >
        <span style={{ color: 'var(--tx-accent)', marginRight: '2px' }}>✦</span>
        Mejores ventanas:
        {bestWindows.length === 0 ? (
          <span style={{ color: 'var(--tx-ink-muted)', fontWeight: 500 }}>
            Sin ventanas comunes esta semana
          </span>
        ) : (
          bestWindows.map((w) => (
            <button
              key={`${w.dayIdx}-${w.hora}`}
              type="button"
              onClick={() => openModal(w.dayIdx, w.hora, 0, w.hora + 1, 0)}
              style={{
                background: 'var(--tx-accent-subtle)',
                color: 'var(--tx-accent)',
                border: '1px solid var(--tx-accent)',
                borderRadius: '100px',
                padding: '3px 12px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'opacity 0.15s',
              }}
            >
              {DIAS_SEMANA[w.dayIdx]} {days[w.dayIdx].getDate()} · {fmt2(w.hora)}:00
            </button>
          ))
        )}
      </div>

      {/* ── Grid ──────────────────────────────────────────────── */}
      <div
        style={{
          overflowX: 'auto',
          borderRadius: '12px',
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(255,255,255,0.02)',
        }}
      >
        {/* Sticky day headers */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '56px repeat(7, minmax(110px, 1fr))',
            userSelect: 'none',
            minWidth: '860px',
            position: 'sticky',
            top: 0,
            zIndex: 20,
            background: 'rgba(10,10,12,0.92)',
            backdropFilter: 'blur(8px)',
          }}
        >
          {/* Gutter header with timezone */}
          <div
            style={{
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              padding: '10px 4px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              justifyContent: 'flex-end',
              paddingRight: '8px',
            }}
          >
            <span
              style={{
                fontSize: '9.5px',
                fontWeight: 600,
                color: 'var(--tx-ink-muted)',
                fontVariantNumeric: 'tabular-nums',
                fontFamily: 'var(--font-mono, monospace)',
              }}
            >
              {gmtOffsetLabel()}
            </span>
          </div>
          {days.map((d, i) => {
            const isToday = isSameDay(d, now)
            const isPast = d < new Date(now.getFullYear(), now.getMonth(), now.getDate())
            const isWeekend = i >= 5
            return (
              <div
                key={`dh-${i}`}
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: isToday
                    ? 'var(--tx-accent)'
                    : isWeekend
                      ? 'var(--tx-ink-muted)'
                      : isPast
                        ? 'var(--tx-ink-primary)'
                        : 'var(--tx-ink-primary)',
                  textAlign: 'center',
                  padding: '10px 4px 8px',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  borderLeft: '1px solid rgba(255,255,255,0.04)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '2px',
                  opacity: isPast && !isToday ? 0.55 : 1,
                }}
              >
                <span style={isWeekend ? { color: 'var(--tx-ink-muted)' } : undefined}>{DIAS_SEMANA[i]}</span>
                <span
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '14px',
                    fontWeight: 800,
                    background: isToday ? 'var(--tx-accent)' : 'transparent',
                    color: isToday ? 'var(--tx-accent-fg)' : 'inherit',
                    fontVariantNumeric: 'tabular-nums',
                    fontFamily: 'var(--font-mono, monospace)',
                  }}
                >
                  {d.getDate()}
                </span>
              </div>
            )
          })}
        </div>

        {/* Scrollable body */}
        <div
          ref={gridScrollRef}
          style={{
            maxHeight: 'calc(100vh - 320px)',
            overflowY: 'auto',
            overflowX: 'hidden',
          }}
        >
          {/* Body: hour rows + columns with absolute positioning */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '56px repeat(7, minmax(110px, 1fr))',
              minWidth: '860px',
              position: 'relative',
            }}
          >
            {/* Hour gutter */}
            <div style={{ position: 'relative' }}>
              {HORAS.map((h) => {
                const isColliding = h === nowCollidesHour && isCurrentWeek
                return (
                  <div
                    key={`hg-${h}`}
                    style={{
                      height: `${ROW_H}px`,
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'flex-end',
                      paddingRight: '8px',
                      paddingTop: '0px',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: 'var(--tx-ink-muted)',
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                      boxSizing: 'border-box',
                      position: 'relative',
                      top: '-6px',
                      fontVariantNumeric: 'tabular-nums',
                      fontFamily: 'var(--font-mono, monospace)',
                      visibility: isColliding ? 'hidden' : 'visible',
                    }}
                  >
                    {h}:00
                  </div>
                )
              })}
              {/* Now-line tick in gutter */}
              {nowTop !== null && isCurrentWeek && (
                <div
                  style={{
                    position: 'absolute',
                    top: `${nowTop - 7}px`,
                    right: '4px',
                    fontSize: '10px',
                    fontWeight: 700,
                    color: 'var(--tx-accent)',
                    fontVariantNumeric: 'tabular-nums',
                    fontFamily: 'var(--font-mono, monospace)',
                    lineHeight: '14px',
                    zIndex: 16,
                    background: 'rgba(10,10,12,0.92)',
                    padding: '0 2px',
                    borderRadius: '2px',
                  }}
                >
                  {nowTimeLabel}
                </div>
              )}
            </div>

            {/* Day columns */}
            {days.map((d, dayIdx) => {
              const isToday = isSameDay(d, now)
              const isPast = d < new Date(now.getFullYear(), now.getMonth(), now.getDate())
              const laid = layoutEventsForDay(eventsByDay[dayIdx])

              // Now line position (only on today's column)
              let dayNowTop: number | null = null
              if (isToday && nowTop !== null) {
                dayNowTop = nowTop
              }

              // Column dimming for past days
              const colOpacity = isPast && !isToday ? 0.55 : 1

              return (
                <div
                  key={`dc-${dayIdx}`}
                  style={{
                    position: 'relative',
                    borderLeft: '1px solid rgba(255,255,255,0.04)',
                    height: `${HORAS.length * ROW_H}px`,
                    cursor: 'crosshair',
                    background: isToday ? 'rgba(255,255,255,0.015)' : 'transparent',
                    opacity: colOpacity,
                  }}
                  onMouseDown={(e) => handleColMouseDown(e, dayIdx)}
                  onMouseMove={(e) => handleColMouseMove(e, dayIdx)}
                  onMouseLeave={handleColMouseLeave}
                >
                  {/* Hour grid lines + dashed half-hour lines */}
                  {HORAS.map((h) => (
                    <div
                      key={`gl-${h}`}
                      style={{
                        position: 'absolute',
                        top: `${(h - HORA_MIN) * ROW_H}px`,
                        left: 0,
                        right: 0,
                        height: `${ROW_H}px`,
                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                        boxSizing: 'border-box',
                      }}
                    >
                      {/* Dashed half-hour line */}
                      <div
                        style={{
                          position: 'absolute',
                          top: `${ROW_H / 2}px`,
                          left: 0,
                          right: 0,
                          height: '0px',
                          borderBottom: '1px dashed rgba(255,255,255,0.03)',
                        }}
                      />
                    </div>
                  ))}

                  {/* Availability layer — bandas de color por integrante */}
                  {showDisp &&
                    HORAS.map((h) => {
                      const k = `${dayIdx}-${h}`
                      const members = dispMembersMap.get(k)
                      if (!members || members.length === 0) return null
                      const allIn = totalMembers > 0 && members.length === totalMembers
                      return (
                        <div
                          key={`av-${h}`}
                          style={{
                            position: 'absolute',
                            top: `${(h - HORA_MIN) * ROW_H}px`,
                            left: 0,
                            right: 0,
                            height: `${ROW_H}px`,
                            display: 'flex',
                            background: allIn ? 'var(--tx-accent-subtle)' : 'transparent',
                            boxShadow: allIn
                              ? 'inset 0 0 0 1px color-mix(in srgb, var(--tx-accent) 35%, transparent)'
                              : 'none',
                            pointerEvents: 'none',
                            zIndex: 1,
                          }}
                        >
                          {members.map((m) => {
                            const c = memberColor(m.id, m.nombre)
                            return (
                              <div
                                key={m.id}
                                style={{
                                  flex: 1,
                                  background: `color-mix(in srgb, ${c} 16%, transparent)`,
                                  borderTop: `2px solid color-mix(in srgb, ${c} 55%, transparent)`,
                                  boxSizing: 'border-box',
                                }}
                              />
                            )
                          })}
                        </div>
                      )
                    })}

                  {/* Hover affordance slot */}
                  {hoverSlot && hoverSlot.dayIdx === dayIdx && (
                    <div
                      style={{
                        position: 'absolute',
                        top: `${(hoverSlot.hora - HORA_MIN) * ROW_H + 1}px`,
                        left: '2px',
                        right: '2px',
                        height: `${ROW_H - 2}px`,
                        border: '1px dashed rgba(255,255,255,0.15)',
                        borderRadius: '6px',
                        zIndex: 4,
                        pointerEvents: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '14px',
                          fontWeight: 300,
                          color: 'rgba(255,255,255,0.25)',
                          lineHeight: 1,
                        }}
                      >
                        +
                      </span>
                    </div>
                  )}

                  {/* Event blocks */}
                  {laid.map((item) => {
                    const color = tipoColor(item.ev.tipo)
                    const width = `calc(${100 / item.totalCols}% - 4px)`
                    const left = `calc(${(item.col / item.totalCols) * 100}% + 2px)`
                    return (
                      <div
                        key={item.ev.id}
                        data-event-block="true"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDetailEvento(item.ev)
                          setDetailPos({ x: e.clientX, y: e.clientY })
                        }}
                        style={{
                          position: 'absolute',
                          top: `${item.top}px`,
                          left,
                          width,
                          height: `${item.height}px`,
                          minHeight: '22px',
                          background: `color-mix(in srgb, ${color} 18%, transparent)`,
                          borderLeft: `3px solid ${color}`,
                          borderRadius: '4px',
                          padding: '3px 6px',
                          overflow: 'hidden',
                          cursor: 'pointer',
                          zIndex: 5,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '1px',
                          transition: 'background 120ms, box-shadow 120ms',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = `color-mix(in srgb, ${color} 28%, transparent)`
                          e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.4)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = `color-mix(in srgb, ${color} 18%, transparent)`
                          e.currentTarget.style.boxShadow = 'none'
                        }}
                      >
                        <span
                          style={{
                            fontSize: '12px',
                            fontWeight: 600,
                            color: `color-mix(in oklab, ${color} 60%, white)`,
                            lineHeight: '1.2',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {item.ev.titulo}
                        </span>
                        <span
                          style={{
                            fontSize: '10.5px',
                            color: 'var(--tx-ink-muted)',
                            lineHeight: '1.2',
                          }}
                        >
                          {hhmm(new Date(item.ev.inicio))}–{hhmm(new Date(item.ev.fin))}
                        </span>
                      </div>
                    )
                  })}

                  {/* Drag ghost with live time label */}
                  {dragGhost && dragGhost.dayIdx === dayIdx && (
                    <div
                      style={{
                        position: 'absolute',
                        top: `${dragGhost.top}px`,
                        left: '2px',
                        right: '2px',
                        height: `${dragGhost.height}px`,
                        background: 'rgba(255,255,255,0.08)',
                        border: '1.5px dashed rgba(255,255,255,0.25)',
                        borderRadius: '4px',
                        zIndex: 10,
                        pointerEvents: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          color: 'rgba(255,255,255,0.7)',
                          fontVariantNumeric: 'tabular-nums',
                          fontFamily: 'var(--font-mono, monospace)',
                        }}
                      >
                        {dragGhost.startLabel} – {dragGhost.endLabel}
                      </span>
                    </div>
                  )}

                  {/* Now line */}
                  {dayNowTop !== null && (
                    <div
                      style={{
                        position: 'absolute',
                        top: `${dayNowTop}px`,
                        left: 0,
                        right: 0,
                        height: '2px',
                        background: 'var(--tx-accent)',
                        zIndex: 15,
                        pointerEvents: 'none',
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          left: '-4px',
                          top: '-4px',
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          background: 'var(--tx-accent)',
                        }}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Detail Popover ──────────────────────────────────────── */}
      {detailEvento && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0,0,0,0.4)',
          }}
          onClick={closeModal}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              left: `${Math.min(detailPos.x, window.innerWidth - 300)}px`,
              top: `${Math.min(detailPos.y, Math.max(12, window.innerHeight - 440))}px`,
              width: '280px',
              maxHeight: 'min(420px, calc(100vh - 24px))',
              overflowY: 'auto',
              background: '#1c1c1e',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: '12px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              zIndex: 101,
              boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: tipoColor(detailEvento.tipo),
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  color: 'var(--tx-ink-primary)',
                }}
              >
                {detailEvento.titulo}
              </span>
            </div>
            <span
              style={{
                fontSize: '12px',
                color: 'var(--tx-ink-muted)',
              }}
            >
              {TIPOS_EVENTO.find((t) => t.id === detailEvento.tipo)?.label}
            </span>
            <span
              style={{
                fontSize: '12px',
                color: 'var(--tx-ink-secondary)',
              }}
            >
              {hhmm(new Date(detailEvento.inicio))} – {hhmm(new Date(detailEvento.fin))}
            </span>

            {/* Unirse a Meet */}
            {detailEvento.meet_link && (
              <a
                href={detailEvento.meet_link}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  marginTop: '4px',
                  background: 'var(--tx-accent)',
                  color: 'var(--tx-accent-fg)',
                  borderRadius: '8px',
                  padding: '8px 14px',
                  fontSize: '13px',
                  fontWeight: 700,
                  textDecoration: 'none',
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85' }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4Z" fill="currentColor" />
                </svg>
                Unirse a la reunión
              </a>
            )}

            {/* Ubicación */}
            {detailEvento.ubicacion && (
              <span
                style={{
                  fontSize: '12px',
                  color: 'var(--tx-ink-secondary)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '6px',
                }}
              >
                <span aria-hidden="true" style={{ flexShrink: 0 }}>📍</span>
                <span style={{ wordBreak: 'break-word' }}>{detailEvento.ubicacion}</span>
              </span>
            )}

            {/* Invitados externos (Google) */}
            {detailEvento.asistentes_externos.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--tx-ink-muted)' }}>
                  Invitados
                </span>
                {detailEvento.asistentes_externos.map((a) => (
                  <span
                    key={a.email}
                    style={{
                      fontSize: '11.5px',
                      color: 'var(--tx-ink-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      overflow: 'hidden',
                    }}
                  >
                    <span
                      aria-label={
                        a.respuesta === 'accepted' ? 'Aceptó'
                        : a.respuesta === 'declined' ? 'Rechazó'
                        : a.respuesta === 'tentative' ? 'Quizás'
                        : 'Sin responder'
                      }
                      style={{
                        width: '7px',
                        height: '7px',
                        borderRadius: '50%',
                        flexShrink: 0,
                        background:
                          a.respuesta === 'accepted' ? '#22c55e'
                          : a.respuesta === 'declined' ? '#E8352A'
                          : a.respuesta === 'tentative' ? '#eab308'
                          : 'rgba(255,255,255,0.25)',
                      }}
                    />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {a.nombre || a.email}
                    </span>
                  </span>
                ))}
              </div>
            )}

            {/* Notas / descripción */}
            {detailEvento.notas && (
              <span
                style={{
                  fontSize: '11.5px',
                  color: 'var(--tx-ink-muted)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: '90px',
                  overflowY: 'auto',
                  marginTop: '2px',
                }}
              >
                {detailEvento.notas}
              </span>
            )}

            {/* Ver en Google Calendar */}
            {detailEvento.html_link && (
              <a
                href={detailEvento.html_link}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: '11.5px',
                  fontWeight: 600,
                  color: 'var(--tx-ink-secondary)',
                  textDecoration: 'none',
                  marginTop: '2px',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--tx-ink-primary)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--tx-ink-secondary)' }}
              >
                Ver en Google Calendar ↗
              </a>
            )}

            {detailEvento.asistentes.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '4px',
                  marginTop: '4px',
                }}
              >
                {detailEvento.asistentes.map((a) => (
                  <span
                    key={a.integrante_id}
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '100px',
                      background: 'rgba(255,255,255,0.06)',
                      color: 'var(--tx-ink-secondary)',
                      border: `1px solid ${memberColor(a.integrante_id, a.nombre)}`,
                    }}
                  >
                    {getInitials(a.nombre)} {a.nombre}
                  </span>
                ))}
              </div>
            )}
            {detailEvento.es_mio && (
              <button
                type="button"
                onClick={() => handleDelete(detailEvento.id)}
                style={{
                  marginTop: '6px',
                  background: 'rgba(232,53,42,0.15)',
                  color: '#E8352A',
                  border: '1px solid rgba(232,53,42,0.3)',
                  borderRadius: '8px',
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Eliminar
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Create Modal ─────────────────────────────────────────── */}
      {modal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={closeModal}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '380px',
              maxWidth: '95vw',
              background: '#1c1c1e',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: '16px',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
            }}
          >
            <span
              style={{
                fontSize: '15px',
                fontWeight: 700,
                color: 'var(--tx-ink-primary)',
              }}
            >
              Nuevo evento · {DIAS_SEMANA[modal.dayIdx]} {days[modal.dayIdx].getDate()}
            </span>

            {/* Title */}
            <input
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              placeholder="Título del evento"
              value={modalTitulo}
              onChange={(e) => setModalTitulo(e.target.value)}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: '8px',
                padding: '8px 12px',
                fontSize: '13px',
                color: 'var(--tx-ink-primary)',
                outline: 'none',
              }}
            />

            {/* Type chips */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {TIPOS_EVENTO.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setModalTipo(t.id)}
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    padding: '4px 12px',
                    borderRadius: '100px',
                    border: `1.5px solid ${t.color}`,
                    background: modalTipo === t.id ? `${t.color}33` : 'transparent',
                    color: modalTipo === t.id ? t.color : 'var(--tx-ink-secondary)',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Time inputs */}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input
                type="time"
                value={modalInicio}
                onChange={(e) => setModalInicio(e.target.value)}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  borderRadius: '8px',
                  padding: '6px 10px',
                  fontSize: '13px',
                  color: 'var(--tx-ink-primary)',
                  outline: 'none',
                  colorScheme: 'dark',
                }}
              />
              <span style={{ color: 'var(--tx-ink-muted)', fontSize: '13px' }}>–</span>
              <input
                type="time"
                value={modalFin}
                onChange={(e) => setModalFin(e.target.value)}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  borderRadius: '8px',
                  padding: '6px 10px',
                  fontSize: '13px',
                  color: 'var(--tx-ink-primary)',
                  outline: 'none',
                  colorScheme: 'dark',
                }}
              />
            </div>

            {/* Attendees */}
            {disp && disp.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--tx-ink-muted)' }}>
                  Asistentes
                </span>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {disp.map((m) => {
                    const selected = modalAsistentes.has(m.integrante_id)
                    const color = memberColor(m.integrante_id, m.nombre)
                    return (
                      <button
                        key={m.integrante_id}
                        type="button"
                        onClick={() => {
                          setModalAsistentes((prev) => {
                            const next = new Set(prev)
                            if (next.has(m.integrante_id)) next.delete(m.integrante_id)
                            else next.add(m.integrante_id)
                            return next
                          })
                        }}
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '4px 10px',
                          borderRadius: '100px',
                          border: `1.5px solid ${selected ? color : 'rgba(255,255,255,0.10)'}`,
                          background: selected ? `${color}22` : 'transparent',
                          color: selected ? color : 'var(--tx-ink-muted)',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <span
                          style={{
                            width: '16px',
                            height: '16px',
                            borderRadius: '50%',
                            background: color,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '8px',
                            fontWeight: 700,
                            color: '#000',
                          }}
                        >
                          {getInitials(m.nombre)}
                        </span>
                        {m.nombre}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' }}>
              <button
                type="button"
                onClick={closeModal}
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.10)',
                  background: 'transparent',
                  color: 'var(--tx-ink-secondary)',
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  padding: '8px 18px',
                  borderRadius: '8px',
                  border: 'none',
                  background: creating ? 'var(--tx-ink-muted)' : 'var(--tx-accent)',
                  color: 'var(--tx-accent-fg)',
                  cursor: creating ? 'not-allowed' : 'pointer',
                  opacity: creating ? 0.6 : 1,
                  transition: 'opacity 0.15s, background 0.15s',
                }}
              >
                {creating ? 'Creando...' : 'Crear evento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
