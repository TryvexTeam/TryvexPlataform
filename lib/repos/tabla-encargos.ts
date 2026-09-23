import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Puente hacia `agente_encargos` mientras los tipos generados no la incluyen.
 *
 * `lib/types/database.ts` lo genera Supabase a partir del esquema, y la tabla
 * `agente_encargos` es nueva: hasta que ese archivo se regenere, TypeScript no
 * sabe que existe y rechaza cualquier consulta.
 *
 * La alternativa era editar el archivo generado a mano, y ya se probó: se rompe
 * con facilidad y deja errores en tablas que no tienen nada que ver. Peor aún,
 * el siguiente que regenere los tipos borraría el parche sin enterarse.
 *
 * Así que el desvío vive acá, en un solo archivo, señalizado. Las formas de las
 * filas sí están tipadas —en `intelligence-real.ts` y en las acciones—, de modo
 * que lo único que se pierde es la comprobación contra el esquema real.
 *
 * Para quitarlo: regenerar los tipos y reemplazar `tablaEncargos(supabase)` por
 * `supabase.from('agente_encargos')`. Nada más.
 */
export function tablaEncargos(supabase: SupabaseClient<never>) {
  return (supabase as unknown as SupabaseClient).from('agente_encargos')
}
