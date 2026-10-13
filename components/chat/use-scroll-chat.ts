'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { etiquetaFecha } from '@/lib/chat/fechas'

const CERCA_DEL_FONDO_PX = 80
const OCULTAR_FECHA_MS = 1500

interface Opciones {
  cantidad: number
  ultimoEsMio: boolean
  cargando: boolean
  /** Índice del primer no leído al abrir; -1 si no hay. */
  primerNoLeido: number
}

/**
 * Scroll de la conversación: anclada al fondo si ya estaba al fondo (también cuando
 * el teclado cambia el alto), píldora de fecha flotante, botón "bajar" con contador
 * y salto a un mensaje con resaltado.
 */
export function useScrollChat({ cantidad, ultimoEsMio, cargando, primerNoLeido }: Opciones) {
  const contenedor = useRef<HTMLDivElement>(null)
  const alFondoRef = useRef(true)
  const previa = useRef(0)
  const inicial = useRef(true)
  const timerFecha = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [lejosDelFondo, setLejosDelFondo] = useState(false)
  const [pendientes, setPendientes] = useState(0)
  const [fechaFlotante, setFechaFlotante] = useState<string | null>(null)

  const bajar = useCallback((suave = true) => {
    const el = contenedor.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: suave ? 'smooth' : 'auto' })
    setPendientes(0)
  }, [])

  const actualizarFecha = useCallback(() => {
    const el = contenedor.current
    if (!el) return
    const tope = el.getBoundingClientRect().top + 8
    const visible = Array.from(el.querySelectorAll<HTMLElement>('[data-msg-fecha]')).find(
      (nodo) => nodo.getBoundingClientRect().bottom > tope,
    )
    const fecha = visible?.dataset.msgFecha
    if (fecha) setFechaFlotante(etiquetaFecha(fecha))
    if (timerFecha.current) clearTimeout(timerFecha.current)
    timerFecha.current = setTimeout(() => setFechaFlotante(null), OCULTAR_FECHA_MS)
  }, [])

  const alScroll = useCallback(() => {
    const el = contenedor.current
    if (!el) return
    const cerca = el.scrollHeight - el.scrollTop - el.clientHeight < CERCA_DEL_FONDO_PX
    alFondoRef.current = cerca
    setLejosDelFondo(!cerca)
    if (cerca) setPendientes(0)
    actualizarFecha()
  }, [actualizarFecha])

  // Mensajes nuevos: seguir el fondo, o contar los que llegaron fuera de vista.
  useEffect(() => {
    if (cargando || cantidad === 0) return
    if (inicial.current) {
      inicial.current = false
      previa.current = cantidad
      const separador = contenedor.current?.querySelector('[data-unread-separator]')
      if (primerNoLeido >= 0 && separador) separador.scrollIntoView({ block: 'center' })
      else bajar(false)
      return
    }
    const nuevos = cantidad - previa.current
    previa.current = cantidad
    if (nuevos <= 0) return
    if (alFondoRef.current || ultimoEsMio) bajar(true)
    else setPendientes((n) => n + nuevos)
  }, [cantidad, cargando, ultimoEsMio, primerNoLeido, bajar])

  // El teclado o la rotación cambian el alto: si estaba al fondo, se queda al fondo.
  useEffect(() => {
    const el = contenedor.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observador = new ResizeObserver(() => {
      if (alFondoRef.current) el.scrollTop = el.scrollHeight
    })
    observador.observe(el)
    return () => observador.disconnect()
  }, [])

  useEffect(() => () => {
    if (timerFecha.current) clearTimeout(timerFecha.current)
  }, [])

  const irAMensaje = useCallback((id: string) => {
    const nodo = contenedor.current?.querySelector<HTMLElement>(`[data-msg-id="${CSS.escape(id)}"]`)
    if (!nodo) return
    nodo.scrollIntoView({ block: 'center', behavior: 'smooth' })
    nodo.classList.remove('chat-resaltado')
    void nodo.offsetWidth
    nodo.classList.add('chat-resaltado')
    setTimeout(() => nodo.classList.remove('chat-resaltado'), 1000)
  }, [])

  return { contenedor, alScroll, bajar, irAMensaje, lejosDelFondo, pendientes, fechaFlotante }
}
