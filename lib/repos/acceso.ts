import { createAdminClient } from '@/lib/supabase/server'
import { CAMPOS_ACCESO, type IntegranteAcceso, type IpBloqueada, type IpCandidata } from '@/lib/types/acceso'

// El tipo generado en lib/types/database.ts va por detras del esquema real (no
// tiene es_superadmin ni las tablas nuevas). Mismo escape que usan los otros
// repos del proyecto; el contrato de verdad lo ponen los tipos de retorno.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

/**
 * Ban efectivamente permanente: 100 anos. GoTrue no acepta "para siempre", solo una
 * duracion, y usar algo corto convertiria una revocacion en una suspension con
 * fecha de vencimiento silenciosa.
 */
const BAN_PERMANENTE = '876000h'

/** Etapa en la que fallo una revocacion. La UI necesita saberlo para no mentir. */
export type EtapaAcceso = 'marcar' | 'sesiones' | 'bloqueo' | 'restaurar' | 'bloqueo_ip' | 'eliminar_cuenta'

/**
 * Error que sabe en que quedo la operacion.
 *
 * Existe porque revocar son tres pasos y fallar en el segundo no es lo mismo que
 * fallar en el primero: si `activo = false` ya se aplico pero las sesiones siguen
 * abiertas, la persona esta a medio revocar. Devolver un 500 generico dejaria al
 * administrador creyendo que no paso nada, cuando si paso -- a medias.
 */
export class ErrorAcceso extends Error {
  readonly etapa: EtapaAcceso
  readonly estado: string

  constructor(etapa: EtapaAcceso, estado: string, causa: string) {
    super(causa)
    this.name = 'ErrorAcceso'
    this.etapa = etapa
    this.estado = estado
  }
}

/** La persona ya estaba desvinculada: la API responde 409. */
export class YaDesvinculadoError extends Error {
  constructor() {
    super('Ya estaba desvinculado')
    this.name = 'YaDesvinculadoError'
  }
}

export class AccesoRepository {
  private admin: Admin

  constructor(admin: ReturnType<typeof createAdminClient>) {
    this.admin = admin as Admin
  }

  /**
   * Todo el equipo, activos e inactivos. A diferencia de `PermisosRepository.listEquipo()`,
   * aca NO se filtra por `activo`: los inactivos son justamente los que hay que poder
   * ver para restaurarlos. Una lista que los esconde deja el error sin arreglo.
   */
  async listEquipo(): Promise<IntegranteAcceso[]> {
    const { data, error } = await this.admin
      .from('dim_integrantes')
      .select(CAMPOS_ACCESO)
      .order('activo', { ascending: false })
      .order('nombre')
    if (error) throw new Error(error.message)
    return (data ?? []) as IntegranteAcceso[]
  }

