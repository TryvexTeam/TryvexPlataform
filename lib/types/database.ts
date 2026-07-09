export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      dim_integrantes: {
        Row: {
          id: string
          auth_user_id: string | null
          nombre: string
          email: string
          rol_principal: string | null
          especialidad: string | null
          avatar_url: string | null
          activo: boolean
          color: string | null
          telefono: string | null
          horario: Json | null
          notificaciones: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          auth_user_id?: string | null
          nombre: string
          email: string
          rol_principal?: string | null
          especialidad?: string | null
          avatar_url?: string | null
          activo?: boolean
          color?: string | null
          telefono?: string | null
          horario?: Json | null
          notificaciones?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          auth_user_id?: string | null
          nombre?: string
          email?: string
          rol_principal?: string | null
          especialidad?: string | null
          avatar_url?: string | null
          activo?: boolean
          color?: string | null
          telefono?: string | null
          horario?: Json | null
          notificaciones?: Json | null
          created_at?: string
        }
      }
      dim_clientes: {
        Row: {
          id: string
          nombre_negocio: string | null
          nombre_contacto: string | null
          telefono: string | null
          email: string | null
          nicho: string | null
          localidad: string | null
          redes_sociales: Json | null
          fecha_cierre: string | null
          valor_inicial_usd: number | null
          mantencion_mensual_usd: number | null
          estado: 'activo' | 'pausado' | 'cancelado'
          notas: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          nombre_negocio?: string | null
          nombre_contacto?: string | null
          telefono?: string | null
          email?: string | null
          nicho?: string | null
          localidad?: string | null
          redes_sociales?: Json | null
          fecha_cierre?: string | null
          valor_inicial_usd?: number | null
          mantencion_mensual_usd?: number | null
          estado?: 'activo' | 'pausado' | 'cancelado'
          notas?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          nombre_negocio?: string | null
          nombre_contacto?: string | null
          telefono?: string | null
          email?: string | null
          nicho?: string | null
          localidad?: string | null
          redes_sociales?: Json | null
          fecha_cierre?: string | null
          valor_inicial_usd?: number | null
          mantencion_mensual_usd?: number | null
          estado?: 'activo' | 'pausado' | 'cancelado'
          notas?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      dim_proyectos: {
        Row: {
          id: string
          cliente_id: string | null
          nombre: string
          tipo: 'landing' | 'automatizacion' | 'mantencion' | 'otro'
          estado: 'brief' | 'desarrollo' | 'revision' | 'entregado' | 'mantencion' | 'cerrado'
          stack: string[] | null
          horas_estimadas: number | null
          horas_reales: number | null
          costo_total_usd: number | null
          url_deploy: string | null
          repo_url: string | null
          fecha_inicio: string | null
          fecha_entrega: string | null
          responsable_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          cliente_id?: string | null
          nombre: string
          tipo: 'landing' | 'automatizacion' | 'mantencion' | 'otro'
          estado?: 'brief' | 'desarrollo' | 'revision' | 'entregado' | 'mantencion' | 'cerrado'
          stack?: string[] | null
          horas_estimadas?: number | null
          horas_reales?: number | null
          costo_total_usd?: number | null
          url_deploy?: string | null
          repo_url?: string | null
          fecha_inicio?: string | null
          fecha_entrega?: string | null
          responsable_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          cliente_id?: string | null
          nombre?: string
          tipo?: 'landing' | 'automatizacion' | 'mantencion' | 'otro'
          estado?: 'brief' | 'desarrollo' | 'revision' | 'entregado' | 'mantencion' | 'cerrado'
          stack?: string[] | null
          horas_estimadas?: number | null
          horas_reales?: number | null
          costo_total_usd?: number | null
          url_deploy?: string | null
          repo_url?: string | null
          fecha_inicio?: string | null
          fecha_entrega?: string | null
          responsable_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      fact_leads: {
        Row: {
          id: string
          nombre_negocio: string
          telefono: string | null
          info_texto: string | null
          redes_sociales: Json | null
          tiene_web: boolean | null
          url_web: string | null
          nicho: string | null
          localidad: string | null
          score: number | null
          estado: 'sin_contactar' | 'contactado' | 'interesado' | 'reunion_agendada' | 'ganado' | 'perdido' | 'descartado'
          razon_perdida: 'precio' | 'sin_respuesta' | 'competencia' | 'sin_interes' | 'otro' | null
          responsable_id: string | null
          origen: 'scraper' | 'manual' | 'referido'
          ultimo_contacto: string | null
          notas: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          nombre_negocio: string
          telefono?: string | null
          info_texto?: string | null
          redes_sociales?: Json | null
          tiene_web?: boolean | null
          url_web?: string | null
          nicho?: string | null
          localidad?: string | null
          score?: number | null
          estado?: 'sin_contactar' | 'contactado' | 'interesado' | 'reunion_agendada' | 'ganado' | 'perdido' | 'descartado'
          razon_perdida?: 'precio' | 'sin_respuesta' | 'competencia' | 'sin_interes' | 'otro' | null
          responsable_id?: string | null
          origen?: 'scraper' | 'manual' | 'referido'
          ultimo_contacto?: string | null
          notas?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          nombre_negocio?: string
          telefono?: string | null
          info_texto?: string | null
          redes_sociales?: Json | null
          tiene_web?: boolean | null
          url_web?: string | null
          nicho?: string | null
          localidad?: string | null
          score?: number | null
          estado?: 'sin_contactar' | 'contactado' | 'interesado' | 'reunion_agendada' | 'ganado' | 'perdido' | 'descartado'
          razon_perdida?: 'precio' | 'sin_respuesta' | 'competencia' | 'sin_interes' | 'otro' | null
          responsable_id?: string | null
          origen?: 'scraper' | 'manual' | 'referido'
          ultimo_contacto?: string | null
          notas?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      fact_ventas: {
        Row: {
          id: string
          cliente_id: string | null
          proyecto_id: string | null
          tipo: 'inicial' | 'mantencion' | 'extra'
          monto_usd: number | null
          monto_clp: number | null
          estado_pago: 'pendiente' | 'pagado' | 'atrasado' | 'cancelado'
          fecha_emision: string | null
          fecha_pago: string | null
          fecha_vencimiento: string | null
          metodo_pago: 'mercadopago' | 'transferencia' | 'otro' | null
          referencia: string | null
          descripcion: string | null
          created_at: string
        }
        Insert: {
          id?: string
          cliente_id?: string | null
          proyecto_id?: string | null
          tipo: 'inicial' | 'mantencion' | 'extra'
          monto_usd?: number | null
          monto_clp?: number | null
          estado_pago?: 'pendiente' | 'pagado' | 'atrasado' | 'cancelado'
          fecha_emision?: string | null
          fecha_pago?: string | null
          fecha_vencimiento?: string | null
          metodo_pago?: 'mercadopago' | 'transferencia' | 'otro' | null
          referencia?: string | null
          descripcion?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          cliente_id?: string | null
          proyecto_id?: string | null
          tipo?: 'inicial' | 'mantencion' | 'extra'
          monto_usd?: number | null
          monto_clp?: number | null
          estado_pago?: 'pendiente' | 'pagado' | 'atrasado' | 'cancelado'
          fecha_emision?: string | null
          fecha_pago?: string | null
          fecha_vencimiento?: string | null
          metodo_pago?: 'mercadopago' | 'transferencia' | 'otro' | null
          referencia?: string | null
          descripcion?: string | null
          created_at?: string
        }
      }
      tareas: {
        Row: {
          id: string
          titulo: string
          descripcion: string | null
          tipo: 'error' | 'feature' | 'pulir' | 'general'
          estado: 'sin_empezar' | 'en_curso' | 'listo'
          prioridad: 'alta' | 'media' | 'baja'
          esfuerzo: 'pequeno' | 'medio' | 'grande'
          fecha_limite: string | null
          proyecto_id: string | null
          cliente_id: string | null
          created_by: string | null
          created_at: string
          updated_at: string
          completed_at: string | null
        }
        Insert: {
          id?: string
          titulo: string
          descripcion?: string | null
          tipo?: 'error' | 'feature' | 'pulir' | 'general'
          estado?: 'sin_empezar' | 'en_curso' | 'listo'
          prioridad?: 'alta' | 'media' | 'baja'
          esfuerzo?: 'pequeno' | 'medio' | 'grande'
          fecha_limite?: string | null
          proyecto_id?: string | null
          cliente_id?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
          completed_at?: string | null
        }
        Update: {
          id?: string
          titulo?: string
          descripcion?: string | null
          tipo?: 'error' | 'feature' | 'pulir' | 'general'
          estado?: 'sin_empezar' | 'en_curso' | 'listo'
          prioridad?: 'alta' | 'media' | 'baja'
          esfuerzo?: 'pequeno' | 'medio' | 'grande'
          fecha_limite?: string | null
          proyecto_id?: string | null
          cliente_id?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
          completed_at?: string | null
        }
      }
      tarea_responsables: {
        Row: { tarea_id: string; integrante_id: string }
        Insert: { tarea_id: string; integrante_id: string }
        Update: { tarea_id?: string; integrante_id?: string }
      }
      subtareas: {
        Row: {
          id: string
          tarea_id: string
          descripcion: string
          completada: boolean
          orden: number | null
          completed_at: string | null
        }
        Insert: {
          id?: string
          tarea_id: string
          descripcion: string
          completada?: boolean
          orden?: number | null
          completed_at?: string | null
        }
        Update: {
          id?: string
          tarea_id?: string
          descripcion?: string
          completada?: boolean
          orden?: number | null
          completed_at?: string | null
        }
      }
      interacciones_lead: {
        Row: {
          id: string
          lead_id: string
          integrante_id: string | null
          tipo: 'whatsapp' | 'llamada' | 'instagram' | 'meet' | 'email' | 'nota'
          contenido: string | null
          respondio: boolean | null
          created_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          integrante_id?: string | null
          tipo: 'whatsapp' | 'llamada' | 'instagram' | 'meet' | 'email' | 'nota'
          contenido?: string | null
          respondio?: boolean | null
          created_at?: string
        }
        Update: {
          id?: string
          lead_id?: string
          integrante_id?: string | null
          tipo?: 'whatsapp' | 'llamada' | 'instagram' | 'meet' | 'email' | 'nota'
          contenido?: string | null
          respondio?: boolean | null
          created_at?: string
        }
      }
      reuniones: {
        Row: {
          id: string
          lead_id: string | null
          cliente_id: string | null
          fecha: string
          duracion_min: number | null
          asistentes_ids: string[] | null
          url_fathom: string | null
          transcripcion: string | null
          resumen: string | null
          necesidades_extraidas: Json | null
          proximos_pasos: string | null
          created_at: string
        }
        Insert: {
          id?: string
          lead_id?: string | null
          cliente_id?: string | null
          fecha: string
          duracion_min?: number | null
          asistentes_ids?: string[] | null
          url_fathom?: string | null
          transcripcion?: string | null
          resumen?: string | null
          necesidades_extraidas?: Json | null
          proximos_pasos?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          lead_id?: string | null
          cliente_id?: string | null
          fecha?: string
          duracion_min?: number | null
          asistentes_ids?: string[] | null
          url_fathom?: string | null
          transcripcion?: string | null
          resumen?: string | null
          necesidades_extraidas?: Json | null
          proximos_pasos?: string | null
          created_at?: string
        }
      }
      cerebro_docs: {
        Row: {
          id: string
          slug: string
          titulo: string
          categoria: 'procesos' | 'playbook' | 'tecnico' | 'general'
          contenido_md: string | null
          icono: string | null
          orden: number | null
          created_by: string | null
          updated_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          slug: string
          titulo: string
          categoria: 'procesos' | 'playbook' | 'tecnico' | 'general'
          contenido_md?: string | null
          icono?: string | null
          orden?: number | null
          created_by?: string | null
          updated_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          slug?: string
          titulo?: string
          categoria?: 'procesos' | 'playbook' | 'tecnico' | 'general'
          contenido_md?: string | null
          icono?: string | null
          orden?: number | null
          created_by?: string | null
          updated_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      actividad: {
        Row: {
          id: string
          integrante_id: string | null
          tipo_evento: string
          referencia_id: string | null
          referencia_tipo: 'lead' | 'tarea' | 'proyecto' | 'cliente' | 'reunion' | 'venta' | null
          descripcion: string | null
          created_at: string
        }
        Insert: {
          id?: string
          integrante_id?: string | null
          tipo_evento: string
          referencia_id?: string | null
          referencia_tipo?: 'lead' | 'tarea' | 'proyecto' | 'cliente' | 'reunion' | 'venta' | null
          descripcion?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          integrante_id?: string | null
          tipo_evento?: string
          referencia_id?: string | null
          referencia_tipo?: 'lead' | 'tarea' | 'proyecto' | 'cliente' | 'reunion' | 'venta' | null
          descripcion?: string | null
          created_at?: string
        }
      }
    }
    Views: Record<string, never>
    Functions: {
      is_integrante: {
        Args: Record<string, never>
        Returns: boolean
      }
    }
    Enums: Record<string, never>
  }
}
