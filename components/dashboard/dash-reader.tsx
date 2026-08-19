'use client'

import Link from 'next/link'
import { CheckSquare, ArrowUpRight } from 'lucide-react'
import { motion } from 'framer-motion'
import { HaloAvatar } from './halo-avatar'
import type { FeedItem } from './dash-feed'

/* ── Estadísticas reales inyectadas desde el server ── */
export interface DashStats {
  leads: { total: number; nuevosSemana: number; sinContactar: number }
  clientes: { activos: number; total: number }
  proyectos: { enCurso: number; entregasMes: number }
  tareasPendientes: { id: string; titulo: string; estado: string; prioridad: string }[]
  tareasPendientesTotal: number
}

interface DashReaderProps {
  item: FeedItem | null
  stats: DashStats
}

const prioridadTone: Record<string, { color: string; bg: string; border: string }> = {
  alta:  { color: 'oklch(80% 0.16 25)',  bg: 'oklch(62% 0.2 25 / 0.12)',  border: 'oklch(62% 0.2 25 / 0.22)' },
  media: { color: 'oklch(80% 0.16 55)',  bg: 'oklch(74% 0.17 55 / 0.12)', border: 'oklch(74% 0.17 55 / 0.22)' },
  baja:  { color: 'oklch(80% 0.15 145)', bg: 'oklch(72% 0.17 145 / 0.12)', border: 'oklch(72% 0.17 145 / 0.22)' },
}

function KpiCard({
  label,
  value,
  primaryText,
  secondaryText,
  href,
  badgeStyle,
}: {
  label: string
  value: number
  primaryText: string
  secondaryText: string
  href: string
  badgeStyle: React.CSSProperties
}) {
  return (
    <Link href={href} className="hub-card hub-card--interactive p-4 flex flex-col gap-1 outline-none">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--tx-ink-muted)' }}>
          {label}
        </span>
        <span
          className="min-w-5 h-5 px-1.5 rounded-full flex items-center justify-center text-[10px] font-bold"
          style={badgeStyle}
        >
          {value}
        </span>
      </div>
      <div className="text-[13px] mt-1 font-semibold" style={{ color: 'var(--tx-ink-secondary)' }}>{primaryText}</div>
      <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--tx-ink-muted)' }}>{secondaryText}</div>
    </Link>
  )
}

