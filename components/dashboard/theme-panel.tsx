'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Sliders, RotateCcw, ChevronDown, Check } from 'lucide-react'
import { motion } from 'framer-motion'
import { toast } from '@/lib/toast'
import { useTheme, type GlowMode } from './theme-context'

/* ─────────────────────────────────────────────────
 * Config data
 * ──────────────────────────────────────────────── */

const THEME_PRESETS = [
  {
    name: 'Tryvex Classic',
    desc: 'Rojo Tryvex y naranja sobre negro puro (Nativo)',
    tokens: {
      bgBase: '#000000',
      glowMode: 'ambient' as const,
      glowColor: '#E8352A',
      glowColorSecondary: '#FF8A5B',
      accentColor: '#E8352A',
    }
  },
  {
    name: 'Tryvex Cyber',
    desc: 'Rojo vibrante y cyan sobre negro puro',
    tokens: {
      bgBase: '#000000',
      glowMode: 'ambient' as const,
      glowColor: '#E8352A',
      glowColorSecondary: '#22D3EE',
      accentColor: '#E8352A',
    }
  },
  {
    name: 'Halo Classic',
    desc: 'Morado y naranja sobre negro puro (Enterprise)',
    tokens: {
      bgBase: '#000000',
      glowMode: 'ambient' as const,
      glowColor: '#8B5CF6',
      glowColorSecondary: '#FF8A5B',
      accentColor: '#8B5CF6',
    }
  },
  {
    name: 'Azul Espacial',
    desc: 'Azul profundo con brillo cyan y cobalto',
    tokens: {
      bgBase: '#060810',
      glowMode: 'ambient' as const,
      glowColor: '#6366F1',
      glowColorSecondary: '#22D3EE',
      accentColor: '#22D3EE',
    }
  },
  {
    name: 'Bosque Esmeralda',
    desc: 'Verde y lima sobre fondo carbón templado',
    tokens: {
      bgBase: '#0a0a0a',
      glowMode: 'ambient' as const,
      glowColor: '#10B981',
      glowColorSecondary: '#84CC16',
      accentColor: '#10B981',
    }
  },
  {
    name: 'Dorado Lujo',
    desc: 'Brillo oro y ámbar sobre oscuro sutil',
    tokens: {
      bgBase: '#020203',
      glowMode: 'ambient' as const,
      glowColor: '#F59E0B',
      glowColorSecondary: '#FF8A5B',
      accentColor: '#F59E0B',
    }
  },
  {
    name: 'Modo Minimalista',
    desc: 'Fondo negro absoluto sin brillos atmosféricos',
    tokens: {
      bgBase: '#000000',
      glowMode: 'off' as const,
      glowColor: '#000000',
      glowColorSecondary: '#000000',
      accentColor: '#ffffff',
    }
  }
]

const GLOW_COLORS = [
  { label: 'Violeta',  value: '#8B5CF6' },
  { label: 'Índigo',   value: '#6366F1' },
  { label: 'Rosa',     value: '#EC4899' },
  { label: 'Tryvex',   value: '#E8352A' },
  { label: 'Naranja',  value: '#F97316' },
  { label: 'Cyan',     value: '#22D3EE' },
  { label: 'Verde',    value: '#10B981' },
  { label: 'Dorado',   value: '#F59E0B' },
]

const GLOW_SECONDARY = [
  { label: 'Ámbar',    value: '#FF8A5B' },
  { label: 'Rosa',     value: '#F472B6' },
  { label: 'Cyan',     value: '#22D3EE' },
  { label: 'Lima',     value: '#84CC16' },
  { label: 'Sin sec.', value: '#000000' },
]

const ACCENT_PRESETS = [
  '#8B5CF6', '#A855F7',
  '#E8352A', '#22D3EE',
  '#10B981', '#F59E0B',
]

const GLOW_MODES: { id: GlowMode; label: string; desc: string }[] = [
  { id: 'off',       label: 'Off',       desc: 'Sin brillo' },
  { id: 'ambient',   label: 'Ambient',   desc: 'Sutil' },
  { id: 'cinematic', label: 'Cinematic', desc: 'Máximo' },
]

