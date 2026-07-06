# PRP-006 — Halo CRM Design Implementation
**Estado:** EN PROGRESO  
**Fecha inicio:** 2026-05-27  
**Rama:** Lanidn

---

## Contexto

El señor Ignacio trajo el diseño "Halo CRM" exportado desde claude.ai/design. El archivo fue descargado como gzip tar y descomprimido a:
- `C:\Users\w10\AppData\Local\Temp\styles.css` — CSS completo del diseño
- `C:\Users\w10\AppData\Local\Temp\app.jsx` — JSX del diseño de referencia
- `C:\Users\w10\AppData\Local\Temp\Halo CRM.html` — HTML entry point

El diseño Halo CRM es un CRM cinematic dark con:
- 4 columnas: `[Sidebar 240px] [Feed 360px] [Reader 1fr] [TaskPanel 340px floating absolute]`
- Glassmorphism formula precisa (ver abajo)
- Atmospheric glows (purple + amber) + grain texture
- Feed de conversaciones con cards tipo inbox-email
- Featured card con gradiente orange-purple
- Reader panel full-width para detalle
- Floating task panel (CRM actions)

---

## Lo que ya está HECHO ✅

### globals.css
- Variables `--halo-*` añadidas al `:root`
- `.glass` y `.glass-strong` actualizados a fórmula Halo CRM
- `.grain` utility añadida (SVG fractal noise)
- `.glow-purple` y `.glow-amber` añadidos
- `.panel-float` actualizado a glass-strong formula
- `.inbox-card` rediseñada a estilo Halo CRM (gradient bg, border-radius 18px)
- `.card-featured` actualizada a gradiente orange-purple radial de Halo CRM

### app/(app)/layout.tsx
- Background cambiado a radial-gradient cinematic (`#0a0a10 → #050507 → #020203`)
- Glow ambient purple + amber añadidos como elementos absolutos
- Grain texture añadido como overlay
- Sidebar y main con `z-10` para estar sobre los glows

### app/(app)/leads/page.tsx
- Migrado de `<LeadsPipeline>` (kanban) a layout 3-panel
- Lee `searchParams.lead` para estado URL-based
- Renderiza `<LeadsInbox leads selectedId />` + `<LeadPanel lead />`

### components/leads/leads-inbox.tsx — CREADO (v1, no definitivo)
- Feed vertical con búsqueda, tabs (Todos/Nuevos/Calificados/Cerrados)
- Avatar circular con color hash
- Badge de estado con dot de color
- Score con estrella
- Tiempo relativo
- URL-based selection (router.replace)
- **Falta**: rediseñar cards al estilo Halo CRM (gradient cards, featured card, draft pills, tag chips)

### components/leads/lead-panel.tsx — CREADO (v1, no definitivo)
- Panel derecho floating glass con detalle del lead
- Info grid, notas, quick actions
- Empty state cuando no hay lead seleccionado
- **Falta**: rediseñar como "reader panel" full-width (no floating detached), al estilo Halo CRM

---

## Lo que FALTA 🔴

### FASE 1: Rediseñar leads-inbox.tsx a Halo CRM style

Reemplazar el diseño actual de las cards por el estilo exacto de Halo CRM:

```tsx
// Card styles a aplicar (de styles.css Halo CRM):
.card {
  padding: 14px;
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.012));
  border: 1px solid rgba(255,255,255,.06);
  transition: transform 180ms, border-color 180ms;
}
.card:hover { transform: translateY(-1px); border-color: rgba(255,255,255,.10); }
.card.is-active { /* purple glow border */ }
.card.is-featured {
  background: radial-gradient(120% 100% at 0% 0%, rgba(255,138,91,.35), transparent 55%),
              linear-gradient(135deg, #FF8A5B 0%, #C77BF5 55%, #8B5CF6 100%);
}
```

**Tags** sobre las cards (amber, violet, cyan) usando:
```tsx
// tag--violet: bg rgba(139,92,246,.18) color #C7B5FF border rgba(139,92,246,.28)
// tag--amber:  bg rgba(245,158,11,.16) color #FFD58A border rgba(245,158,11,.28)
// tag--cyan:   bg rgba(34,211,238,.16) color #9DECF9 border rgba(34,211,238,.28)
```

**Avatar** circular con gradient (primer lead = gradient orange-purple, resto por color de accent):
```tsx
// accent='gradient' → linear-gradient(135deg, #FF8A5B 0%, #C77BF5 55%, #8B5CF6 100%)
// accent=#hex → linear-gradient(135deg, ${accent}, ${accent}cc)
```

**Draft pill** (si el lead tiene notas):
```tsx
<div class="card__draft">
  <span class="draft-pill">✎ Notas</span>
  <span class="draft-text">{lead.notas}</span>
</div>
```

**Search** con `⌘K` kbd:
```tsx
<label class="search">
  <SearchIcon/>
  <input placeholder="Search leads, clientes…"/>
  <kbd>⌘K</kbd>
</label>
```

**Tabs** rediseñados con estilo Halo (pill container, tab activo con bg blanco/8%):
```tsx
<div class="feed__tabs"> // bg rgba(255,255,255,.03) border rounded-12
  <button class="tab is-active"> // bg rgba(255,255,255,.08)
```

### FASE 2: Rediseñar lead-panel.tsx como "Reader Panel"

