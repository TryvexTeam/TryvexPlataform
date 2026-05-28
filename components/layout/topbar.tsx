'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Menu, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Sidebar } from './sidebar'

interface TopbarProps {
  nombre: string
  email: string
  avatarUrl: string | null
}

export function Topbar({ nombre, email, avatarUrl }: TopbarProps) {
  const router = useRouter()
  const [sheetOpen, setSheetOpen] = useState(false)

  const initials = nombre
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  async function handleSignOut() {
    const supabase = createClient()
    const { error } = await supabase.auth.signOut()
    if (error) {
      toast.error('Error al cerrar sesión')
      return
    }
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="h-14 border-b border-neutral-200 bg-white flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-3">
        {/* Mobile menu — base-ui Sheet no usa asChild */}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger
            className="md:hidden inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-neutral-100"
            aria-label="Abrir menú"
          >
            <Menu size={18} />
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-60">
            <Sidebar onNavigate={() => setSheetOpen(false)} />
          </SheetContent>
        </Sheet>
        <span className="font-semibold text-sm text-neutral-700 hidden md:block">
          Tryvex
        </span>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 rounded-full focus:outline-none focus:ring-2 focus:ring-neutral-300">
          <Avatar className="h-8 w-8">
            <AvatarImage src={avatarUrl ?? undefined} />
            <AvatarFallback className="text-xs bg-neutral-200">{initials}</AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <div className="px-3 py-2">
            <p className="text-sm font-medium truncate">{nombre}</p>
            <p className="text-xs text-neutral-500 truncate">{email}</p>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut} className="text-red-600 cursor-pointer">
            <LogOut size={14} className="mr-2" />
            Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
