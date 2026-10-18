'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatDistanceToNowStrict } from 'date-fns'
import { es } from 'date-fns/locale'
import { Bookmark, Bot, Link2, MessageCircle, Newspaper, Plus, Send, Trash2, Users } from 'lucide-react'
import { toast } from '@/lib/toast'
import { AvatarIntegrante } from '@/components/shared/avatar-integrante'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Coleccion, EmojiFeed, PublicacionFeed } from '@/lib/types/feed'
import { cn } from '@/lib/utils'

/**
 * El feed del equipo: lo que cada uno encuentra (referencias, videos, ideas), las
 * noticias del radar y las colecciones guardadas. Lo guardado lo leen también los
 * agentes por `/api/agentes/feed`.
 */

export type PestanaFeed = 'equipo' | 'afuera' | 'guardado'

const PESTANAS: { id: PestanaFeed; label: string; icono: typeof Users }[] = [
  { id: 'equipo', label: 'Equipo', icono: Users },
  { id: 'afuera', label: 'Afuera', icono: Newspaper },
  { id: 'guardado', label: 'Guardado', icono: Bookmark },
]

async function enviar(url: string, metodo: 'POST' | 'DELETE', cuerpo?: unknown): Promise<{ ok: boolean; error?: string; data?: unknown }> {
  try {
    const res = await fetch(url, {
      method: metodo,
      headers: cuerpo ? { 'Content-Type': 'application/json' } : undefined,
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    })
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string; data?: unknown }
    return res.ok ? { ok: true, data: json.data } : { ok: false, error: json.error ?? 'Algo falló' }
  } catch {
    return { ok: false, error: 'Sin conexión' }
  }
}

function hace(iso: string): string {
  return formatDistanceToNowStrict(new Date(iso), { locale: es, addSuffix: true })
}

interface Props {
  pestana: PestanaFeed
  publicaciones: PublicacionFeed[]
  colecciones: Coleccion[]
  coleccionActivaId: string | null
  yo: { nombre: string; avatarUrl: string | null; color: string | null }
}

