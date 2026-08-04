'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface ConfirmarDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  titulo: string
  descripcion: string
  /** Texto del botón que ejecuta la acción. */
  confirmar: string
  destructivo?: boolean
  onConfirmar: () => Promise<void>
}

/**
 * Confirmación reutilizable para las acciones de cobro del cliente.
 * Existe para no usar `window.confirm`: ese diálogo no respeta el tema de la app,
 * no es estilizable y en móvil se ve como un aviso del navegador, no del CRM.
 */
export function ConfirmarDialog({
  open,
  onOpenChange,
  titulo,
  descripcion,
  confirmar,
  destructivo = false,
  onConfirmar,
}: ConfirmarDialogProps) {
  const [enviando, setEnviando] = useState(false)

  async function handleConfirmar() {
    setEnviando(true)
    try {
      await onConfirmar()
      onOpenChange(false)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descripcion}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={enviando} />}>
            Cancelar
          </DialogClose>
          <Button
            variant={destructivo ? 'destructive' : 'default'}
            onClick={handleConfirmar}
            disabled={enviando}
          >
            {enviando ? 'Guardando…' : confirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