  async getIntegrante(integranteId: string): Promise<IntegranteAcceso | null> {
    const { data, error } = await this.admin
      .from('dim_integrantes')
      .select(CAMPOS_ACCESO)
      .eq('id', integranteId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return (data as IntegranteAcceso) ?? null
  }

  /** Cuantos duenos activos hay ahora mismo. Se cuenta en la base, no en memoria. */
  async contarSuperadminsActivos(): Promise<number> {
    const { data, error } = await this.admin.rpc('contar_superadmins_activos')
    if (error) throw new Error(error.message)
    return Number(data ?? 0)
  }

  /**
   * Revoca de verdad: los tres pasos, en orden, y sin declarar exito a medias.
   *
   * El orden importa. Primero `activo = false` porque es lo que apaga la RLS y las
   * rutas de API: aunque los pasos siguientes fallaran, los datos ya quedan
   * cerrados. Despues se cierran las sesiones y por ultimo se bloquea el reingreso.
   *
   * Si el paso 2 o el 3 fallan se lanza `ErrorAcceso` con el estado real. El paso 1
   * NO se deshace: revertirlo devolveria el acceso a los datos a alguien que se
   * quiso echar. Ante la duda, la persona queda mas afuera, no mas adentro.
   */
  async revocar(integrante: IntegranteAcceso): Promise<number> {
    const { error: errorMarca } = await this.admin
      .from('dim_integrantes')
      .update({ activo: false })
      .eq('id', integrante.id)

    if (errorMarca) {
      throw new ErrorAcceso('marcar', 'No se cambio nada. La persona conserva su acceso.', errorMarca.message)
    }

    // Sin cuenta de Supabase asociada no hay sesion que cerrar ni a quien banear.
    // Pasa con integrantes creados por invitacion que nunca se registraron.
    if (!integrante.auth_user_id) return 0

    const { data: cerradas, error: errorSesiones } = await this.admin.rpc('revocar_sesiones_auth', {
      p_auth_user_id: integrante.auth_user_id,
    })

    if (errorSesiones) {
      throw new ErrorAcceso(
        'sesiones',
        'Se le quitaron los datos, pero su sesion abierta sigue viva y podria seguir navegando la app hasta que el token venza.',
        errorSesiones.message,
      )
    }

    const { error: errorBan } = await this.admin.auth.admin.updateUserById(integrante.auth_user_id, {
      ban_duration: BAN_PERMANENTE,
    })

    if (errorBan) {
      throw new ErrorAcceso(
        'bloqueo',
        'Se cerraron sus sesiones, pero puede volver a iniciar sesion. Reintenta la revocacion.',
        errorBan.message,
      )
    }

    return Number(cerradas ?? 0)
  }

  /**
   * Devuelve el acceso. Se levanta el ban ANTES de marcar activo: si fallara el
   * orden inverso, la persona figuraria como activa en la app pero no podria entrar,
   * que es el estado mas confuso posible -- nadie sabria donde mirar.
   */
  async restaurar(integrante: IntegranteAcceso): Promise<void> {
    if (integrante.auth_user_id) {
      const { error } = await this.admin.auth.admin.updateUserById(integrante.auth_user_id, {
        ban_duration: 'none',
      })
      if (error) {
        throw new ErrorAcceso('restaurar', 'Sigue sin acceso. No se cambio nada.', error.message)
      }
    }

    const { error } = await this.admin
      .from('dim_integrantes')
      .update({ activo: true })
      .eq('id', integrante.id)

    if (error) {
      throw new ErrorAcceso(
        'restaurar',
        'Ya puede iniciar sesion, pero sigue marcado como inactivo y no vera datos. Reintenta.',
        error.message,
      )
    }
  }

  async getPorAuthUser(authUserId: string): Promise<IntegranteAcceso | null> {
    const { data, error } = await this.admin.from('dim_integrantes').select(CAMPOS_ACCESO)
      .eq('auth_user_id', authUserId).maybeSingle()
    if (error) throw new Error(error.message)
    return (data as IntegranteAcceso) ?? null
  }

  async getDesvinculadoPorEmail(email: string): Promise<IntegranteAcceso | null> {
    const { data, error } = await this.admin.from('dim_integrantes').select(CAMPOS_ACCESO)
      .eq('email', email.trim().toLowerCase()).not('desvinculado_at', 'is', null).maybeSingle()
    if (error) throw new Error(error.message)
    return (data as IntegranteAcceso) ?? null
  }

  async ipsParaDesvincular(integranteId: string): Promise<IpCandidata[]> {
    const { data: ips, error } = await this.admin.rpc('ips_de_integrante', {
      p_integrante_id: integranteId,
      p_dias: 90,
    })
    if (error) throw new Error(error.message)
    const filas = (ips ?? []) as { ip: string; ultima_vez: string; origen: 'app' | 'sesion' }[]
    if (filas.length === 0) return []
    const { data: compartidas, error: errorCompartidas } = await this.admin.rpc('ips_compartidas', {
      p_ips: filas.map((fila) => fila.ip),
      p_excluir: integranteId,
      p_dias: 30,
    })
    if (errorCompartidas) throw new Error(errorCompartidas.message)
    const porIp = new Map<string, string[]>(
      ((compartidas ?? []) as { ip: string; integrantes: string[] }[]).map((fila) => [fila.ip, fila.integrantes]),
    )
    return filas.map((fila) => ({ ...fila, compartida_con: porIp.get(fila.ip) ?? [] }))
  }

  async desvincular(entrada: {
    integrante: IntegranteAcceso
    ips: string[]
    actor: { id: string; nombre: string; email: string }
    motivo?: string
  }): Promise<{ sesionesCerradas: number; ipsBloqueadas: string[] }> {
    const { integrante, actor } = entrada
    // `desvinculado_at is null`: la desvinculación es idempotente. Si ya estaba
    // desvinculado (aunque ya estuviera inactivo por una revocación previa) no se repite.
    const { data: marcadas, error: errorMarca } = await this.admin.from('dim_integrantes')
      .update({ activo: false, desvinculado_at: new Date().toISOString() })
      .eq('id', integrante.id).is('desvinculado_at', null).select('id')
    if (errorMarca) throw new ErrorAcceso('marcar', 'No se cambió nada.', errorMarca.message)
    if (!marcadas || marcadas.length === 0) throw new YaDesvinculadoError()

    let sesionesCerradas = 0
    let ipsBloqueadas: string[] = []
    try {
      const { data: bloqueadas, error: errorIps } = await this.admin.rpc('bloquear_ips', {
        p_ips: entrada.ips, p_integrante_id: integrante.id, p_actor_id: actor.id,
        p_motivo: entrada.motivo ?? null,
      })
      if (errorIps) throw new ErrorAcceso('bloqueo_ip', 'La persona quedó inactiva, pero no se bloquearon sus IPs.', errorIps.message)
      ipsBloqueadas = (bloqueadas ?? []) as string[]

      if (integrante.auth_user_id) {
        const { data, error } = await this.admin.rpc('revocar_sesiones_auth', { p_auth_user_id: integrante.auth_user_id })
        if (error) throw new ErrorAcceso('sesiones', 'La persona quedó inactiva y sus IPs bloqueadas, pero alguna sesión puede seguir viva.', error.message)
        sesionesCerradas = Number(data ?? 0)
        // Ban antes de borrar: si el borrado falla, la cuenta queda al menos baneada.
        const { error: errorBan } = await this.admin.auth.admin.updateUserById(integrante.auth_user_id, { ban_duration: BAN_PERMANENTE })
        if (errorBan) throw new ErrorAcceso('eliminar_cuenta', 'La persona quedó sin acceso y sus sesiones fueron cerradas, pero su cuenta Auth no se bloqueó ni se eliminó.', errorBan.message)
        const { error: eliminar } = await this.admin.auth.admin.deleteUser(integrante.auth_user_id)
        if (eliminar) throw new ErrorAcceso('eliminar_cuenta', 'La persona quedó sin acceso y sus sesiones fueron cerradas, pero su cuenta Auth no se eliminó (quedó bloqueada).', eliminar.message)
      }
    } catch (error) {
      // La persona ya está marcada como desvinculada: la bitácora debe reflejar
      // el hecho, incluso incompleto, o el rastro mentiría por omisión.
      const etapa = error instanceof ErrorAcceso ? error.etapa : 'desconocida'
      await this.registrar({ integrante, accion: 'desvinculado', actor,
        motivo: `INCOMPLETO en etapa ${etapa}${entrada.motivo ? ` — ${entrada.motivo}` : ''}`,
        sesionesCerradas, ipsBloqueadas })
      throw error
    }

    await this.registrar({ integrante, accion: 'desvinculado', actor, motivo: entrada.motivo,
      sesionesCerradas, ipsBloqueadas })
    return { sesionesCerradas, ipsBloqueadas }
  }

  async permitirReingreso(integrante: IntegranteAcceso, actor: { id: string; nombre: string; email: string }): Promise<void> {
    const { error } = await this.admin.from('dim_integrantes').update({ desvinculado_at: null }).eq('id', integrante.id)
    if (error) throw new ErrorAcceso('restaurar', 'La persona sigue desvinculada.', error.message)
    await this.registrar({ integrante, accion: 'reincorporable', actor, sesionesCerradas: 0 })
  }

  async listIpsBloqueadas(): Promise<IpBloqueada[]> {
    const { data, error } = await this.admin.from('ips_bloqueadas')
      .select('ip, integrante_id, motivo, created_at, dim_integrantes!ips_bloqueadas_integrante_fkey(nombre)')
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (data ?? []).map((fila: { ip: string; integrante_id: string | null; motivo: string | null; created_at: string; dim_integrantes: { nombre: string } | null }) => ({
      ip: fila.ip, integrante_id: fila.integrante_id,
      integrante_nombre: fila.dim_integrantes?.nombre ?? null,
      motivo: fila.motivo, created_at: fila.created_at,
    }))
  }

  async desbloquearIp(ip: string): Promise<void> {
    const { error } = await this.admin.from('ips_bloqueadas').delete().eq('ip', ip)
    if (error) throw new Error(error.message)
  }

  /**
   * Deja el rastro. Se llama despues de que la operacion salio bien, no antes:
   * una bitacora que registra intenciones en vez de hechos no sirve para responder
   * "que paso".
   */
  async registrar(entrada: {
    integrante: IntegranteAcceso
    accion: 'revocado' | 'restaurado' | 'desvinculado' | 'reincorporable'
    actor: { id: string; nombre: string; email: string }
    motivo?: string
    sesionesCerradas: number
    ipsBloqueadas?: string[]
  }): Promise<void> {
    // El fallo al escribir la bitacora NO tumba la revocacion: la persona ya esta
    // afuera y devolver un error haria que el administrador reintentara una accion
    // que ya surtio efecto. Se registra en el log del servidor y se sigue.
    const { error } = await this.admin.from('registro_accesos').insert({
      integrante_id: entrada.integrante.id,
      integrante_nombre: entrada.integrante.nombre,
      integrante_email: entrada.integrante.email,
      accion: entrada.accion,
      actor_id: entrada.actor.id,
      actor_nombre: entrada.actor.nombre,
      actor_email: entrada.actor.email,
      motivo: entrada.motivo ?? null,
      sesiones_cerradas: entrada.sesionesCerradas,
      ips_bloqueadas: entrada.ipsBloqueadas ?? null,
    })

    if (error) {
      console.error('[acceso] no se pudo escribir la bitacora:', error.message)
    }
  }
}
