import { Fragment } from 'react'
import { parsearInline, parsearMarkdown, type BloqueMd, type NodoInline } from '@/lib/markdown/mini'

interface MarkdownProps {
  /** Texto de la entrada tal cual quedó guardado. */
  children: string
  className?: string
}

/**
 * Pinta el markdown de la bitácora. Arma nodos de React a partir del parser:
 * nada de HTML crudo, así que un mensaje de Discord no puede inyectar nada.
 */
export function Markdown({ children, className }: MarkdownProps) {
  const bloques = parsearMarkdown(children)

  return (
    <div className={`tx-md text-[13px] leading-relaxed text-[var(--tx-ink-secondary,var(--tx-ink-muted))] ${className ?? ''}`}>
      {bloques.map((bloque, i) => (
        <Bloque key={i} bloque={bloque} />
      ))}
    </div>
  )
}

function Bloque({ bloque }: { bloque: BloqueMd }) {
  switch (bloque.tipo) {
    case 'titulo': {
      // Dentro de una tarjeta del timeline, un h1 de página sería ruido: se
      // escalan como subtítulos del propio bloque.
      const tamano = { 1: 'text-[15px]', 2: 'text-[14px]', 3: 'text-[13px]' }[bloque.nivel]
      const Etiqueta = (['h4', 'h5', 'h6'] as const)[bloque.nivel - 1]
      return (
        <Etiqueta className={`${tamano} font-semibold text-[var(--tx-ink-primary)] mt-3 first:mt-0 mb-1`}>
          <Inline nodos={bloque.contenido} />
        </Etiqueta>
      )
    }

    case 'lista': {
      const Etiqueta = bloque.ordenada ? 'ol' : 'ul'
      return (
        <Etiqueta
          className={`my-1.5 pl-5 space-y-0.5 ${bloque.ordenada ? 'list-decimal' : 'list-disc'} marker:text-[var(--tx-ink-muted)]`}
        >
          {bloque.items.map((item, i) => (
            <li key={i}>
              <Inline nodos={item} />
            </li>
          ))}
        </Etiqueta>
      )
    }

    case 'cita':
      return (
        <blockquote className="my-2 pl-3 border-l-2 border-[var(--tx-ink-muted)]/40 italic">
          <Inline nodos={bloque.contenido} />
        </blockquote>
      )

    case 'codigo':
      return (
        <pre className="my-2 p-2.5 rounded-lg overflow-x-auto bg-black/25 text-[12px] leading-snug">
          <code>{bloque.texto}</code>
        </pre>
      )

    case 'separador':
      return <hr className="my-3 border-[var(--tx-ink-muted)]/20" />

    case 'parrafo':
      return (
        <p className="my-1.5 first:mt-0 last:mb-0">
          <Inline nodos={bloque.contenido} />
        </p>
      )
  }
}

function Inline({ nodos }: { nodos: NodoInline[] }) {
  return (
    <>
      {nodos.map((nodo, i) => {
        switch (nodo.tipo) {
          case 'fuerte':
            return (
              <strong key={i} className="font-semibold text-[var(--tx-ink-primary)]">
                {nodo.texto}
              </strong>
            )
          case 'enfasis':
            return <em key={i}>{nodo.texto}</em>
          case 'tachado':
            return <del key={i}>{nodo.texto}</del>
          case 'codigo':
            return (
              <code key={i} className="px-1 py-0.5 rounded bg-black/25 text-[12px] font-mono">
                {nodo.texto}
              </code>
            )
          case 'enlace':
            return (
              <a
                key={i}
                href={nodo.href}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 text-[var(--tx-ink-primary)] hover:opacity-80"
              >
                {nodo.texto}
              </a>
            )
          default:
            return <Fragment key={i}>{nodo.texto}</Fragment>
        }
      })}
    </>
  )
}

/** Una línea suelta con formato: para títulos de entrada, sin envolver en párrafo. */
export function MarkdownLinea({ children }: { children: string }) {
  return <Inline nodos={parsearInline(children)} />
}
