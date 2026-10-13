import { createAdminClient } from '@/lib/supabase/server'
import { NotificacionesRepository } from '@/lib/repos/notificaciones'
import type { RecienLlegado } from '@/lib/types/bienvenida'

// El esquema generado aún no contiene las tablas de la migración 119.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any

export class BienvenidasRepository {
  constructor(private readonly sb: Sb) {}

  async anunciarLlegada(integranteId: string): Promise<void> {
    try {
      const admin = createAdminClient() as Sb
      const { data, error } = await admin.from('dim_integrantes')
        .update({ llegada_anunciada_at: new Date().toISOString() })
        .eq('id', integranteId).is('llegada_anunciada_at', null)
        .select('id, nombre').maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) return
      const notificaciones = new NotificacionesRepository(admin)
      await notificaciones.notificar({
        destinatarios: await notificaciones.idsActivos(), excluir: integranteId,
        tipo: 'bienvenida', titulo: `${data.nombre} se unió a Tryvex`,
        cuerpo: 'Dale la bienvenida', link: '/dashboard',
      })
    } catch (error) {
      console.error('[bienvenidas] no se pudo anunciar la llegada:', error)
    }
  }

  async recientes(dias = 7): Promise<RecienLlegado[]> {
    const desde = new Date(Date.now() - dias * 86_400_000).toISOString()
    const { data, error } = await this.sb.from('dim_integrantes')
      .select('id, nombre, avatar_url, llegada_anunciada_at, bienvenidas!bienvenidas_nuevo_fkey(created_at, dim_integrantes!bienvenidas_de_fkey(id, nombre, avatar_url))')
      .eq('activo', true).gte('llegada_anunciada_at', desde)
      .order('llegada_anunciada_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (data ?? []).map((fila: Sb) => ({
      id: fila.id, nombre: fila.nombre, avatar_url: fila.avatar_url,
      llegada_anunciada_at: fila.llegada_anunciada_at,
      saludos: (fila.bienvenidas ?? []).map((saludo: Sb) => ({
        id: saludo.dim_integrantes.id, nombre: saludo.dim_integrantes.nombre,
        avatar_url: saludo.dim_integrantes.avatar_url, created_at: saludo.created_at,
      })),
    }))
  }

  async saludar(nuevoId: string, deId: string): Promise<{ yaSaludado: boolean }> {
    const { error } = await this.sb.from('bienvenidas').insert({ nuevo_id: nuevoId, de_id: deId })
    if (!error) return { yaSaludado: false }
    if (error.code === '23505') return { yaSaludado: true }
    throw new Error(error.message)
  }

  async getActivo(id: string): Promise<{ id: string; nombre: string } | null> {
    const { data, error } = await this.sb.from('dim_integrantes').select('id, nombre')
      .eq('id', id).eq('activo', true).maybeSingle()
    if (error) throw new Error(error.message)
    return data as { id: string; nombre: string } | null
  }
}