export function FeedVista({ pestana, publicaciones, colecciones, coleccionActivaId, yo }: Props) {
  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold text-[var(--tx-ink-primary)]">Feed</h1>
        <p className="text-sm text-[var(--tx-ink-muted)]">
          Lo que el equipo encuentra, lo que pasa afuera y lo que vale la pena guardar.
        </p>
      </header>

      <nav aria-label="Secciones del feed" className="flex gap-1 rounded-xl bg-[var(--tx-surface-2)] p-1">
        {PESTANAS.map(({ id, label, icono: Icono }) => (
          <Link
            key={id}
            href={`/feed?ver=${id}`}
            aria-current={pestana === id ? 'page' : undefined}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors',
              pestana === id
                ? 'bg-[var(--tx-bg-primary)] font-medium text-[var(--tx-ink-primary)]'
                : 'text-[var(--tx-ink-muted)] hover:text-[var(--tx-ink-primary)]',
            )}
          >
            <Icono size={14} /> {label}
          </Link>
        ))}
      </nav>

      {pestana === 'equipo' && <Composer yo={yo} />}
      {pestana === 'guardado' && <BarraColecciones colecciones={colecciones} activaId={coleccionActivaId} />}

      {publicaciones.length === 0 ? (
        <Vacio pestana={pestana} hayColecciones={colecciones.length > 0} />
      ) : (
        <ol className="flex flex-col gap-4">
          {publicaciones.map((p) => (
            <li key={p.id}>
              <Tarjeta publicacion={p} colecciones={colecciones} />
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function Vacio({ pestana, hayColecciones }: { pestana: PestanaFeed; hayColecciones: boolean }) {
  const texto =
    pestana === 'equipo'
      ? 'Todavía nadie publica. Comparte la primera referencia: un video, una web que te gustó, una idea.'
      : pestana === 'afuera'
        ? 'Aún no hay noticias. Las trae el radar semanal (o cualquier agente por /api/agentes/noticias).'
        : hayColecciones
          ? 'Esta colección está vacía. Guarda publicaciones con el marcador de cada una.'
          : 'Crea tu primera colección, por ejemplo «ideas para landings», y guarda ahí lo que sirva.'
  return <p className="rounded-xl border border-dashed border-[var(--tx-border)] p-6 text-center text-sm text-[var(--tx-ink-muted)]">{texto}</p>
}

function Composer({ yo }: { yo: Props['yo'] }) {
  const router = useRouter()
  const [texto, setTexto] = useState('')
  const [url, setUrl] = useState('')
  const [conLink, setConLink] = useState(false)
  const [enviando, setEnviando] = useState(false)

  async function publicar() {
    setEnviando(true)
    const r = await enviar('/api/feed', 'POST', { texto, url })
    setEnviando(false)
    if (!r.ok) {
      toast.error(r.error ?? 'No se pudo publicar')
      return
    }
    setTexto('')
    setUrl('')
    setConLink(false)
    toast.success('Publicado')
    router.refresh()
  }

  const vacio = !texto.trim() && !url.trim()
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!vacio && !enviando) void publicar()
      }}
      className="flex gap-3 rounded-xl border border-[var(--tx-border)] p-4"
    >
      <AvatarIntegrante nombre={yo.nombre} avatarUrl={yo.avatarUrl} color={yo.color} size={36} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <label htmlFor="feed-texto" className="sr-only">Qué quieres compartir</label>
        <textarea
          id="feed-texto"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={4000}
          rows={2}
          placeholder="¿Qué encontraste? Una idea, una referencia, algo que le sirva al equipo…"
          className="w-full resize-y rounded-lg bg-[var(--tx-surface-2)] p-2.5 text-sm text-[var(--tx-ink-primary)] placeholder:text-[var(--tx-ink-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--tx-accent)]"
        />
        {conLink && (
          <>
            <label htmlFor="feed-url" className="sr-only">Link</label>
            <input
              id="feed-url"
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://… (TikTok, YouTube, Instagram, una web)"
              className="w-full rounded-lg bg-[var(--tx-surface-2)] p-2.5 text-sm text-[var(--tx-ink-primary)] placeholder:text-[var(--tx-ink-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--tx-accent)]"
            />
          </>
        )}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setConLink((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-[var(--tx-ink-secondary)] hover:bg-[var(--tx-surface-1)]"
            aria-pressed={conLink}
          >
            <Link2 size={14} /> {conLink ? 'Sin link' : 'Agregar link'}
          </button>
          <button
            type="submit"
            disabled={vacio || enviando}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--tx-accent)] px-3 py-1.5 text-sm font-medium text-[var(--tx-accent-fg)] disabled:opacity-40"
          >
            <Send size={14} /> {enviando ? 'Publicando…' : 'Publicar'}
          </button>
        </div>
      </div>
    </form>
  )
}

function BarraColecciones({ colecciones, activaId }: { colecciones: Coleccion[]; activaId: string | null }) {
  const router = useRouter()
  const [creando, setCreando] = useState(false)
  const [nombre, setNombre] = useState('')

  async function crear() {
    const r = await enviar('/api/feed/colecciones', 'POST', { nombre })
    if (!r.ok) {
      toast.error(r.error ?? 'No se pudo crear')
      return
    }
    const id = (r.data as { id: string }).id
    setNombre('')
    setCreando(false)
    router.push(`/feed?ver=guardado&col=${id}`)
    router.refresh()
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {colecciones.map((c) => (
        <Link
          key={c.id}
          href={`/feed?ver=guardado&col=${c.id}`}
          aria-current={c.id === activaId ? 'page' : undefined}
          className={cn(
            'rounded-full border px-3 py-1 text-sm',
            c.id === activaId
              ? 'border-[var(--tx-accent)] text-[var(--tx-ink-primary)]'
              : 'border-[var(--tx-border)] text-[var(--tx-ink-secondary)] hover:text-[var(--tx-ink-primary)]',
          )}
        >
          {c.nombre} <span className="text-[var(--tx-ink-muted)]">{c.total}</span>
        </Link>
      ))}
      {creando ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (nombre.trim()) void crear()
          }}
          className="flex items-center gap-1"
        >
          <label htmlFor="nueva-coleccion" className="sr-only">Nombre de la colección</label>
          <input
            id="nueva-coleccion"
            autoFocus
            value={nombre}
            maxLength={80}
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setCreando(false)}
            placeholder="Nombre…"
            className="w-40 rounded-full bg-[var(--tx-surface-2)] px-3 py-1 text-sm text-[var(--tx-ink-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--tx-accent)]"
          />
          <button type="submit" className="rounded-full px-2 py-1 text-sm text-[var(--tx-accent-2)]">Crear</button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setCreando(true)}
          className="flex items-center gap-1 rounded-full border border-dashed border-[var(--tx-border)] px-3 py-1 text-sm text-[var(--tx-ink-muted)] hover:text-[var(--tx-ink-primary)]"
        >
          <Plus size={13} /> Nueva colección
        </button>
      )}
    </div>
  )
}

