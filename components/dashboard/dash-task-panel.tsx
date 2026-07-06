'use client'

import { useState } from 'react'
import { X, ChevronDown, Plus, CheckSquare, FileText, Bell, Paperclip, Smile, MoreHorizontal } from 'lucide-react'
import { motion } from 'framer-motion'

interface TaskPanelProps {
  open: boolean
  onClose: () => void
}

const TABS = [
  { id: 'task', label: 'Añadir tarea', icon: CheckSquare },
  { id: 'note', label: 'Añadir nota', icon: FileText },
  { id: 'notif', label: 'Añadir notif.', icon: Bell },
]

interface FieldProps {
  label: string
  children: React.ReactNode
  hasChevron?: boolean
}

function Field({ label, children, hasChevron = true }: FieldProps) {
  return (
    <label className="field">
      <span className="field__label" style={{ textTransform: 'none', color: 'rgba(255, 255, 255, 0.4)' }}>
        {label}
      </span>
      <span className="field__input">
        {children}
        {hasChevron && (
          <span className="field__chev">
            <ChevronDown size={14} />
          </span>
        )}
      </span>
    </label>
  )
}

export function DashTaskPanel({ open, onClose }: TaskPanelProps) {
  const [tab, setTab] = useState('task')
  const [subject, setSubject] = useState('Programar llamada de seguimiento')
  const [desc, setDesc] = useState('Preguntas sobre cooperación, requerirá firmar documento...\n...')

  return (
    <aside
      className={`task-panel ${open ? 'is-open' : ''}`}
      aria-hidden={!open}
      style={{ width: '360px' }}
    >
      {/* CSS Animation and SVG Filter support inline */}
      <style>{`
        .task-panel__inner {
          position: relative;
          isolation: isolate;
        }
      `}</style>

      {/* Dock Mac Tahoe 26 glass style container overlay */}
      <div
        className="task-panel__inner"
        style={{
          gap: 16,
          backgroundColor: 'transparent',
          borderRadius: 20,
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
          overflow: 'hidden'
        }}
      >
        {/* Liquid Glass Layer 1: Blurred glass with SVG distortion filter (affects only the backdrop) */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            zIndex: -1,
            backgroundImage: 'linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%)',
            backgroundColor: 'rgba(10, 10, 12, 0.35)',
            backdropFilter: 'url(#liquid-glass-filter) blur(45px) saturate(210%)',
            WebkitBackdropFilter: 'url(#liquid-glass-filter) blur(45px) saturate(210%)',
          }}
        />
        {/* Header - Salesforce Integrations Dropdown + Close */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <motion.button
              whileTap={{ scale: 0.96 }}
              className="flex items-center gap-2 px-3.5 py-1.5 text-[13px] text-white font-medium btn-rounded-gray"
            >
              Salesforce
              <ChevronDown size={14} className="opacity-60" />
            </motion.button>
          </div>
          <motion.button
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 500, damping: 15 }}
            className="w-[28px] h-[28px] flex items-center justify-center btn-rounded-gray"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={14} />
          </motion.button>
        </header>

        {/* Actions - Cancel & Create in Spanish */}
        <div className="flex items-center justify-between w-full mt-1">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.96 }}
            className="px-4 py-2 text-[12px] font-semibold btn-rounded-gray"
            onClick={onClose}
          >
            Cancelar
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02, y: -1 }}
            whileTap={{ scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            className="px-5 py-2 text-[12px] font-bold text-black bg-white hover:bg-white/90 rounded-[38px] transition-all"
          >
            Crear
          </motion.button>
        </div>

        {/* Tabs - Exact active border style */}
        <div className="tp__tabs mt-1" style={{ backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)', padding: 4, borderRadius: 12 }}>
          {TABS.map(t => {
            const isActive = tab === t.id
            return (
              <motion.button
                key={t.id}
                className={`tp__tab ${isActive ? 'is-active' : ''}`}
                onClick={() => setTab(t.id)}
                style={isActive ? {
                  border: '2px solid #ffffff',
                  backgroundColor: 'rgba(255, 255, 255, 0.04)',
                  color: '#ffffff',
                  boxShadow: 'none',
                  fontWeight: 600
                } : undefined}
                whileTap={{ scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 500, damping: 20 }}
              >
                <t.icon size={13} />
                {t.label}
              </motion.button>
            )
          })}
        </div>

        {/* Form Fields - Spanish Labels & Prefilled values */}
        <Field label="Asunto" hasChevron={false}>
          <input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              fontSize: 13,
              color: '#ffffff',
              outline: 'none',
            }}
          />
        </Field>

        <Field label="Asignado a">
          <input
            defaultValue="Pierre Smith"
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              fontSize: 13,
              color: '#ffffff',
              outline: 'none',
            }}
          />
        </Field>

        <Field label="Fecha de vencimiento">
          <input
            defaultValue="27 mayo, 2026"
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              fontSize: 13,
              color: '#ffffff',
              outline: 'none',
            }}
          />
        </Field>

        {/* Text Area Description Container with internal toolbar */}
        <div className="flex flex-col gap-1 w-full">
          <span className="text-[11px] text-white/40 pl-1" style={{ textTransform: 'none' }}>Descripción</span>
          <div className="relative w-full">
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 12px 42px 12px',
                backgroundColor: 'rgba(255,255,255,.04)',
                border: '1px solid rgba(255,255,255,.06)',
                borderRadius: 14,
                fontSize: 13,
                lineHeight: 1.45,
                color: 'var(--tx-ink-primary)',
                resize: 'none',
                minHeight: 110,
                outline: 'none'
              }}
            />
            {/* Toolbar embedded inside the text area container */}
            <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1">
              {[FileText, Paperclip, Smile, MoreHorizontal].map((Icon, i) => (
                <motion.button
                  key={i}
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.92 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                  className="w-[28px] h-[28px] flex items-center justify-center rounded-[8px] transition-colors hover:bg-white/5 text-white/40 hover:text-white/70"
                >
                  <Icon size={14} />
                </motion.button>
              ))}
            </div>
          </div>
        </div>

        {/* Add integration CTA in Spanish - Solid White Button with Black Text */}
        <motion.button
          whileHover={{ scale: 1.02, y: -1 }}
          whileTap={{ scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          className="w-full h-11 flex items-center justify-center gap-2 rounded-full font-bold text-[13px] transition-all hover:bg-white/95 mt-auto shrink-0"
          style={{ backgroundColor: '#ffffff', color: '#0b0c10' }}
        >
          <Plus size={14} />
          Añadir una integración
        </motion.button>
      </div>

      {/* SVG Liquid Refraction Filter definition - Hidden */}
      <svg className="sr-only" width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <filter id="liquid-glass-filter">
            <feTurbulence type="turbulence" baseFrequency="0.02" numOctaves="3" seed="2" result="turb" />
            <feDisplacementMap in="SourceGraphic" in2="turb" scale="20" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>
    </aside>
  )
}
