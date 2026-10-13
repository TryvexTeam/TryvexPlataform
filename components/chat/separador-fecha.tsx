import { etiquetaFecha } from '@/lib/chat/fechas'

export function SeparadorFecha({ fecha, id }: { fecha: string; id?: string }) {
  return <div id={id} data-chat-date={fecha} className="chat-date-separator my-2 flex justify-center"><span>{etiquetaFecha(fecha)}</span></div>
}

export function SeparadorNoLeidos({ cantidad }: { cantidad: number }) {
  return <div data-unread-separator className="my-3 flex items-center gap-3 text-xs font-semibold text-[var(--chat-accent)]"><span className="h-px flex-1 bg-[var(--chat-accent)]/40" /><span>{cantidad} {cantidad === 1 ? 'mensaje no leído' : 'mensajes no leídos'}</span><span className="h-px flex-1 bg-[var(--chat-accent)]/40" /></div>
}
