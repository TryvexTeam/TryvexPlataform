'use client'

import type { Mensaje, MiembroChat } from '@/lib/types/chat'
import { puedeEditarMensaje } from '@/lib/chat/edicion'
import { ConfirmarBorrado } from './confirmar-borrado'
import { InfoMensaje } from './info-mensaje'
import { MenuMensaje, type AccionesMenuMensaje } from './menu-mensaje'
import { SelectorReenvio } from './selector-reenvio'

export interface MenuAbierto {
  mensaje: Mensaje
  rect: { top: number; left: number; right: number; width: number; height: number }
  punto?: { x: number; y: number }
}

interface CapasMensajeProps {
  menu: MenuAbierto | null
  miIntegranteId: string
  soyAdmin: boolean
  miembros: MiembroChat[]
  borrando: Mensaje | null
  info: Mensaje | null
  reenviando: Mensaje | null
  renderBurbuja: (m: Mensaje) => React.ReactNode
  accionesMenu: (m: Mensaje) => AccionesMenuMensaje
  onCerrarMenu: () => void
  onCerrarBorrado: () => void
  onConfirmarBorrado: (m: Mensaje) => void
  onCerrarInfo: () => void
  onCerrarReenvio: () => void
  onReenviar: (m: Mensaje, conversaciones: string[]) => Promise<boolean>
}

/** Menú elevado, confirmación de borrado, info y reenvío: las capas sobre la conversación. */
export function CapasMensaje(props: CapasMensajeProps) {
  const { menu, miIntegranteId } = props
  const m = menu?.mensaje
  const mio = m?.autor_id === miIntegranteId

  return (
    <>
      {menu && m && (
        <MenuMensaje
          rect={menu.rect}
          punto={menu.punto}
          mio={mio}
          burbuja={<div className="pointer-events-none">{props.renderBurbuja(m)}</div>}
          opciones={{
            fijado: Boolean(m.fijado_at),
            puedeCopiar: Boolean(m.contenido) && !m.eliminado_at,
            puedeEditar: mio && Boolean(m.contenido) && puedeEditarMensaje(m.created_at, m.eliminado_at),
            puedeInfo: mio && !m.eliminado_at,
            puedeEliminar: (mio || props.soyAdmin) && !m.eliminado_at,
          }}
          acciones={props.accionesMenu(m)}
          onCerrar={props.onCerrarMenu}
        />
      )}
      <ConfirmarBorrado
        abierta={Boolean(props.borrando)}
        onAbierta={(abierta) => !abierta && props.onCerrarBorrado()}
        onConfirmar={() => props.borrando && props.onConfirmarBorrado(props.borrando)}
      />
      <InfoMensaje mensaje={props.info} miembros={props.miembros} miIntegranteId={miIntegranteId} onCerrar={props.onCerrarInfo} />
      <SelectorReenvio mensaje={props.reenviando} miIntegranteId={miIntegranteId} onCerrar={props.onCerrarReenvio} onReenviar={props.onReenviar} />
    </>
  )
}
