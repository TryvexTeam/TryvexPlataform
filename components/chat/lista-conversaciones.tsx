'use client'

import { useMemo, useState } from 'react'
import { ArchiveIcon, HeadphonesIcon, SearchIcon } from 'lucide-react'
import type { Conversacion } from '@/lib/types/chat'
import { tituloConversacion } from '@/lib/types/chat'
import { textoPlano } from '@/lib/markdown/mini'
import { FilaConversacion } from './fila-conversacion'
import { NuevaConversacion } from './nueva-conversacion'
import type { IntegranteChat } from './chat-workspace'

type Filtro = 'todos' | 'no-leidos' | 'grupos'

interface ListaConversacionesProps {
  conversaciones: Conversacion[]
  activaId: string | null
  miIntegranteId: string
  equipo: IntegranteChat[]
  escribiendo: Map<string, string>
  enSalas: Map<string, string[]>
  abriendo: boolean
  onCrear: (payload: { tipo: 'dm' | 'grupo'; nombre?: string; miembros: string[] }) => Promise<void>
  onAbrir: (id: string) => void
  onSala: (conversacion: Conversacion) => void
  onPreferencia: (id: string, cuerpo: Record<string, unknown>) => Promise<void>
  onMarcarLeida: (id: string) => Promise<void>
}