function Tarjeta({ publicacion: p, colecciones }: { publicacion: PublicacionFeed; colecciones: Coleccion[] }) {
  const router = useRouter()
  const [verComentarios, setVerComentarios] = useState(false)
  const [comentario, setComentario] = useState('')

  async function accion(url: string, metodo: 'POST' | 'DELETE', cuerpo?: unknown, ok?: string) {
    const r = await enviar(url, metodo, cuerpo)
    if (!r.ok) toast.error(r.error ?? 'Algo falló')
    else {
      if (ok) toast.success(ok)
      router.refresh()
    }
    return r.ok
  }

  const v = p.vistaPrevia
  return (
    <article className="flex flex-col gap-3 rounded-xl border border-[var(--tx-border)] p-4">
      <header className="flex items-center gap-2.5">
        {p.autor?.esAgente ? (
          <span className="grid size-9 place-items-center rounded-full bg-[var(--tx-surface-2)]" aria-hidden="true">
            <Bot size={16} style={{ color: p.autor.color ?? 'var(--tx-accent-2)' }} />
          </span>
        ) : (
          <AvatarIntegrante nombre={p.autor?.nombre ?? '?'} avatarUrl={p.autor?.avatarUrl} color={p.autor?.color} size={36} />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--tx-ink-primary)]">
            {p.autor?.nombre ?? 'Alguien que ya no está'}
            {p.autor?.esAgente && <span className="ml-1.5 rounded bg-[var(--tx-surface-2)] px-1 text-[10px] text-[var(--tx-ink-muted)]">agente</span>}
          </p>
          <p className="text-xs text-[var(--tx-ink-muted)]">
            {hace(p.createdAt)}
            {p.fuente && ` · ${p.fuente}`}
          </p>
        </div>
        {p.esMia && (
          <button
            type="button"
            onClick={() => {
              if (confirm('¿Borrar esta publicación?')) void accion(`/api/feed/${p.id}`, 'DELETE', undefined, 'Borrada')
            }}
            aria-label="Borrar publicación"
            className="rounded-lg p-1.5 text-[var(--tx-ink-muted)] hover:text-red-500"
          >
            <Trash2 size={14} />
          </button>
        )}
      </header>

      {p.texto && p.tipo === 'post' && <p className="whitespace-pre-wrap text-sm text-[var(--tx-ink-primary)]">{p.texto}</p>}

      {p.url && (
        <a
          href={p.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col overflow-hidden rounded-lg border border-[var(--tx-border)] hover:bg-[var(--tx-surface-1)]"
        >
          {v.imagen && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={v.imagen} alt="" loading="lazy" referrerPolicy="no-referrer" className="max-h-64 w-full object-cover" />
          )}
          <div className="p-3">
            <p className="text-xs text-[var(--tx-ink-muted)]">{v.sitio ?? new URL(p.url).hostname}</p>
            <p className="text-sm font-medium text-[var(--tx-ink-primary)]">{v.titulo ?? p.url}</p>
            {v.descripcion && <p className="mt-0.5 line-clamp-2 text-xs text-[var(--tx-ink-secondary)]">{v.descripcion}</p>}
          </div>
        </a>
      )}

      <footer className="flex flex-wrap items-center gap-1">
        {p.reacciones.map((r) => (
          <button
            key={r.emoji}
            type="button"
            onClick={() => void accion(`/api/feed/${p.id}/reacciones`, 'POST', { emoji: r.emoji satisfies EmojiFeed })}
            aria-pressed={r.mia}
            aria-label={`Reaccionar con ${r.emoji}${r.total ? `, ${r.total}` : ''}`}
            className={cn(
              'flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm transition-colors',
              r.mia ? 'border-[var(--tx-accent)] bg-[var(--tx-accent-subtle)]' : 'border-transparent hover:bg-[var(--tx-surface-2)]',
              r.total === 0 && !r.mia && 'opacity-60',
            )}
          >
            {r.emoji}
            {r.total > 0 && <span className="text-xs tabular-nums text-[var(--tx-ink-secondary)]">{r.total}</span>}
          </button>
        ))}

        <button
          type="button"
          onClick={() => setVerComentarios((x) => !x)}
          aria-expanded={verComentarios}
          className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-[var(--tx-ink-secondary)] hover:bg-[var(--tx-surface-2)]"
        >
          <MessageCircle size={14} /> {p.comentarios.length || ''}
        </button>

        {p.tipo === 'post' || p.tipo === 'noticia' ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Guardar en una colección"
              className={cn(
                'rounded-lg p-1.5 hover:bg-[var(--tx-surface-2)]',
                p.colecciones.length ? 'text-[var(--tx-accent-2)]' : 'text-[var(--tx-ink-secondary)]',
              )}
            >
              <Bookmark size={14} fill={p.colecciones.length ? 'currentColor' : 'none'} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {colecciones.length === 0 && (
                <DropdownMenuItem disabled className="text-xs">Crea una colección en «Guardado»</DropdownMenuItem>
              )}
              {colecciones.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.id}
                  checked={p.colecciones.includes(c.id)}
                  onCheckedChange={() => void accion(`/api/feed/colecciones/${c.id}`, 'POST', { publicacionId: p.id })}
                  className="text-sm"
                >
                  {c.nombre}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push('/feed?ver=guardado')} className="text-xs">
                Ver colecciones
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </footer>

      {verComentarios && (
        <section aria-label="Comentarios" className="flex flex-col gap-2 border-t border-[var(--tx-border)] pt-3">
          {p.comentarios.map((c) => (
            <div key={c.id} className="flex gap-2">
              <AvatarIntegrante nombre={c.autor?.nombre ?? '?'} avatarUrl={c.autor?.avatarUrl} color={c.autor?.color} size={24} />
              <div className="min-w-0 flex-1 rounded-lg bg-[var(--tx-surface-2)] px-2.5 py-1.5">
                <p className="text-xs font-medium text-[var(--tx-ink-primary)]">
                  {c.autor?.nombre ?? '?'} <span className="font-normal text-[var(--tx-ink-muted)]">· {hace(c.createdAt)}</span>
                </p>
                <p className="whitespace-pre-wrap text-sm text-[var(--tx-ink-primary)]">{c.texto}</p>
              </div>
            </div>
          ))}
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              if (!comentario.trim()) return
              if (await accion(`/api/feed/${p.id}/comentarios`, 'POST', { texto: comentario })) setComentario('')
            }}
            className="flex gap-2"
          >
            <label htmlFor={`comentario-${p.id}`} className="sr-only">Escribe un comentario</label>
            <input
              id={`comentario-${p.id}`}
              value={comentario}
              maxLength={2000}
              onChange={(e) => setComentario(e.target.value)}
              placeholder="Comenta…"
              className="min-w-0 flex-1 rounded-lg bg-[var(--tx-surface-2)] px-2.5 py-1.5 text-sm text-[var(--tx-ink-primary)] placeholder:text-[var(--tx-ink-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--tx-accent)]"
            />
            <button type="submit" disabled={!comentario.trim()} className="rounded-lg px-2.5 text-sm text-[var(--tx-accent-2)] disabled:opacity-40">
              Enviar
            </button>
          </form>
        </section>
      )}
    </article>
  )
}