export function DashReader({ item, stats }: DashReaderProps) {
  /* ── Sin lead seleccionado: hub de resumen con datos reales ── */
  if (!item) {
    return (
      <section className="reader flex flex-col h-full" style={{ padding: '20px 24px', gap: 20, overflowY: 'auto' }}>
        <header className="flex flex-col gap-1.5 pb-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <span
              className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wider"
              style={{
                color: 'color-mix(in oklab, var(--tx-accent) 85%, white)',
                backgroundColor: 'color-mix(in oklab, var(--tx-accent) 12%, transparent)',
                border: '1px solid color-mix(in oklab, var(--tx-accent) 20%, transparent)',
              }}
            >
              Operaciones CRM
            </span>
          </div>
          <h1 className="text-[24px] font-bold tracking-tight" style={{ color: 'var(--tx-ink-primary)' }}>
            Centro de Operaciones
          </h1>
          <p className="text-[12.5px]" style={{ color: 'var(--tx-ink-muted)' }}>
            Estado real del espacio de trabajo
          </p>
        </header>

        {/* KPIs reales */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KpiCard
            label="Leads / Contactos"
            value={stats.leads.total}
            primaryText={`${stats.leads.nuevosSemana} nuevos esta semana`}
            secondaryText={`${stats.leads.sinContactar} sin contactar`}
            href="/leads"
            badgeStyle={{
              backgroundColor: 'color-mix(in oklab, var(--tx-accent) 25%, transparent)',
              border: '1px solid color-mix(in oklab, var(--tx-accent) 35%, transparent)',
              color: 'color-mix(in oklab, var(--tx-accent) 80%, white)',
            }}
          />
          <KpiCard
            label="Clientes / Cuentas"
            value={stats.clientes.activos}
            primaryText={`${stats.clientes.activos} clientes activos`}
            secondaryText={`${stats.clientes.total} en total`}
            href="/clientes"
            badgeStyle={{
              backgroundColor: 'oklch(68% 0.18 230 / 0.18)',
              border: '1px solid oklch(68% 0.18 230 / 0.28)',
              color: 'oklch(78% 0.14 230)',
            }}
          />
          <KpiCard
            label="Proyectos"
            value={stats.proyectos.enCurso}
            primaryText={`${stats.proyectos.enCurso} en curso`}
            secondaryText={`${stats.proyectos.entregasMes} con entrega este mes`}
            href="/proyectos"
            badgeStyle={{
              backgroundColor: 'oklch(72% 0.17 145 / 0.18)',
              border: '1px solid oklch(72% 0.17 145 / 0.28)',
              color: 'oklch(82% 0.14 145)',
            }}
          />
        </div>

        {/* Tareas pendientes reales */}
        <div className="hub-card p-4 flex flex-col gap-3.5 mt-2">
          <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
            <div className="flex items-center gap-2">
              <CheckSquare size={14} style={{ color: 'var(--tx-accent)' }} />
              <h2 className="text-[13px] font-bold" style={{ color: 'var(--tx-ink-primary)' }}>
                Tareas pendientes
              </h2>
            </div>
            <Link
              href="/tareas"
              className="flex items-center gap-1 text-[11px] font-medium transition-colors hover:text-white"
              style={{ color: 'var(--tx-ink-muted)' }}
            >
              Ver todas ({stats.tareasPendientesTotal}) <ArrowUpRight size={11} />
            </Link>
          </div>
          {stats.tareasPendientes.length === 0 ? (
            <div className="flex flex-col items-start gap-2 py-3">
              <p className="text-[12.5px]" style={{ color: 'var(--tx-ink-muted)' }}>
                No hay tareas pendientes.
              </p>
              <Link
                href="/tareas"
                className="text-[12px] font-medium transition-colors hover:opacity-80"
                style={{ color: 'var(--tx-accent)' }}
              >
                Crear una tarea →
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-3 text-[12.5px]">
              {stats.tareasPendientes.map((t) => {
                const tone = prioridadTone[t.prioridad] ?? prioridadTone.media
                return (
                  <Link
                    key={t.id}
                    href="/tareas"
                    className="flex items-start justify-between border-b border-white/5 pb-2 last:border-0 last:pb-0 transition-colors hover:text-white"
                    style={{ color: 'var(--tx-ink-secondary)' }}
                  >
                    <span className="font-medium">{t.titulo}</span>
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 capitalize"
                      style={{ color: tone.color, backgroundColor: tone.bg, border: `1px solid ${tone.border}` }}
                    >
                      {t.prioridad}
                    </span>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </section>
    )
  }

  /* ── Lead seleccionado: detalle real, sin thread inventado ── */
  return (
    <section className="reader" style={{ padding: '18px 20px', gap: 14 }}>
      <motion.div
        key={item.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 350, damping: 25 }}
        className="flex flex-col gap-4"
      >
        <header className="flex items-center gap-3">
          <HaloAvatar initials={item.initials} accent={item.accent} src={item.avatar} size={40} />
          <div className="flex-1 min-w-0">
            <h1 className="reader__subject" style={{ fontSize: '22px', margin: 0, letterSpacing: '-0.02em' }}>
              {item.name}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--tx-ink-muted)' }}>
                {item.subject}
              </span>
              {item.tag && (
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    color: 'color-mix(in oklab, var(--tx-accent) 85%, white)',
                    backgroundColor: 'color-mix(in oklab, var(--tx-accent) 12%, transparent)',
                    border: '1px solid color-mix(in oklab, var(--tx-accent) 20%, transparent)',
                  }}
                >
                  {item.tag}
                </span>
              )}
              <span className="text-[11px]" style={{ color: 'var(--tx-ink-muted)' }}>· hace {item.when}</span>
            </div>
          </div>
        </header>

        <article
          className="msg p-4 rounded-[16px]"
          style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.015) 100%)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 4px 16px rgba(0, 0, 0, 0.45)',
          }}
        >
          <p className="text-[12.5px] leading-[1.6] text-white/80">{item.snippet}</p>
        </article>

        <Link
          href="/leads"
          className="self-start flex items-center gap-1.5 text-[12.5px] font-semibold px-3.5 py-2 rounded-[10px] transition-opacity hover:opacity-90"
          style={{
            background: 'var(--tx-accent)',
            color: 'var(--tx-accent-fg)',
            boxShadow: '0 8px 22px var(--tx-accent-glow)',
          }}
        >
          Gestionar en Leads <ArrowUpRight size={13} />
        </Link>
      </motion.div>
    </section>
  )
}
