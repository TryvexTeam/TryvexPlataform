'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Check, ListTodo, MessageCircle, Settings, X } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import type { RecienLlegado, ResultadoSaludo } from '@/lib/types/bienvenida'

type Props = { integrantes: RecienLlegado[]; miIntegranteId: string }

export function TarjetaBienvenida({ integrantes, miIntegranteId }: Props) {
  const router = useRouter()
  const [cerrada, setCerrada] = useState(true)
  const [enviando, setEnviando] = useState<string | null>(null)
  const [saludados, setSaludados] = useState(() => new Set(
    integrantes.filter((persona) => persona.saludos.some((saludo) => saludo.id === miIntegranteId)).map((persona) => persona.id),
  ))

  useEffect(() => {
    queueMicrotask(() => {
      try { setCerrada(sessionStorage.getItem('tryvex-bienvenida-cerrada') === '1') }
      catch { setCerrada(false) }
    })
  }, [])

  if (cerrada) return null
  const yoNuevo = integrantes.find((persona) => persona.id === miIntegranteId)
  const otros = integrantes.filter((persona) => persona.id !== miIntegranteId)

  function cerrar() {
    setCerrada(true)
    try { sessionStorage.setItem('tryvex-bienvenida-cerrada', '1') } catch { /* El bloqueo de storage no impide cerrar visualmente. */ }
  }

  async function saludar(nuevoId: string) {
    setEnviando(nuevoId)
    try {
      const respuesta = await fetch('/api/bienvenidas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nuevo_id: nuevoId }),
      })
      const cuerpo = await respuesta.json() as { success: boolean; data?: ResultadoSaludo; error?: string }
      if (!respuesta.ok || !cuerpo.success || !cuerpo.data) throw new Error(cuerpo.error ?? 'No se pudo dar la bienvenida')
      setSaludados((actuales) => new Set(actuales).add(nuevoId))
      if (!cuerpo.data.ya_saludado) toast.success('¡Bienvenida enviada!')
      router.push(`/chat?c=${cuerpo.data.conversacion_id}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo dar la bienvenida')
    } finally { setEnviando(null) }
  }

  return (
    <section className="relative mb-4 rounded-2xl border border-[var(--tx-border)] bg-[var(--tx-surface-1)] p-5 opacity-100 shadow-sm transition-[opacity,transform] duration-300 motion-reduce:transition-none md:mb-6" aria-labelledby="bienvenida-titulo">
      <button type="button" onClick={cerrar} aria-label="Cerrar bienvenida" className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-lg text-[var(--tx-ink-muted)] hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tx-accent)]">
        <X size={17} aria-hidden="true" />
      </button>

      {/* Si quien mira también llegó esta semana, ve su bienvenida Y a los demás recién
          llegados: con dos ingresos en la misma semana, ninguno debe quedar sin poder
          saludar al otro. */}
      {yoNuevo && <MiBienvenida yo={yoNuevo} />}
      {otros.length > 0 && (
        <div className={yoNuevo ? 'mt-5 space-y-3 border-t border-[var(--tx-border)] pt-4' : 'space-y-3 pr-8'}>
          <h2 id={yoNuevo ? undefined : 'bienvenida-titulo'} className="text-base font-semibold text-[var(--tx-ink-primary)]">
            {yoNuevo ? 'También llegaron' : 'Nuevos integrantes'}
          </h2>
          {otros.map((persona) => (
            <FilaRecienLlegado
              key={persona.id}
              persona={persona}
              yaSaludo={saludados.has(persona.id)}
              enviando={enviando === persona.id}
              onSaludar={() => saludar(persona.id)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function MiBienvenida({ yo }: { yo: RecienLlegado }) {
  return (
    <div className="space-y-4 pr-8">
      <div>
        <h2 id="bienvenida-titulo" className="text-xl font-semibold text-[var(--tx-ink-primary)]">¡Bienvenido/a a Tryvex, {yo.nombre.split(' ')[0]}!</h2>
        <p className="mt-1 text-sm text-[var(--tx-ink-muted)]">Qué alegría tenerte en el equipo. Aquí están tus primeros atajos para empezar.</p>
      </div>
      {yo.saludos.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2" aria-hidden="true">
            {yo.saludos.slice(0, 4).map((saludo) => (
              <Avatar key={saludo.id} className="h-8 w-8 border-2 border-[var(--tx-surface-1)]"><AvatarImage src={saludo.avatar_url ?? undefined} /><AvatarFallback>{iniciales(saludo.nombre)}</AvatarFallback></Avatar>
            ))}
          </div>
          <p className="text-sm text-[var(--tx-ink-secondary)]">{textoSaludos(yo)}</p>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-3">
        <Atajo href="/chat" icono={<MessageCircle size={16} />} texto="Chat" />
        <Atajo href="/tareas" icono={<ListTodo size={16} />} texto="Tareas" />
        <Atajo href="/settings" icono={<Settings size={16} />} texto="Perfil" />
      </div>
    </div>
  )
}

type FilaProps = { persona: RecienLlegado; yaSaludo: boolean; enviando: boolean; onSaludar: () => void }

function FilaRecienLlegado({ persona, yaSaludo, enviando, onSaludar }: FilaProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-[var(--tx-border)] pt-3 first-of-type:border-0 first-of-type:pt-0">
      <Avatar className="h-10 w-10"><AvatarImage src={persona.avatar_url ?? undefined} /><AvatarFallback>{iniciales(persona.nombre)}</AvatarFallback></Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--tx-ink-primary)]">{persona.nombre}</p>
        <p className="text-xs text-[var(--tx-ink-muted)]">se unió {haceDias(persona.llegada_anunciada_at)}</p>
      </div>
      <Button type="button" size="sm" variant={yaSaludo ? 'outline' : 'default'} disabled={enviando} onClick={onSaludar}>
        {yaSaludo && <Check size={14} aria-hidden="true" />}
        {enviando ? 'Abriendo…' : yaSaludo ? 'Saludaste · Abrir chat' : 'Dar la bienvenida 👋'}
      </Button>
    </div>
  )
}

function Atajo({ href, icono, texto }: { href: string; icono: React.ReactNode; texto: string }) {
  return <Link href={href} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--tx-border)] text-sm font-medium text-[var(--tx-ink-primary)] hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tx-accent)]">{icono}{texto}</Link>
}

function iniciales(nombre: string) { return nombre.split(' ').slice(0, 2).map((parte) => parte[0]).join('').toUpperCase() }
function haceDias(fecha: string) { const dias = Math.max(0, Math.floor((Date.now() - new Date(fecha).getTime()) / 86_400_000)); return dias === 0 ? 'hoy' : `hace ${dias} ${dias === 1 ? 'día' : 'días'}` }
function textoSaludos(persona: RecienLlegado) { const [primero, ...resto] = persona.saludos; return resto.length === 0 ? `${primero.nombre} te dio la bienvenida` : `${primero.nombre} y ${resto.length} más te dieron la bienvenida` }
