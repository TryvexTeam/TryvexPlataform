'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { toast } from '@/lib/toast'
import type { Evento, EventoInsert } from '@/lib/types/evento'
import { TIPOS_EVENTO } from '@/lib/types/evento'
import type { DisponibilidadIntegrante } from '@/lib/types/disponibilidad'
import { DIAS_SEMANA } from '@/lib/types/disponibilidad'
import { getInitials, hashColorHex, MEMBER_PALETTE } from '@/lib/utils/lead-utils'
import { SelectorHora } from '@/components/ui/selector-hora'

// ─── Constants ────────────────────────────────────────────────────────
const HORA_MIN = 10
// 26 = 2:00 del día siguiente; filas 24-25 representan 0:00-1:00 de la madrugada
const HORA_MAX = 26
const HORAS = Array.from({ length: HORA_MAX - HORA_MIN }, (_, i) => i + HORA_MIN)
const ROW_H = 48
// Horas reales menores a este umbral (0-1 am) pertenecen al día extendido anterior
const UMBRAL_MADRUGADA = HORA_MAX - 24

/* ── Ancho de las columnas ─────────────────────────────────────────────────
   Antes: `minWidth: 860px` fijo, y el cuerpo envuelto en su PROPIO contenedor
   con `overflowX: hidden` dentro del contenedor que hacía el scroll.

   Un hijo `block` toma el ancho del padding box de su contenedor, no del
   scrollWidth. Así que la cabecera se estiraba a 860px (su `minWidth`) pero
   el envoltorio del cuerpo se quedaba en el ancho visible — 250px medidos a
   320px de pantalla — y su `overflowX: hidden` recortaba ahí el grid de 860.
   Ambos se desplazaban a la par, pero el cuerpo se **acababa** a los 250px:
   al deslizar más allá aparecían los días en la cabecera y debajo, nada.
   Ese era el "margen del calendario vacío".

   Ahora hay UN solo contenedor de scroll para ambos, y el ancho de columna
   sale de la medición: entran 1-7 días completos, nunca uno partido, y el
   resto se alcanza deslizando con encaje por día. La gutter de horas queda
   congelada a la izquierda y la cabecera arriba (tabla 2D con sticky). */
const GUTTER_W = 48
const COL_MIN_W = 90

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

/** Una tecla del aviso de atajos, como una keycap chica. */
function Tecla({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: '16px',
        height: '16px',
        padding: '0 4px',
        borderRadius: '4px',
        border: '1px solid rgba(255,255,255,0.14)',
        background: 'rgba(255,255,255,0.05)',
        fontFamily: 'inherit',
        fontSize: '10px',
        fontWeight: 600,
        lineHeight: 1,
        color: 'var(--tx-ink-secondary)',
      }}
    >
      {children}
    </kbd>
  )
}

/** Hora efectiva en el día extendido: 0:00-1:59 cuentan como 24-25.x del día anterior */
function horaExtendida(d: Date): number {
  const h = d.getHours()
  return h < UMBRAL_MADRUGADA ? h + 24 : h
}

/** Día calendario al que pertenece una fecha dentro del día extendido (madrugada → día anterior) */
function diaExtendido(d: Date): Date {
  return d.getHours() < UMBRAL_MADRUGADA ? addDays(d, -1) : d
}

