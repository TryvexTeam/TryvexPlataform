export function hashColorHex(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  const c = (hash & 0x00ffffff).toString(16).toUpperCase()
  return `#${'00000'.substring(0, 6 - c.length) + c}`
}

export const tagTones = ['violet', 'amber', 'cyan'] as const
export function getTagTone(nicho: string): typeof tagTones[number] {
  let hash = 0
  for (let i = 0; i < nicho.length; i++) hash = nicho.charCodeAt(i) + ((hash << 5) - hash)
  return tagTones[Math.abs(hash) % tagTones.length]
}

export function getInitials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return (name[0] ?? '?').toUpperCase()
}

export function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return `${Math.floor(days / 7)}sem`
}