/* ─────────────────────────────────────────────────
 * Sub-components
 * ──────────────────────────────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[10px] font-semibold tracking-[.06em] uppercase pt-3 first:pt-0"
      style={{ color: 'rgba(255,255,255,.5)' }}
    >
      {children}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[5px]">
      <div className="flex justify-between items-baseline">
        <span className="text-[11.5px] font-medium" style={{ color: 'rgba(255,255,255,.72)' }}>
          {label}
        </span>
      </div>
      {children}
    </div>
  )
}

/** Segmented radio control */
function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  const idx = options.findIndex(o => o.id === value)
  const n = options.length
  return (
    <div
      className="relative flex p-[2px] rounded-[8px] select-none"
      style={{ background: 'rgba(255,255,255,.06)' }}
    >
      {/* thumb */}
      <div
        className="absolute top-[2px] bottom-[2px] rounded-[6px] transition-all duration-150"
        style={{
          left: `calc(2px + ${idx} * (100% - 4px) / ${n})`,
          width: `calc((100% - 4px) / ${n})`,
          background: 'rgba(255,255,255,.12)',
          boxShadow: '0 1px 3px rgba(0,0,0,.3)',
        }}
      />
      {options.map(o => (
        <button
          key={o.id}
          type="button"
          className="relative z-10 flex-1 text-center text-[11.5px] font-medium rounded-[6px] py-[5px] px-1 transition-colors duration-150"
          style={{ color: o.id === value ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.4)' }}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Toggle switch */
function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      className="relative w-8 h-[18px] rounded-full transition-colors duration-150"
      style={{ background: value ? '#34c759' : 'rgba(255,255,255,.15)' }}
      onClick={() => onChange(!value)}
      aria-checked={value}
      role="switch"
    >
      <span
        className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform duration-150"
        style={{
          left: 2,
          transform: value ? 'translateX(14px)' : 'translateX(0)',
          boxShadow: '0 1px 2px rgba(0,0,0,.25)',
        }}
      />
    </button>
  )
}

/** Color chip grid */
function ColorChips({
  colors,
  value,
  onChange,
  size = 28,
}: {
  colors: { label: string; value: string }[]
  value: string
  onChange: (v: string) => void
  size?: number
}) {
  return (
    <div className="flex flex-wrap gap-[6px]">
      {colors.map(c => {
        const active = c.value.toLowerCase() === value.toLowerCase()
        return (
          <button
            key={c.value}
            type="button"
            title={c.label}
            onClick={() => onChange(c.value)}
            className="relative rounded-[6px] overflow-hidden transition-all duration-150 hover:-translate-y-0.5"
            style={{
              width: size,
              height: size,
              background: c.value,
              boxShadow: active
                ? `0 0 0 2px #fff, 0 0 0 3.5px ${c.value}`
                : '0 0 0 .5px rgba(255,255,255,.18), 0 2px 4px rgba(0,0,0,.3)',
            }}
          >
            {active && (
              <span className="absolute inset-0 flex items-center justify-center">
                <Check size={12} style={{ color: '#fff', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,.5))' }} />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** Slider */
function Slider({
  value,
  min = 0,
  max = 1,
  step = 0.05,
  onChange,
}: {
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (v: number) => void
}) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      className="w-full h-[4px] rounded-full outline-none appearance-none"
      style={{
        background: `linear-gradient(to right, rgba(255,255,255,.6) ${(value - min) / (max - min) * 100}%, rgba(255,255,255,.1) ${(value - min) / (max - min) * 100}%)`,
        cursor: 'pointer',
      }}
    />
  )
}

/** Theme preset cards */
function ThemePresets() {
  const { theme, updateTheme } = useTheme()
  return (
    <div className="flex flex-col gap-[6px]">
      {THEME_PRESETS.map(p => {
        const active =
          p.tokens.bgBase === theme.bgBase &&
          p.tokens.glowMode === theme.glowMode &&
          (p.tokens.glowMode === 'off' || p.tokens.glowColor === theme.glowColor)

        return (
          <motion.button
            key={p.name}
            type="button"
            onClick={() => updateTheme(p.tokens)}
            className="flex items-center gap-3 px-3 py-2 rounded-[10px] transition-all duration-150 text-left hover:bg-white/5"
            style={{
              background: active ? 'rgba(255,255,255,.08)' : 'transparent',
              border: `1px solid ${active ? 'rgba(255,255,255,.15)' : 'rgba(255,255,255,.05)'}`,
            }}
            whileHover={{ scale: 1.01, y: -0.5 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 500, damping: 20 }}
          >
            {/* Visual chip of the preset color theme */}
            <div
              className="w-7 h-7 rounded-[7px] shrink-0 flex items-center justify-center relative overflow-hidden"
              style={{
                background: p.tokens.bgBase === '#000000' ? '#050505' : p.tokens.bgBase,
                boxShadow: `inset 0 0 0 1px rgba(255,255,255,.1), 0 0 0 1px rgba(0,0,0,.5)`,
              }}
            >
              {p.tokens.glowMode !== 'off' && (
                <div
                  className="absolute inset-0 opacity-80 blur-[2px]"
                  style={{
                    background: `radial-gradient(circle at 30% 30%, ${p.tokens.glowColor}, transparent 70%)`
                  }}
                />
              )}
              {/* Small accent dot */}
              <div
                className="w-2.5 h-2.5 rounded-full z-10 border border-black/50"
                style={{ background: p.tokens.accentColor }}
              />
            </div>
            
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-semibold truncate" style={{ color: 'rgba(255,255,255,.85)' }}>
                {p.name}
              </div>
              <div className="text-[10px] truncate" style={{ color: 'rgba(255,255,255,.55)' }}>
                {p.desc}
              </div>
            </div>
            {active && (
              <Check size={13} className="ml-auto shrink-0" style={{ color: 'rgba(255,255,255,.6)' }} />
            )}
          </motion.button>
        )
      })}
    </div>
  )
}

/* ─────────────────────────────────────────────────
 * Main Panel
 * ──────────────────────────────────────────────── */

export function ThemePanel() {
  const { theme, set, updateTheme, reset, panelOpen: open, setPanelOpen: setOpen } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // Sube el archivo a Supabase Storage y guarda solo la URL.
  // (base64 en localStorage revienta la cuota de 5MB con cualquier video)
  async function subirWallpaper(file: File, campo: 'bgImage' | 'bgVideo') {
    setSubiendo(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/wallpaper', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? 'Error al subir el archivo')
        return
      }
      set(campo, json.data.url)
      toast.success('Fondo actualizado')
    } catch {
      toast.error('Error al subir el archivo')
    } finally {
      setSubiendo(false)
    }
  }

  // Set mounted on client side
  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  // Block scrolling on body when sidebar is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  const panelContent = open && (
    <>
      {/* Backdrop overlay */}
      <div
        className="fixed inset-0"
        style={{
          zIndex: 99999,
          background: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          animation: 'fadeInPanel 200ms ease-out',
        }}
        onClick={() => setOpen(false)}
      />

      {/* Configuration Sidebar */}
      <div
        ref={panelRef}
        className="fixed top-0 bottom-0 right-0 w-[360px] flex flex-col overflow-hidden border-l"
        style={{
          zIndex: 100000,
          background: 'rgba(10, 10, 12, 0.95)',
          backdropFilter: 'blur(45px) saturate(210%)',
          WebkitBackdropFilter: 'blur(45px) saturate(210%)',
          borderLeftColor: 'rgba(255, 255, 255, 0.1)',
          boxShadow: '-10px 0 40px rgba(0, 0, 0, 0.6), inset 1px 0 0 rgba(255, 255, 255, 0.1)',
          animation: 'themeSlideInRight 260ms cubic-bezier(.16,1,.3,1)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}
        >
          <div className="flex items-center gap-2">
            <Sliders size={13} style={{ color: 'var(--tx-accent, #E8352A)' }} />
            <span className="text-[12.5px] font-semibold text-white/90">
              Personalización del Entorno
            </span>
          </div>
          <div className="flex items-center gap-1">
            <motion.button
              type="button"
              onClick={reset}
              title="Restablecer"
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              className="w-[26px] h-[26px] rounded-[7px] flex items-center justify-center transition-colors hover:bg-white/8"
              style={{ color: 'rgba(255,255,255,.4)' }}
            >
              <RotateCcw size={12} />
            </motion.button>
            <motion.button
              type="button"
              onClick={() => setOpen(false)}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              className="w-[26px] h-[26px] rounded-[7px] flex items-center justify-center transition-colors hover:bg-white/8"
              style={{ color: 'rgba(255,255,255,.4)' }}
            >
              <X size={13} />
            </motion.button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div
          className="flex flex-col gap-4 p-4 overflow-y-auto flex-1"
          style={{ scrollbarWidth: 'thin' }}
        >
          {/* — Temas — */}
          <SectionLabel>Temas predefinidos</SectionLabel>
          <ThemePresets />

          {/* — Fondo de Pantalla — */}
          <SectionLabel>Fondo de Pantalla</SectionLabel>
          
          <Row label="Tipo de fondo">
            <SegmentedControl
              options={[
                { id: 'color', label: 'Color' },
                { id: 'image', label: 'Imagen' },
                { id: 'video', label: 'Video' }
              ]}
              value={theme.bgType || 'color'}
              onChange={v => set('bgType', v)}
            />
          </Row>

          {theme.bgType === 'image' && (
            <div className="flex flex-col gap-3.5 mt-1 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
              <Row label="Subir imagen local">
                <label className="flex items-center justify-center gap-2 w-full h-9 rounded-lg cursor-pointer text-xs font-semibold hover:bg-white/10 transition-colors"
                       style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px dashed rgba(255, 255, 255, 0.2)' }}>
                  <span>{subiendo ? 'Subiendo…' : 'Seleccionar imagen'}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    disabled={subiendo}
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) void subirWallpaper(file, 'bgImage')
                    }}
                  />
                </label>
              </Row>

              <Row label="Galería de imágenes">
                <div className="grid grid-cols-3 gap-1.5 mt-1">
                  {[
                    { label: 'Nebulosa', val: 'https://images.unsplash.com/photo-1506318137071-a8e063b4bec0?q=80&w=400&auto=format&fit=crop' },
                    { label: 'Tecnología', val: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=400&auto=format&fit=crop' },
                    { label: 'Abstracto', val: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=400&auto=format&fit=crop' },
                  ].map(img => {
                    const active = theme.bgImage === img.val
                    return (
                      <button
                        key={img.label}
                        type="button"
                        onClick={() => set('bgImage', img.val)}
                        className="h-12 rounded-md overflow-hidden relative border transition-all hover:scale-[1.03]"
                        style={{
                          backgroundImage: `url(${img.val})`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                          borderColor: active ? 'var(--tx-accent, #E8352A)' : 'rgba(255,255,255,0.1)',
                          boxShadow: active ? '0 0 8px var(--tx-accent-glow)' : 'none'
                        }}
                      >
                        <div className="absolute inset-0 bg-black/55 flex items-center justify-center text-[9px] font-bold text-white/90">
                          {img.label}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </Row>
            </div>
          )}

          {theme.bgType === 'video' && (
            <div className="flex flex-col gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
              <Row label="Subir video local (MP4)">
                <label className="flex items-center justify-center gap-2 w-full h-9 rounded-lg cursor-pointer text-xs font-semibold hover:bg-white/10 transition-colors"
                       style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px dashed rgba(255, 255, 255, 0.2)' }}>
                  <span>{subiendo ? 'Subiendo…' : 'Seleccionar archivo .mp4 / .webm (máx 25MB)'}</span>
                  <input
                    type="file"
                    accept="video/mp4,video/webm"
                    className="hidden"
                    disabled={subiendo}
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) void subirWallpaper(file, 'bgVideo')
                    }}
                  />
                </label>
              </Row>

              <Row label="Loops de video premium">
                <div className="flex flex-col gap-1.5 mt-1">
                  {[
                    { label: 'Tinta abstracta', val: 'https://videos.pexels.com/video-files/3129671/3129671-hd_1920_1080_30fps.mp4' },
                    { label: 'Océano aéreo', val: 'https://videos.pexels.com/video-files/2611250/2611250-hd_1920_1080_30fps.mp4' },
                    { label: 'Aurora nocturna', val: 'https://videos.pexels.com/video-files/1943483/1943483-hd_1920_1080_25fps.mp4' },
                    { label: 'Partículas', val: 'https://videos.pexels.com/video-files/857195/857195-hd_1280_720_25fps.mp4' },
                  ].map(vid => {
                    const active = theme.bgVideo === vid.val
                    return (
                      <motion.button
                        key={vid.label}
                        type="button"
                        onClick={() => set('bgVideo', vid.val)}
                        className="flex items-center justify-between px-3 py-2 rounded-lg text-[11px] font-medium border text-left transition-colors hover:bg-white/5"
                        style={{
                          borderColor: active ? 'var(--tx-accent, #E8352A)' : 'rgba(255,255,255,0.06)',
                          background: active ? 'color-mix(in oklab, var(--tx-accent) 10%, transparent)' : 'transparent',
                          color: active ? '#fff' : 'rgba(255,255,255,0.7)'
                        }}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <span>{vid.label}</span>
                        {active && <Check size={11} className="text-white" />}
                      </motion.button>
                    )
                  })}
                </div>
              </Row>

              <Row label="URL de video loop externo">
                <input
                  type="text"
                  placeholder="Pegar URL .mp4..."
                  value={theme.bgVideo}
                  onChange={e => set('bgVideo', e.target.value)}
                  className="h-8 px-2.5 rounded-lg text-xs bg-white/5 border border-white/10 outline-none text-white w-full"
                />
              </Row>
            </div>
          )}

          {/* — Brillo — */}
          <SectionLabel>Efecto de brillo</SectionLabel>

          <Row label="Modo">
            <SegmentedControl
              options={GLOW_MODES.map(m => ({ id: m.id, label: m.label }))}
              value={theme.glowMode}
              onChange={v => set('glowMode', v)}
            />
          </Row>

          {theme.glowMode !== 'off' && (
            <>
              <Row label="Color principal">
                <ColorChips
                  colors={GLOW_COLORS}
                  value={theme.glowColor}
                  onChange={v => set('glowColor', v)}
                  size={30}
                />
              </Row>

              <Row label="Color secundario (esquina)">
                <ColorChips
                  colors={GLOW_SECONDARY}
                  value={theme.glowColorSecondary}
                  onChange={v => set('glowColorSecondary', v)}
                  size={30}
                />
              </Row>

              <Row label={`Intensidad — ${Math.round(theme.glowIntensity * 100)}%`}>
                <Slider
                  value={theme.glowIntensity}
                  min={0.1}
                  max={1}
                  step={0.05}
                  onChange={v => set('glowIntensity', v)}
                />
              </Row>
            </>
          )}

          {/* — Acento — */}
          <SectionLabel>Color de acento</SectionLabel>
          <Row label="Acento UI">
            <div className="flex items-center gap-2">
              <ColorChips
                colors={ACCENT_PRESETS.map(v => ({ label: v, value: v }))}
                value={theme.accentColor}
                onChange={v => set('accentColor', v)}
                size={28}
              />
              {/* Native color picker for custom */}
              <label
                title="Color personalizado"
                className="relative w-7 h-7 rounded-[6px] overflow-hidden shrink-0 cursor-pointer"
                style={{
                  background: 'rgba(255,255,255,.08)',
                  border: '1px solid rgba(255,255,255,.15)',
                }}
              >
                <span className="absolute inset-0 flex items-center justify-center text-[9px]"
                  style={{ color: 'rgba(255,255,255,.55)' }}>
                  ···
                </span>
                <input
                  type="color"
                  value={theme.accentColor}
                  onChange={e => set('accentColor', e.target.value)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </label>
            </div>
          </Row>

          {/* — Textura — */}
          <SectionLabel>Textura</SectionLabel>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[12px] font-medium" style={{ color: 'rgba(255,255,255,.72)' }}>
                Grano de film
              </div>
              <div className="text-[10.5px]" style={{ color: 'rgba(255,255,255,.55)' }}>
                Textura cinematográfica sutil
              </div>
            </div>
            <Toggle value={theme.grainEnabled} onChange={v => set('grainEnabled', v)} />
          </div>
        </div>
      </div>
    </>
  )

  return (
    <>
      {/* Trigger button */}
      <motion.button
        type="button"
        onClick={() => setOpen(!open)}
        title="Personalizar tema"
        className="flex items-center gap-2 h-[34px] px-3 rounded-[10px] transition-all duration-[180ms]"
        style={{
          background: open ? 'color-mix(in oklab, var(--tx-accent) 15%, transparent)' : 'rgba(255,255,255,.04)',
          border: `1px solid ${open ? 'color-mix(in oklab, var(--tx-accent) 35%, transparent)' : 'rgba(255,255,255,.07)'}`,
          color: open ? 'var(--tx-ink-primary)' : 'rgba(255,255,255,.55)',
          boxShadow: open ? '0 0 0 1px color-mix(in oklab, var(--tx-accent) 20%, transparent), 0 4px 12px color-mix(in oklab, var(--tx-accent) 15%, transparent)' : 'none',
        }}
        whileHover={{ scale: 1.02, y: -0.5 }}
        whileTap={{ scale: 0.97 }}
      >
        <Sliders size={14} />
        <span className="text-[12px] font-medium hidden sm:block">Tema</span>
        <ChevronDown
          size={12}
          className="transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </motion.button>

      {/* Render panel in body portal when client-side mounted */}
      {mounted && typeof document !== 'undefined'
        ? createPortal(panelContent, document.body)
        : null}

      {/* Slide-over panel keyframes and custom CSS */}
      <style>{`
        @keyframes themeSlideInRight {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
        @keyframes fadeInPanel {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 14px; height: 14px;
          border-radius: 50%;
          background: #fff;
          border: .5px solid rgba(0,0,0,.2);
          box-shadow: 0 1px 3px rgba(0,0,0,.3);
          cursor: pointer;
        }
        input[type=range]::-moz-range-thumb {
          width: 14px; height: 14px;
          border-radius: 50%;
          background: #fff;
          border: .5px solid rgba(0,0,0,.2);
          cursor: pointer;
        }
      `}</style>
    </>
  )
}
