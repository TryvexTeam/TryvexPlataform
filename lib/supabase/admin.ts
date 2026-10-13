import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

/**
 * Cliente con service role (bypasea RLS). No importa next/headers a propósito:
 * así también lo puede usar el proxy. Solo para código de servidor con auth propia.
 */
export function crearClienteAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}