/** Clave de celda de dispo para una fila del grid (filas 24-25 → día siguiente, hora real) */
function celdaKey(dayIdx: number, h: number): string {
  return h >= 24 ? `${(dayIdx + 1) % 7}-${h - 24}` : `${dayIdx}-${h}`
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
      const startMin = (horaExtendida(s) - HORA_MIN) * 60 + s.getMinutes()
      const endMin = (horaExtendida(e) - HORA_MIN) * 60 + e.getMinutes()
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
  const [modalExternos, setModalExternos] = useState('')
  const [creating, setCreating] = useState(false)

  // Detail popover
  const [detailEvento, setDetailEvento] = useState<Evento | null>(null)
  const [detailPos, setDetailPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [asignando, setAsignando] = useState(false)

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

  // Grid scroll container ref (auto-scroll vertical + desplazamiento horizontal)
  const gridScrollRef = useRef<HTMLDivElement>(null)
  // Primera celda del cuerpo: marca dónde termina la cabecera dentro del scroll
  const hourGutterRef = useRef<HTMLDivElement>(null)

  // Ancho medido del calendario → cuántos días caben y cuánto mide cada uno
  const [gridWidth, setGridWidth] = useState(0)
  useEffect(() => {
    const el = gridScrollRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setGridWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const diasVisibles = gridWidth <= 0
    ? 7
    : Math.min(Math.max(Math.floor((gridWidth - GUTTER_W) / COL_MIN_W), 1), 7)
  const semanaCompleta = diasVisibles >= 7
  // Sin medir todavía: columnas fluidas, igual que el render del servidor
  const colWidth = gridWidth <= 0 ? null : (gridWidth - GUTTER_W) / diasVisibles
  const gridCols = `${GUTTER_W}px repeat(7, ${colWidth === null ? 'minmax(0, 1fr)' : `${colWidth}px`})`
  const snapAlign = semanaCompleta ? undefined : 'start'

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

  // ─── Tareas de la semana (chips por día, color del responsable) ────
  type TareaSemana = {
    id: string
    titulo: string
    estado: string
    prioridad: string
    fecha_limite: string
    /** 'HH:MM:SS' de Santiago; null = vence ese día sin hora fija. */
    hora_limite: string | null
    responsables: { integrante_id: string; nombre: string; color: string | null }[]
  }
  const [tareasSemana, setTareasSemana] = useState<TareaSemana[]>([])
  useEffect(() => {
    const desde = toLocalISO(weekStart).slice(0, 10)
    const hasta = toLocalISO(addDays(weekStart, 7)).slice(0, 10)
    fetch(`/api/tareas?desde=${desde}&hasta=${hasta}`)
      .then((r) => r.json())
      .then((json: { success: boolean; data: TareaSemana[] }) => {
        if (json.success) setTareasSemana(json.data)
      })
      .catch(() => {})
  }, [weekStart])

  /**
   * Tareas de un día SIN hora fija: las que se muestran como chip bajo la
   * cabecera, porque no hay franja donde ponerlas.
   */
  const tareasDeDia = useCallback((d: Date): TareaSemana[] => {
    const iso = toLocalISO(d).slice(0, 10)
    return tareasSemana.filter((t) => t.fecha_limite === iso && !t.hora_limite)
  }, [tareasSemana])

  /**
   * Tareas de un día CON hora, ya colocadas en la rejilla.
   *
   * Devuelve el desplazamiento vertical en píxeles, calculado igual que los
   * eventos, para que una tarea de las 15:30 caiga exactamente donde caería una
   * reunión a esa hora — si no, la rejilla mentiría sobre una de las dos.
   *
   * Las que caen fuera del rango visible de la rejilla se descartan: pintarlas
   * pegadas al borde daría una hora falsa.
   */
  const tareasConHoraDeDia = useCallback(
    (d: Date): { tarea: TareaSemana; top: number; etiqueta: string }[] => {
      const iso = toLocalISO(d).slice(0, 10)
      return tareasSemana
        .filter((t) => t.fecha_limite === iso && t.hora_limite)
        .map((t) => {
          const [hh = '0', mm = '0'] = (t.hora_limite ?? '').split(':')
          const hora = Number(hh)
          const minuto = Number(mm)
          // Igual que los eventos: la madrugada pertenece al día extendido
          // anterior, así que 0:30 se dibuja como 24:30.
          const horaExt = hora < UMBRAL_MADRUGADA ? hora + 24 : hora
          return {
            tarea: t,
            top: ((horaExt - HORA_MIN) * 60 + minuto) / 60 * ROW_H,
            etiqueta: `${fmt2(hora)}:${fmt2(minuto)}`,
            dentro: horaExt >= HORA_MIN && horaExt < HORA_MAX,
          }
        })
        .filter((x) => x.dentro)
        .map(({ tarea, top, etiqueta }) => ({ tarea, top, etiqueta }))
    },
    [tareasSemana],
  )

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
    const nowH = horaExtendida(now)
    const nowM = now.getMinutes()
    if (nowH >= HORA_MIN && nowH < HORA_MAX) {
      // El contenedor ahora también contiene la fila de cabecera, así que la
      // posición de la línea se mide desde donde empieza el cuerpo.
      const gutter = hourGutterRef.current
      const bodyTop = gutter
        ? gutter.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop
        : 0
      const nowTop = ((nowH - HORA_MIN) * 60 + nowM) / 60 * ROW_H
      const target = Math.max(0, bodyTop + nowTop - el.clientHeight / 3)
      el.scrollTop = target
    }
    // Only run on mount / week change, not on every `now` tick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, isCurrentWeek, colWidth])

  // ─── En pantallas donde no cabe la semana, abrir en el día de hoy ──
  const yaCentradoH = useRef(false)
  useEffect(() => {
    const el = gridScrollRef.current
    if (!el || colWidth === null || semanaCompleta || yaCentradoH.current) return
    yaCentradoH.current = true
    if (!isCurrentWeek) return
    const idxHoy = days.findIndex((d) => isSameDay(d, diaExtendido(now)))
    if (idxHoy < 0) return
    const destino = (idxHoy - Math.floor(diasVisibles / 2)) * colWidth
    el.scrollLeft = Math.min(Math.max(destino, 0), el.scrollWidth - el.clientWidth)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colWidth, semanaCompleta])

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

  // El integrante del usuario actual (para el botón Asignarme/Quitarme)
  const miIntegrante = disp?.find((m) => m.es_propio) ?? null
  const miIntegranteId = miIntegrante?.integrante_id ?? null

  // Color por integrante: el elegido en su perfil; paleta por índice como fallback
  const memberColorMap = useMemo(() => {
    const map = new Map<string, string>()
    if (disp) {
      disp.forEach((m, i) => {
        map.set(m.integrante_id, m.color ?? MEMBER_PALETTE[i % MEMBER_PALETTE.length])
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

  // ─── Events per day (madrugada 0-1 am cuenta como el día anterior) ─
  const eventsByDay: Evento[][] = days.map((d) =>
    eventos.filter((ev) => isSameDay(diaExtendido(new Date(ev.inicio)), d))
  )

  // ─── Best windows ───────────────────────────────────────────────
  const bestWindows: { dayIdx: number; hora: number }[] = []
  if (disp && totalMembers > 0) {
    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
      for (const hora of HORAS) {
        const k = celdaKey(dayIdx, hora)
        if ((dispCountMap.get(k) ?? 0) === totalMembers) {
          // check no event overlaps this slot
          const slotStart = new Date(days[dayIdx])
          if (hora >= 24) slotStart.setDate(slotStart.getDate() + 1)
          slotStart.setHours(hora % 24, 0, 0, 0)
          const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000)
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
        startLabel: `${fmt2(sHr % 24)}:${fmt2(sMin)}`,
        endLabel: `${fmt2(eHr % 24)}:${fmt2(eMin)}`,
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
    setModalInicio(`${fmt2(sH % 24)}:${fmt2(sM)}`)
    setModalFin(`${fmt2(eH % 24)}:${fmt2(eM)}`)
    const ownId = disp?.find((m) => m.es_propio)?.integrante_id
    setModalAsistentes(ownId ? new Set([ownId]) : new Set())
    setModalExternos('')
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
    // Horas de madrugada (0:00-1:59, o 2:00 exacto como fin) pertenecen al día siguiente
    if (ini[0] < UMBRAL_MADRUGADA) inicio.setDate(inicio.getDate() + 1)
    const fin = new Date(day)
    fin.setHours(end[0], end[1], 0, 0)
    if (end[0] < UMBRAL_MADRUGADA || (end[0] === UMBRAL_MADRUGADA && end[1] === 0)) {
      fin.setDate(fin.getDate() + 1)
    }
    if (fin <= inicio) { toast.error('El fin debe ser posterior al inicio'); return }
    const externos = modalExternos
      .split(/[,;\s]+/)
      .map((e) => e.trim())
      .filter(Boolean)
    const emailInvalido = externos.find((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
    if (emailInvalido) { toast.error(`Email inválido: ${emailInvalido}`); return }
    const body: EventoInsert = {
      titulo: modalTitulo.trim(),
      tipo: modalTipo,
      inicio: inicio.toISOString(),
      fin: fin.toISOString(),
      asistentes_ids: Array.from(modalAsistentes),
      invitados_externos: externos,
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

  // ─── Auto-asignación a una cita (PRP-008 F4) ──────────────────────
  const handleToggleAsignacion = async () => {
    if (!detailEvento || !miIntegranteId || asignando) return
    const estaba = detailEvento.asistentes.some((a) => a.integrante_id === miIntegranteId)
    setAsignando(true)
    try {
      const res = await fetch(`/api/eventos/${detailEvento.id}/asignaciones`, {
        method: estaba ? 'DELETE' : 'POST',
      })
      const j = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) throw new Error(j.error ?? 'Error al actualizar asistencia')
      toast.success(estaba ? 'Te quitaste del evento' : 'Te asignaste al evento')
      // Refresco local del popover + recarga de la semana (mismo mecanismo que crear/borrar)
      setDetailEvento((prev) => {
        if (!prev) return prev
        if (estaba) {
          return { ...prev, asistentes: prev.asistentes.filter((a) => a.integrante_id !== miIntegranteId) }
        }
        return {
          ...prev,
          asistentes: [...prev.asistentes, { integrante_id: miIntegranteId, nombre: miIntegrante?.nombre ?? 'Tú' }],
        }
      })
      fetchEventos()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al actualizar asistencia')
    } finally {
      setAsignando(false)
    }
  }

  // ─── Compute now-line position (used in gutter + columns) ─────────
  const nowH = horaExtendida(now)
  const nowM = now.getMinutes()
  const nowInRange = nowH >= HORA_MIN && nowH < HORA_MAX
  const nowTop = nowInRange ? ((nowH - HORA_MIN) * 60 + nowM) / 60 * ROW_H : null
  const nowTimeLabel = `${fmt2(nowH % 24)}:${fmt2(nowM)}`

  // Which gutter hour does the now-line collide with?
  // The gutter label sits centered at (hora - HORA_MIN) * ROW_H, so we check proximity
  const nowCollidesHour = nowInRange ? nowH : -1

  // ─── Styles ──────────────────────────────────────────────────────
  /**
   * Botón circular de 40 px, el mismo de la cabecera del Panel de Mando. Antes
   * eran rectángulos de 8 px de radio con flechas tipográficas (← →): el
   * cursor tenía que acertarle a un blanco de 26 px de alto, por debajo del
   * mínimo táctil.
   */
  const navBtn: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    borderRadius: '999px',
    background: 'transparent',
    color: 'var(--tx-ink-secondary)',
    cursor: 'pointer',
    transition: 'background 0.15s, color 0.15s',
  }

  /**
   * Las dos flechas viven dentro de un mismo control en vez de ser dos botones
   * sueltos: son la misma acción en dos sentidos, y agrupadas se leen como un
   * mando de semana y no como dos iconos que casualmente están al lado.
   */
  const grupoNav: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '2px',
    padding: '3px',
    border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: '999px',
  }

  /** Chip de la barra: misma píldora que los filtros del panel. */
  const chip: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '7px',
    border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: '999px',
    background: 'transparent',
    color: 'var(--tx-ink-secondary)',
    cursor: 'pointer',
    fontWeight: 500,
    transition: 'background 0.15s, color 0.15s',
    userSelect: 'none',
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
        {/* El rango de la semana manda: es lo que uno lee para orientarse, así
            que va primero y con el peso del título, no detrás de los botones.
            La etiqueta de arriba da el contexto que antes ponía el h1 de la
            página, sin robarle el protagonismo al dato que cambia. */}
        <div style={{ marginRight: '6px' }}>
          <p
            style={{
              margin: 0,
              fontSize: '11px',
              fontWeight: 500,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--tx-ink-muted)',
            }}
          >
            Calendario del equipo
          </p>
          <p
            style={{
              margin: '6px 0 0',
              fontSize: '28px',
              fontWeight: 600,
              letterSpacing: '-0.03em',
              lineHeight: 1,
              color: 'var(--tx-ink-primary)',
            }}
          >
            {rangeLabel(weekStart)}
          </p>
        </div>

        {/* "Hoy" y las flechas van en un mismo contenedor, no como dos ítems
            sueltos del flex de arriba: con flex-wrap, dos ítems separados
            pueden partirse en líneas distintas cada uno (en el teléfono
            "Hoy" quedaba solo en su línea y las flechas se iban arriba,
            pegadas a la fecha). Agrupados, saltan de línea juntos o no
            saltan, nunca separados. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* "Hoy" no se deshabilita cuando ya estás en la semana actual: se
            marca como activo. Un botón apagado obliga a mirarlo para deducir
            en qué semana estás; uno encendido lo dice de frente. */}
        <button
          type="button"
          className="h-10 px-4 text-[13px] md:h-11 md:px-5 md:text-sm"
          style={{
            ...chip,
            ...(todayBtnDisabled
              ? { background: '#ffffff', borderColor: '#ffffff', color: 'var(--tx-bg-primary)', cursor: 'default' }
              : {}),
          }}
          onClick={goToday}
          aria-current={todayBtnDisabled ? 'date' : undefined}
          onMouseEnter={(e) => {
            if (!todayBtnDisabled) e.currentTarget.style.color = 'var(--tx-ink-primary)'
          }}
          onMouseLeave={(e) => {
            if (!todayBtnDisabled) e.currentTarget.style.color = 'var(--tx-ink-secondary)'
          }}
        >
          Hoy
        </button>

        <div style={grupoNav}>
          <button
            type="button"
            className="w-[38px] h-[38px] md:w-10 md:h-10"
            style={navBtn}
            onClick={prevWeek}
            aria-label="Semana anterior"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.07)'
              e.currentTarget.style.color = 'var(--tx-ink-primary)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--tx-ink-secondary)'
            }}
          >
            <ChevronLeftIcon size={17} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="w-[38px] h-[38px] md:w-10 md:h-10"
            style={navBtn}
            onClick={nextWeek}
            aria-label="Semana siguiente"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.07)'
              e.currentTarget.style.color = 'var(--tx-ink-primary)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--tx-ink-secondary)'
            }}
          >
            <ChevronRightIcon size={17} aria-hidden="true" />
          </button>
        </div>
        </div>

        {/* Aviso de atajos de teclado (solo desktop). Cada tecla en su propia
            "cápsula" — igual que un atajo de menú — separada de la frase que
            explica qué hace, en vez de flechas tipográficas sueltas en el texto. */}
        <span
          style={{
            // El `display` NO va acá: el className ya trae `hidden md:inline-flex`,
            // y un `display` inline pisa siempre a la clase — por eso se veía en
            // el teléfono a pesar de `hidden` (el inline style ganaba siempre).
            alignItems: 'center',
            gap: '5px',
            fontSize: '11px',
            color: 'var(--tx-ink-muted)',
            marginLeft: '4px',
            whiteSpace: 'nowrap',
          }}
          className="hidden md:inline-flex"
        >
          <Tecla>←</Tecla>
          <Tecla>→</Tecla>
          cambia de semana
          <span style={{ opacity: 0.4 }}>·</span>
          <Tecla>T</Tecla>
          hoy
        </span>

        {/* Un chip que se enciende, no un interruptor con etiqueta al lado.
            El interruptor pedía leer dos cosas (el estado del switch y su
            texto) para saber si la disponibilidad estaba visible; el chip
            encendido lo dice de una sola mirada, igual que los filtros del
            panel. */}
        <button
          type="button"
          role="switch"
          aria-checked={showDisp}
          className="h-10 px-4 text-[13px] md:h-11 md:px-5 md:text-sm"
          onClick={() => setShowDisp((v) => !v)}
          style={{
            ...chip,
            marginLeft: 'auto',
            ...(showDisp
              ? { background: '#ffffff', borderColor: '#ffffff', color: 'var(--tx-bg-primary)' }
              : {}),
          }}
          onMouseEnter={(e) => {
            if (!showDisp) e.currentTarget.style.color = 'var(--tx-ink-primary)'
          }}
          onMouseLeave={(e) => {
            if (!showDisp) e.currentTarget.style.color = 'var(--tx-ink-secondary)'
          }}
        >
          Disponibilidad
        </button>
      </div>

      {/* ── Leyenda de disponibilidad por integrante ───────────── */}
      {showDisp && disp && disp.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '18px',
            flexWrap: 'wrap',
            fontSize: '12px',
            fontWeight: 500,
            color: 'var(--tx-ink-secondary)',
          }}
        >
          {/* Cada persona es un punto de su color con el nombre al lado, sin
              píldora alrededor. Con cinco integrantes las píldoras de colores
              formaban una fila de semáforos que competía con el propio
              calendario: el color ya lo lleva la banda dentro de la rejilla, y
              aquí solo hace falta la clave para leerlo. */}
          {disp.map((m) => {
            const c = memberColor(m.integrante_id, m.nombre)
            return (
              <span
                key={m.integrante_id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '7px',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: m.es_propio ? 'var(--tx-ink-primary)' : 'var(--tx-ink-secondary)',
                }}
              >
                <span
                  style={{
                    width: '9px',
                    height: '9px',
                    borderRadius: '50%',
                    background: c,
                    flexShrink: 0,
                  }}
                />
                {m.nombre.split(' ')[0]}
                {m.es_propio && (
                  <span style={{ color: 'var(--tx-ink-muted)', fontSize: '11px' }}>tú</span>
                )}
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

      {/* ── Grid ──────────────────────────────────────────────────
          Cabecera y cuerpo son celdas del MISMO grid dentro de UN solo
          contenedor de scroll (ver la nota sobre GUTTER_W arriba). */}
      <div
        ref={gridScrollRef}
        style={{
          // Sin tope de alto: el calendario crece completo, como "Mi
          // disponibilidad", y es la página la que scrollea para verlo
          // entero. `overflow: auto` queda solo por el scroll HORIZONTAL de
          // días en móvil (scroll-snap de abajo).
          overflow: 'auto',
          overscrollBehaviorX: 'contain',
          scrollSnapType: semanaCompleta ? undefined : 'x mandatory',
          // el encaje se mide desde el borde de los días, no del calendario
          scrollPaddingLeft: `${GUTTER_W}px`,
          borderRadius: '12px',
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(255,255,255,0.02)',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: gridCols,
            width: colWidth === null ? '100%' : 'max-content',
            userSelect: 'none',
          }}
        >
          {/* Gutter header with timezone — esquina: fija a la izquierda (para
              deslizar días en móvil). Sin `top: 0`: el scroll vertical es el
              de la página, no el de este contenedor. */}
          <div
            style={{
              position: 'sticky',
              left: 0,
              zIndex: 30,
              background: 'rgba(10,10,12,0.92)',
              backdropFilter: 'blur(8px)',
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
                  zIndex: 20,
                  background: 'rgba(10,10,12,0.92)',
                  backdropFilter: 'blur(8px)',
                  scrollSnapAlign: snapAlign,
                  fontSize: '11px',
                  fontWeight: 500,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--tx-ink-muted)',
                  textAlign: 'center',
                  padding: '12px 4px 10px',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  borderLeft: '1px solid rgba(255,255,255,0.04)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '6px',
                  opacity: isPast && !isToday ? 0.5 : 1,
                }}
              >
                <span>{DIAS_SEMANA[i]}</span>
                {/* El número del día en un disco relleno cuando es hoy. El
                    peso baja de 800 a 600: con el disco de acento detrás, la
                    negrita extra solo emborronaba la cifra. */}
                <span
                  style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '15px',
                    fontWeight: 600,
                    letterSpacing: '-0.02em',
                    textTransform: 'none',
                    background: isToday ? 'var(--tx-accent-surface)' : 'transparent',
                    color: isToday
                      ? '#ffffff'
                      : isWeekend
                        ? 'var(--tx-ink-muted)'
                        : 'var(--tx-ink-primary)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {d.getDate()}
                </span>
                {/* Tareas que vencen este día — color del responsable */}
                {tareasDeDia(d).slice(0, 3).map((t) => {
                  const c = t.responsables[0]?.color
                    ?? memberColor(t.responsables[0]?.integrante_id ?? '', t.responsables[0]?.nombre ?? t.titulo)
                  return (
                    <span
                      key={t.id}
                      title={`Tarea: ${t.titulo} · ${t.responsables.map((r) => r.nombre).join(', ') || 'sin responsable'}`}
                      style={{
                        maxWidth: '92%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: '9.5px',
                        fontWeight: 700,
                        padding: '1px 7px',
                        borderRadius: '100px',
                        background: `${c}26`,
                        border: `1px solid ${c}55`,
                        color: c,
                      }}
                    >
                      ✓ {t.titulo}
                    </span>
                  )
                })}
                {tareasDeDia(d).length > 3 && (
                  <span style={{ fontSize: '9px', color: 'var(--tx-ink-muted)' }}>
                    +{tareasDeDia(d).length - 3} tareas
                  </span>
                )}
              </div>
            )
          })}
            {/* Hour gutter — congelada a la izquierda: al deslizar, ninguna
                columna queda sin su referencia horaria. */}
            <div
              ref={hourGutterRef}
              style={{
                position: 'sticky',
                left: 0,
                zIndex: 18,
                background: 'rgba(10,10,12,0.92)',
                backdropFilter: 'blur(8px)',
              }}
            >
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
                      fontSize: '10.5px',
                      fontWeight: 500,
                      color: 'var(--tx-ink-muted)',
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                      boxSizing: 'border-box',
                      position: 'relative',
                      // Centrado sobre la línea divisoria — salvo la primera
                      // hora: sin fila anterior de la que "robar" esos 6px,
                      // se metía debajo de la cabecera y quedaba cortada.
                      top: h === HORA_MIN ? '0px' : '-6px',
                      /* `tabular-nums` basta para que las horas queden en
                         columna; el monospace además cambiaba de familia
                         tipográfica a media pantalla, y la regleta es
                         referencia, no protagonista. */
                      fontVariantNumeric: 'tabular-nums',
                      visibility: isColliding ? 'hidden' : 'visible',
                    }}
                  >
                    {h % 24}:00
                  </div>
                )
              })}
              {/* Now-line tick in gutter */}
              {nowTop !== null && isCurrentWeek && (
                <div
                  style={{
                    position: 'absolute',
                    top: `${nowTop - 8}px`,
                    right: '4px',
                    fontSize: '10px',
                    fontWeight: 600,
                    color: '#ffffff',
                    fontVariantNumeric: 'tabular-nums',
                    lineHeight: '16px',
                    zIndex: 16,
                    /* Píldora rellena en vez de texto suelto sobre el fondo:
                       la hora actual pisa las etiquetas de la regleta, y sin
                       un fondo propio se leían las dos superpuestas. */
                    background: 'var(--tx-accent-surface)',
                    padding: '0 5px',
                    borderRadius: '999px',
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

              // Now line position (en madrugada la línea vive en la columna del día anterior)
              let dayNowTop: number | null = null
              if (nowTop !== null && isSameDay(d, diaExtendido(now))) {
                dayNowTop = nowTop
              }

              // Column dimming for past days
              const colOpacity = isPast && !isToday ? 0.55 : 1

              return (
                <div
                  key={`dc-${dayIdx}`}
                  style={{
                    position: 'relative',
                    scrollSnapAlign: snapAlign,
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
                      const k = celdaKey(dayIdx, h)
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
                            gap: '2px',
                            padding: '2px 0 2px 2px',
                            boxSizing: 'border-box',
                            background: allIn ? 'var(--tx-accent-subtle)' : 'transparent',
                            boxShadow: allIn
                              ? 'inset 0 0 0 1px color-mix(in srgb, var(--tx-accent) 35%, transparent)'
                              : 'none',
                            pointerEvents: 'none',
                            zIndex: 1,
                          }}
                        >
                          {/* Líneas GCal en el margen izquierdo: una por integrante disponible */}
                          {members.map((m) => {
                            const c = memberColor(m.id, m.nombre)
                            return (
                              <div
                                key={m.id}
                                style={{
                                  width: '4px',
                                  borderRadius: '2px',
                                  background: c,
                                  boxShadow: `0 0 6px color-mix(in srgb, ${c} 45%, transparent)`,
                                  flexShrink: 0,
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

                  {/* Event blocks — un ícono de tamaño fijo, no una caja que
                      estira con la duración: un evento de 20 min y uno de 2
                      horas se veían igual de "grandes" antes, y el título +
                      hora apretados en 20 min quedaban cortados y chocaban con
                      el bloque de al lado. El nombre y el horario completo
                      viven en el tooltip nativo (mouse encima) y en el
                      popover de detalle (clic) — no en el ícono. */}
                  {laid.map((item) => {
                    const color = tipoColor(item.ev.tipo)
                    // Reserva a la izquierda para las líneas de disponibilidad
                    // (una por integrante libre esa hora): antes el ícono las
                    // tapaba de lleno. Solo aplica cuando el evento ocupa toda
                    // la columna del día — con dos eventos simultáneos ya se
                    // reparten el ancho y no llegan a pisar el margen.
                    const reservaDisp = item.totalCols === 1 ? 34 : 0
                    const width =
                      item.totalCols === 1
                        ? `calc(100% - ${reservaDisp + 4}px)`
                        : `calc(${100 / item.totalCols}% - 4px)`
                    const left =
                      item.totalCols === 1
                        ? `${reservaDisp}px`
                        : `calc(${(item.col / item.totalCols) * 100}% + 2px)`
                    const etiquetaTipo = TIPOS_EVENTO.find((t) => t.id === item.ev.tipo)?.label ?? ''
                    return (
                      <div
                        key={item.ev.id}
                        data-event-block="true"
                        title={`${item.ev.titulo} · ${etiquetaTipo} · ${hhmm(new Date(item.ev.inicio))}–${hhmm(new Date(item.ev.fin))}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          setDetailEvento(item.ev)
                          setDetailPos({ x: e.clientX, y: e.clientY })
                        }}
                        style={{
                          position: 'absolute',
                          top: `${item.top + 2}px`,
                          left,
                          width,
                          height: '20px',
                          background: `color-mix(in srgb, ${color} 26%, transparent)`,
                          boxShadow: `inset 0 0 0 1px ${color}`,
                          borderRadius: '6px',
                          padding: '0 6px',
                          overflow: 'hidden',
                          cursor: 'pointer',
                          zIndex: 5,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          transition: 'background 140ms, box-shadow 140ms',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = `color-mix(in srgb, ${color} 40%, transparent)`
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = `color-mix(in srgb, ${color} 26%, transparent)`
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: color,
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            fontSize: '10.5px',
                            fontWeight: 600,
                            color: 'var(--tx-ink-primary)',
                            lineHeight: 1,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {item.ev.titulo}
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

                  {/* Tareas con hora: una marca fina en su franja, no un
                      bloque como los eventos. Una tarea vence a una hora, no
                      ocupa un rato — dibujarla con altura mentiría sobre
                      cuánto dura, y además taparía la reunión que sí ocupa esa
                      franja. Por eso va pegada a la izquierda y estrecha. */}
                  {tareasConHoraDeDia(d).map(({ tarea, top, etiqueta }) => {
                    const c = tarea.responsables[0]?.color
                      ?? memberColor(
                        tarea.responsables[0]?.integrante_id ?? '',
                        tarea.responsables[0]?.nombre ?? tarea.titulo,
                      )
                    return (
                      <div
                        key={`tk-${tarea.id}`}
                        title={`${etiqueta} · ${tarea.titulo}`}
                        style={{
                          position: 'absolute',
                          top: `${top - 7}px`,
                          // Mismo margen que los eventos: sin esto, la marca
                          // de tarea pisaba las líneas de disponibilidad.
                          left: '34px',
                          maxWidth: 'calc(100% - 38px)',
                          height: '15px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '0 6px 0 4px',
                          borderRadius: '999px',
                          background: `color-mix(in srgb, ${c} 26%, #15141a)`,
                          boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${c} 55%, transparent)`,
                          fontSize: '9.5px',
                          fontWeight: 500,
                          // Antes: color-mix(c, blanco) — con un color de
                          // responsable claro quedaba casi invisible.
                          color: 'var(--tx-ink-primary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          /* Sobre los eventos: si una tarea cae dentro de una
                             reunión, esconderla detrás la haría invisible justo
                             el día que importa. */
                          zIndex: 8,
                          pointerEvents: 'none',
                        }}
                      >
                        <span
                          style={{
                            width: '4px',
                            height: '4px',
                            borderRadius: '50%',
                            background: c,
                            flexShrink: 0,
                          }}
                        />
                        {tarea.titulo}
                      </div>
                    )
                  })}

                  {/* Now line */}
                  {/* Línea de "ahora": 1 px y no 2. Marca un instante, y una
                      banda de 2 px cubre casi tres minutos de la rejilla —
                      además de tapar el borde superior del evento en curso. */}
                  {dayNowTop !== null && (
                    <div
                      style={{
                        position: 'absolute',
                        top: `${dayNowTop}px`,
                        left: 0,
                        right: 0,
                        height: '1px',
                        background: 'var(--tx-accent)',
                        zIndex: 15,
                        pointerEvents: 'none',
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          left: '-3px',
                          top: '-3px',
                          width: '7px',
                          height: '7px',
                          borderRadius: '50%',
                          background: 'var(--tx-accent)',
                          boxShadow: '0 0 0 3px color-mix(in srgb, var(--tx-accent) 22%, transparent)',
                        }}
                      />
                    </div>
                  )}
                </div>
              )
            })}
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
            {miIntegranteId && (
              <button
                type="button"
                onClick={handleToggleAsignacion}
                disabled={asignando}
                style={{
                  marginTop: '6px',
                  minHeight: '44px',
                  background: detailEvento.asistentes.some((a) => a.integrante_id === miIntegranteId)
                    ? 'var(--tx-accent-subtle)'
                    : 'var(--tx-accent)',
                  color: detailEvento.asistentes.some((a) => a.integrante_id === miIntegranteId)
                    ? 'var(--tx-accent)'
                    : 'var(--tx-accent-fg)',
                  border: '1px solid var(--tx-accent)',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: asignando ? 'wait' : 'pointer',
                  opacity: asignando ? 0.6 : 1,
                  transition: 'opacity 0.15s',
                }}
              >
                {asignando
                  ? 'Guardando…'
                  : detailEvento.asistentes.some((a) => a.integrante_id === miIntegranteId)
                    ? 'Quitarme'
                    : 'Asignarme'}
              </button>
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
              <SelectorHora value={modalInicio} onChange={(v) => setModalInicio(v)} />
              <span style={{ color: 'var(--tx-ink-muted)', fontSize: '13px' }}>–</span>
              <SelectorHora value={modalFin} onChange={(v) => setModalFin(v)} />
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
                          background: selected ? `${color}3a` : 'transparent',
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

            {/* Invitados externos (reciben Meet + email de confirmación Tryvex) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--tx-ink-muted)' }}>
                Invitados externos (emails, separados por coma)
              </span>
              <input
                placeholder="cliente@correo.com, otro@correo.com"
                value={modalExternos}
                onChange={(e) => setModalExternos(e.target.value)}
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
            </div>

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