export function ListaConversaciones(props: ListaConversacionesProps) {
  const [buscar, setBuscar] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [verArchivados, setVerArchivados] = useState(false)
  const [colapsado, setColapsado] = useState(false)
  const salas = props.conversaciones.filter((c) => c.tipo === 'voz')
  const archivados = props.conversaciones.filter((c) => c.tipo !== 'voz' && c.archivado_at)
  const nombrePorId = useMemo(() => new Map(props.equipo.map((i) => [i.id, i.nombre])), [props.equipo])

  const visibles = useMemo(() => {
    const termino = buscar.trim().toLocaleLowerCase('es')
    return props.conversaciones
      .filter((c) => c.tipo !== 'voz' && Boolean(c.archivado_at) === verArchivados)
      .filter((c) => c.tipo === 'agentes' || filtro === 'todos' || (filtro === 'no-leidos' ? c.no_leidos > 0 : c.tipo === 'grupo'))
      .filter((c) => {
        if (!termino) return true
        const nombre = tituloConversacion(c, props.miIntegranteId).toLocaleLowerCase('es')
        const ultimo = textoPlano(c.ultimo_mensaje?.contenido ?? '').toLocaleLowerCase('es')
        return nombre.includes(termino) || ultimo.includes(termino)
      })
      .sort((a, b) => {
        if (Boolean(a.fijado_at) !== Boolean(b.fijado_at)) return a.fijado_at ? -1 : 1
        return b.ultimo_mensaje_at.localeCompare(a.ultimo_mensaje_at)
      })
  }, [buscar, filtro, props.conversaciones, props.miIntegranteId, verArchivados])

  return (
    <aside className="chat-list-panel flex h-full min-h-0 w-full flex-col md:w-[360px] md:shrink-0">
      <header className={`chat-list-header shrink-0 ${colapsado ? 'is-collapsed' : ''}`}>
        <div className="flex min-h-12 items-center justify-between px-4 pt-safe">
          <h1 className="chat-large-title text-[34px] font-bold tracking-[-.03em] text-[var(--chat-ink)]">{verArchivados ? 'Archivados' : 'Chats'}</h1>
          <h2 className="chat-compact-title pointer-events-none absolute inset-x-14 text-center text-[17px] font-semibold text-[var(--chat-ink)]">{verArchivados ? 'Archivados' : 'Chats'}</h2>
          <NuevaConversacion equipo={props.equipo} miIntegranteId={props.miIntegranteId} onCrear={props.onCrear} ocupado={props.abriendo} />
        </div>
        <div className="px-3 pb-2">
          <label className="flex min-h-10 items-center gap-2 rounded-full bg-[var(--chat-search)] px-3 text-[var(--chat-meta)]">
            <SearchIcon className="size-4" aria-hidden />
            <span className="sr-only">Buscar chats</span>
            <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar" className="min-w-0 flex-1 bg-transparent text-base text-[var(--chat-ink)] outline-none placeholder:text-[var(--chat-meta)]" />
          </label>
          {!verArchivados ? (
            <div className="mt-2 flex gap-2 overflow-x-auto" aria-label="Filtros de chats">
              <FiltroPill activo={filtro === 'todos'} onClick={() => setFiltro('todos')}>Todos</FiltroPill>
              <FiltroPill activo={filtro === 'no-leidos'} onClick={() => setFiltro('no-leidos')}>No leídos</FiltroPill>
              <FiltroPill activo={filtro === 'grupos'} onClick={() => setFiltro('grupos')}>Grupos</FiltroPill>
            </div>
          ) : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" onScroll={(e) => setColapsado(e.currentTarget.scrollTop > 36)}>
        {!verArchivados && archivados.length > 0 ? (
          <button onClick={() => setVerArchivados(true)} className="flex min-h-14 w-full items-center gap-4 border-b border-[var(--chat-separator)] px-5 text-left text-[15px] font-semibold text-[var(--chat-ink)]">
            <ArchiveIcon className="size-5 text-[var(--chat-accent)]" aria-hidden />
            <span className="flex-1">Archivados</span><span className="text-xs text-[var(--chat-accent)]">{archivados.length}</span>
          </button>
        ) : null}
        {verArchivados ? (
          <button onClick={() => setVerArchivados(false)} className="min-h-12 w-full border-b border-[var(--chat-separator)] px-4 text-left text-sm font-semibold text-[var(--chat-accent)]">‹ Volver a Chats</button>
        ) : null}
        {!verArchivados && salas.map((sala) => (
          <button key={sala.id} onClick={() => props.onSala(sala)} className="flex min-h-14 w-full items-center gap-3 border-b border-[var(--chat-separator)] px-4 text-left">
            <span className="grid size-10 place-items-center rounded-full bg-[var(--chat-surface-soft)] text-[var(--chat-accent)]"><HeadphonesIcon className="size-5" /></span>
            <span className="min-w-0 flex-1"><strong className="block truncate text-[15px] text-[var(--chat-ink)]">{sala.nombre ?? 'Sala de voz'}</strong><small className="text-[var(--chat-meta)]">{(props.enSalas.get(sala.id) ?? []).length ? `${(props.enSalas.get(sala.id) ?? []).length} conectados` : 'Toca para entrar'}</small></span>
          </button>
        ))}
        {visibles.map((c) => {
          const quien = props.escribiendo.get(c.id)
          const textoEscribiendo = quien
            ? c.tipo === 'grupo' ? `${nombrePorId.get(quien) ?? 'Alguien'} está escribiendo…` : 'escribiendo…'
            : undefined
          return (
            <FilaConversacion key={c.id} conversacion={c} miIntegranteId={props.miIntegranteId} escribiendo={textoEscribiendo} activa={c.id === props.activaId} onAbrir={() => props.onAbrir(c.id)} onLeida={() => void alternarLeida(props, c)} onFijar={() => void props.onPreferencia(c.id, { fijado: !c.fijado_at })} onArchivar={() => void props.onPreferencia(c.id, { archivado: !c.archivado_at })} onSilenciar={(hasta) => void props.onPreferencia(c.id, { silenciado_hasta: hasta })} />
          )
        })}
        {visibles.length === 0 ? <p className="px-5 py-10 text-center text-sm text-[var(--chat-meta)]">No hay chats que coincidan.</p> : null}
      </div>
    </aside>
  )
}

async function alternarLeida(props: ListaConversacionesProps, c: Conversacion) {
  if (c.no_leidos) await props.onMarcarLeida(c.id)
  else await props.onPreferencia(c.id, { no_leido: true })
}

function FiltroPill({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} aria-pressed={activo} className={`min-h-8 shrink-0 rounded-full px-3.5 text-sm font-medium ${activo ? 'bg-[var(--chat-accent-soft)] text-[var(--chat-accent)]' : 'bg-[var(--chat-surface-soft)] text-[var(--chat-meta)]'}`}>{children}</button>
}
