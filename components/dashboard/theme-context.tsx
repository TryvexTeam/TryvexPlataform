'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'

/* ── Theme Token Types ── */
export type GlowMode = 'off' | 'ambient' | 'cinematic'

export interface ThemeTokens {
  /** Main background base */
  bgBase: string
  /** Glow effect mode */
  glowMode: GlowMode
  /** Primary glow color (hex) */
  glowColor: string
  /** Secondary glow color (hex) — amber accent bottom-right */
  glowColorSecondary: string
  /** Glow intensity multiplier 0-1 */
  glowIntensity: number
  /** Accent color for UI elements */
  accentColor: string
  /** Film grain texture */
  grainEnabled: boolean
  /** Background type */
  bgType: 'color' | 'image' | 'video'
  /** Background image url or Base64 */
  bgImage: string
  /** Background video url */
  bgVideo: string
}

/* ── Default theme — Modo Minimalista ── */
const DEFAULT_THEME: ThemeTokens = {
  bgBase: '#000000',
  glowMode: 'off',
  glowColor: '#000000',
  glowColorSecondary: '#000000',
  glowIntensity: 0.9,
  accentColor: '#E8352A',
  grainEnabled: true,
  bgType: 'color',
  bgImage: '',
  bgVideo: 'https://videos.pexels.com/video-files/857195/857195-hd_1280_720_25fps.mp4',
}

/* ── Storage key (bump to clear old saved themes) ── */
const STORAGE_KEY = 'tryvex-theme-v8'

function loadTheme(): ThemeTokens {
  if (typeof window === 'undefined') return DEFAULT_THEME
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULT_THEME, ...JSON.parse(raw) }
  } catch {}
  return DEFAULT_THEME
}

function saveTheme(t: ThemeTokens) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(t)) } catch {}
}

/* ── Hex → rgba helper ── */
function hexToRgba(hex: string, alpha: number) {
  const c = hex.replace('#', '')
  const r = parseInt(c.slice(0, 2), 16)
  const g = parseInt(c.slice(2, 4), 16)
  const b = parseInt(c.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

/* ── Texto de contraste sobre el acento (guarda anti blanco-sobre-blanco) ──
   Luminancia relativa WCAG: acento claro → texto oscuro, acento oscuro → texto blanco */
function contrastForeground(hex: string): string {
  const c = hex.replace('#', '')
  if (c.length < 6) return '#ffffff'
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  })
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.45 ? '#0a0a0a' : '#ffffff'
}

/* ── Apply theme to CSS variables ── */
function applyTheme(t: ThemeTokens) {
  const root = document.documentElement
  const intensity = t.glowMode === 'off' ? 0
    : t.glowMode === 'cinematic' ? Math.min(1, t.glowIntensity * 1.3)
    : t.glowIntensity

  // Apply Background colors to semantic and Tailwind variables
  root.style.setProperty('--tx-theme-bg', t.bgBase)
  root.style.setProperty('--background', t.bgBase)
  root.style.setProperty('--tx-bg-primary', t.bgBase)
  root.style.setProperty('--sidebar', t.bgBase)

  // Apply Accent colors to semantic and Tailwind variables
  const accentFg = contrastForeground(t.accentColor)
  root.style.setProperty('--tx-accent', t.accentColor)
  root.style.setProperty('--tx-accent-fg', accentFg)
  root.style.setProperty('--primary', t.accentColor)
  root.style.setProperty('--primary-foreground', accentFg)
  root.style.setProperty('--accent', t.accentColor)
  root.style.setProperty('--sidebar-primary', t.accentColor)

  root.style.setProperty('--tx-glow-color', hexToRgba(t.glowColor, 0.35 * intensity))
  root.style.setProperty('--tx-glow-secondary', hexToRgba(t.glowColorSecondary, 0.22 * intensity))
  root.style.setProperty('--tx-glow-opacity', String(intensity))
  root.style.setProperty('--tx-accent-glow', hexToRgba(t.accentColor, 0.25))
  root.style.setProperty('--tx-accent-subtle', hexToRgba(t.accentColor, 0.12))
  root.style.setProperty('--halo-accent', t.accentColor)
  root.style.setProperty('--halo-glow', hexToRgba(t.accentColor, 0.35))
  root.style.setProperty('--tx-grain-opacity', t.grainEnabled ? '0.035' : '0')

  // Background
  document.body.style.setProperty('background-color', t.bgBase)
  root.setAttribute('data-glow', t.glowMode)
}

/* ── Context ── */
interface ThemeCtx {
  theme: ThemeTokens
  set: <K extends keyof ThemeTokens>(key: K, value: ThemeTokens[K]) => void
  updateTheme: (updates: Partial<ThemeTokens>) => void
  reset: () => void
  panelOpen: boolean
  setPanelOpen: (open: boolean) => void
}

const ThemeContext = createContext<ThemeCtx>({
  theme: DEFAULT_THEME,
  set: () => {},
  updateTheme: () => {},
  reset: () => {},
  panelOpen: false,
  setPanelOpen: () => {},
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<ThemeTokens>(DEFAULT_THEME)

  // Load from localStorage once on mount
  useEffect(() => {
    const saved = loadTheme()
    setTheme(saved)
    applyTheme(saved)
  }, [])

  const set = useCallback(<K extends keyof ThemeTokens>(key: K, value: ThemeTokens[K]) => {
    setTheme(prev => {
      const next = { ...prev, [key]: value }
      applyTheme(next)
      saveTheme(next)
      return next
    })
  }, [])

  const updateTheme = useCallback((updates: Partial<ThemeTokens>) => {
    setTheme(prev => {
      const next = { ...prev, ...updates }
      applyTheme(next)
      saveTheme(next)
      return next
    })
  }, [])

  const reset = useCallback(() => {
    setTheme(DEFAULT_THEME)
    applyTheme(DEFAULT_THEME)
    saveTheme(DEFAULT_THEME)
  }, [])

  const [panelOpen, setPanelOpen] = useState(false)

  return (
    <ThemeContext.Provider value={{ theme, set, updateTheme, reset, panelOpen, setPanelOpen }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