El panel derecho debe ser `flex-1` (no floating) al estilo de `reader` de Halo CRM:

```
Layout leads page:
<div flex h-full overflow-hidden gap-[18px] p-[22px]>
  <LeadsInbox w-[360px] />   ← glass, fixed width
  <LeadPanel flex-1 />       ← glass, takes remaining space
</div>
```

Reader panel content (inspirado en Halo CRM reader):
```
- Reader bar (top): archive / bookmark / delete / more icon buttons
- Subject (h1 32px bold tracking-tight)
- Meta bar: Avatar + nombre + nicho + "Tagging Hint" pill (purple)
- Thread area (scrollable): conversation log messages
- Reply bar (bottom): quick action buttons
```

No es un panel flotante con `margin: 12px` — es parte del grid, takes flex-1, same height as feed.

### FASE 3: Añadir Floating Task Panel (CRM actions overlay)

Panel absoluto flotante en la esquina derecha (como `.task-panel` de Halo CRM):

```tsx
// components/leads/lead-task-panel.tsx
// position: absolute, right: 22px, top: 22px, bottom: 22px, width: 340px
// glass-strong, z-index: 5
// slide-in animation: translateX(20px) → translateX(0) opacity 0→1
// Contenido: Add Task / Add Note / Registrar contacto tabs + form fields
// Botón "Reopen" cuando está cerrado
```

### FASE 4: Actualizar el sidebar para match Halo CRM

Cambios en `components/layout/sidebar.tsx`:
- Usar clases `group`, `group__head`, `group__body`, `group__chevron` del Halo CRM
- Añadir `<SidebarGroup>` colapsable para "Inbox" y "Equipos"
- `nav-item` height 38px, border-radius 12px
- Active item: `color-mix(in oklab, var(--accent) 18%, transparent)` + glow shadow
- Footer: `usage bar` (contacts used / total) con progress bar accent

### FASE 5: Verificar toda la app

```bash
npm run build
# visitar /leads en browser
# verificar glow + grain en layout
# verificar cards con gradiente
# verificar featured card (primer card con gradient orange-purple)
# verificar reader panel
# verificar URL state /leads?lead=<id>
```

---

## Archivos a modificar

| Archivo | Acción |
|---------|--------|
| `components/leads/leads-inbox.tsx` | Rediseñar cards a Halo CRM style |
| `components/leads/lead-panel.tsx` | Rediseñar como reader panel (flex-1) |
| `components/leads/lead-task-panel.tsx` | CREAR — floating task panel |
| `app/(app)/leads/page.tsx` | Ajustar gap/padding al layout Halo CRM |
| `components/layout/sidebar.tsx` | SidebarGroup colapsable, nav-item Halo CRM |

---

## Referencia de diseño

Los archivos fuente del diseño están en:
```
C:\Users\w10\AppData\Local\Temp\styles.css   — CSS completo (19KB)
C:\Users\w10\AppData\Local\Temp\app.jsx      — JSX completo (22KB)
```

O para re-descargar:
```
URL: https://api.anthropic.com/v1/design/h/ATKI96dR6Olqzbrnbiuh7w?open_file=Halo+CRM.html
Formato: gzip tar
Archivos: crm/project/styles.css, crm/project/app.jsx
```

---

## Fórmulas CSS críticas (Halo CRM)

```css
/* Glass */
.glass {
  background: rgba(255,255,255,.035);
  backdrop-filter: blur(30px) saturate(140%);
  border: 1px solid rgba(255,255,255,.06);
  box-shadow: 0 10px 40px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.05);
}

/* Glass Strong (panels) */
.glass-strong {
  background: rgba(20,18,26,.82);
  backdrop-filter: blur(40px) saturate(150%);
  border: 1px solid rgba(255,255,255,.07);
  box-shadow: 0 30px 80px rgba(0,0,0,.65), 0 8px 24px rgba(0,0,0,.45),
              inset 0 1px 0 rgba(255,255,255,.06);
}

/* Card activa */
.card.is-active {
  border-color: color-mix(in oklab, #8B5CF6 38%, transparent);
  box-shadow: 0 0 0 1px color-mix(in oklab, #8B5CF6 22%, transparent),
              0 14px 36px color-mix(in oklab, #8B5CF6 20%, transparent),
              0 6px 18px rgba(0,0,0,.4);
}

/* Featured card */
.card.is-featured {
  background:
    radial-gradient(120% 100% at 0% 0%, rgba(255,138,91,.35), transparent 55%),
    linear-gradient(135deg, #FF8A5B 0%, #C77BF5 55%, #8B5CF6 100%);
  border-color: rgba(255,255,255,.22);
  box-shadow: 0 0 0 1px rgba(255,255,255,.10),
              0 24px 50px rgba(139,92,246,.45),
              0 8px 24px rgba(255,138,91,.25);
}

/* Ease */
--ease: cubic-bezier(.2,.8,.2,1);
--t: 180ms var(--ease);
```

---

## Notas de sesión

- La sesión anterior completó el diseño del sistema de tokens y la atmosfera
- La sesión fue interrumpida antes de rediseñar las cards del feed
- El build pasa correctamente con los cambios realizados hasta ahora
- Prioridad: FASE 1 primero (leads-inbox cards) → mayor impacto visual
