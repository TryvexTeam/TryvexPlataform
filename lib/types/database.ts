/**
 * Tipos de la base, generados desde el esquema real.
 *
 * NO editar a mano: se regenera con `node scripts/generar-tipos-db.mjs`.
 *
 * La versión anterior de este archivo cubría 12 de las 48 relaciones, y los
 * repositorios la esquivaban con `type SB = any`, así que TypeScript no
 * validaba ninguna consulta: pedir una columna inexistente compilaba. No es
 * hipotético — `convertirEnCliente` pedía `nombre_contacto` y `email` a
 * `fact_leads` sin que existieran, y salió en producción como 42703 al marcar
 * un lead como ganado.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      actividad: {
        Row: {
          id: string
          integrante_id: string | null
          tipo_evento: string
          referencia_id: string | null
          referencia_tipo: string | null
          descripcion: string | null
          created_at: string
        }
        Insert: {
          id?: string
          integrante_id?: string | null
          tipo_evento: string
          referencia_id?: string | null
          referencia_tipo?: string | null
          descripcion?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          integrante_id?: string | null
          tipo_evento?: string
          referencia_id?: string | null
          referencia_tipo?: string | null
          descripcion?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'actividad_integrante_id_fkey'
            columns: ['integrante_id']
            isOneToOne: false
            referencedRelation: 'dim_integrantes'
            referencedColumns: ['id']
          }
        ]
      }
      agentes: {
        Row: {
          id: string
          nombre: string
          descripcion: string | null
          color: string | null
          avatar_url: string | null
          token_hash: string
          activo: boolean
          ultimo_uso_at: string | null
          creado_por: string | null
          created_at: string
          expira_at: string | null
        }
        Insert: {
          id?: string
          nombre: string
          descripcion?: string | null
          color?: string | null
          avatar_url?: string | null
          token_hash: string
          activo?: boolean
          ultimo_uso_at?: string | null
          creado_por?: string | null
          created_at?: string
          expira_at?: string | null
        }
        Update: {
          id?: string
          nombre?: string
          descripcion?: string | null
          color?: string | null
          avatar_url?: string | null
          token_hash?: string
          activo?: boolean
          ultimo_uso_at?: string | null
          creado_por?: string | null
          created_at?: string
          expira_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'agentes_creado_por_fkey'
            columns: ['creado_por']
            isOneToOne: false
            referencedRelation: 'dim_integrantes'
            referencedColumns: ['id']
          }
        ]
      }
      cerebro_docs: {
        Row: {
          id: string
          slug: string
          titulo: string
          categoria: string
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
          categoria?: string
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
          categoria?: string
          contenido_md?: string | null
          icono?: string | null
          orden?: number | null
          created_by?: string | null
          updated_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'cerebro_docs_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'dim_integrantes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'cerebro_docs_updated_by_fkey'
            columns: ['updated_by']
            isOneToOne: false
            referencedRelation: 'dim_integrantes'
            referencedColumns: ['id']
          }
        ]
      }
      cerebro_entradas: {
        Row: {
          id: string
          entidad_tipo: string
          entidad_id: string | null
          fuente: string
          titulo: string
          contenido: string | null
          autor_id: string | null
          ocurrio_at: string
          metadata: Json
          origen_tabla: string | null
          origen_id: string | null
          busqueda: string | null
          created_at: string
          origen_ref: string | null
          autor_externo: string | null
        }
        Insert: {
          id?: string
          entidad_tipo: string
          entidad_id?: string | null
          fuente: string
          titulo: string
          contenido?: string | null
          autor_id?: string | null
          ocurrio_at?: string
          metadata?: Json
          origen_tabla?: string | null
          origen_id?: string | null
          busqueda?: string | null
          created_at?: string
          origen_ref?: string | null
          autor_externo?: string | null
        }
        Update: {
          id?: string
          entidad_tipo?: string
          entidad_id?: string | null
          fuente?: string
          titulo?: string
          contenido?: string | null
          autor_id?: string | null
          ocurrio_at?: string
          metadata?: Json
          origen_tabla?: string | null
          origen_id?: string | null
          busqueda?: string | null
          created_at?: string
          origen_ref?: string | null
          autor_externo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'cerebro_entradas_autor_id_fkey'
            columns: ['autor_id']
            isOneToOne: false
            referencedRelation: 'dim_integrantes'
            referencedColumns: ['id']
          }
        ]
      }
      conversacion_miembros: {
        Row: {
          conversacion_id: string
          integrante_id: string
          ultimo_leido_at: string
          created_at: string
        }
        Insert: {
          conversacion_id: string
          integrante_id: string
          ultimo_leido_at?: string
          created_at?: string
        }
        Update: {
          conversacion_id?: string
          integrante_id?: string
          ultimo_leido_at?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'conversacion_miembros_conversacion_id_fkey'
            columns: ['conversacion_id']
            isOneToOne: false
            referencedRelation: 'conversaciones'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'conversacion_miembros_integrante_id_fkey'
            columns: ['integrante_id']
            isOneToOne: false
            referencedRelation: 'dim_integrantes'
            referencedColumns: ['id']
          }
        ]
      }
      conversaciones: {
        Row: {
          id: string
          tipo: string
          nombre: string | null
          dm_key: string | null
          creada_por: string | null
          created_at: string
          ultimo_mensaje_at: string
          avatar_url: string | null
        }
        Insert: {
          id?: string
          tipo: string
          nombre?: string | null
          dm_key?: string | null
          creada_por?: string | null
          created_at?: string
          ultimo_mensaje_at?: string
          avatar_url?: string | null
        }
        Update: {
          id?: string
          tipo?: string
          nombre?: string | null
          dm_key?: string | null
          creada_por?: string | null
          created_at?: string
          ultimo_mensaje_at?: string
          avatar_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'conversaciones_creada_por_fkey'
            columns: ['creada_por']
            isOneToOne: false
            referencedRelation: 'dim_integrantes'
            referencedColumns: ['id']
          }
        ]
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
          estado: string
          notas: string | null
          created_at: string
          updated_at: string
          saldo_inicial_saldado: boolean
          lead_id: string | null
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
          estado?: string
          notas?: string | null
          created_at?: string
          updated_at?: string
          saldo_inicial_saldado?: boolean
          lead_id?: string | null
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
          estado?: string
          notas?: string | null
          created_at?: string
          updated_at?: string
          saldo_inicial_saldado?: boolean
          lead_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'dim_clientes_lead_id_fkey'
            columns: ['lead_id']
            isOneToOne: false
            referencedRelation: 'fact_leads'
            referencedColumns: ['id']
          }
        ]
      }
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
          created_at: string
          color: string | null
          telefono: string | null
          horario: Json | null
          notificaciones: Json | null
          es_admin: boolean
          es_superadmin: boolean
          ver_jornadas_equipo: boolean
          ver_finanzas: boolean
          gestionar_finanzas: boolean
          bio_corta: string | null
          bio: string | null
          linkedin: string | null
          portfolio: string | null
          category: string
          visible_en_landing: boolean
          foto_landing_url: string | null
          recibe_citas: boolean
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
          created_at?: string
          color?: string | null
          telefono?: string | null
          horario?: Json | null
          notificaciones?: Json | null
          es_admin?: boolean
          es_superadmin?: boolean
          ver_jornadas_equipo?: boolean
          ver_finanzas?: boolean
          gestionar_finanzas?: boolean
          bio_corta?: string | null
          bio?: string | null
          linkedin?: string | null
          portfolio?: string | null
          category?: string
          visible_en_landing?: boolean
          foto_landing_url?: string | null
          recibe_citas?: boolean
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
          created_at?: string
          color?: string | null
          telefono?: string | null
          horario?: Json | null
          notificaciones?: Json | null
          es_admin?: boolean
          es_superadmin?: boolean
          ver_jornadas_equipo?: boolean
          ver_finanzas?: boolean
          gestionar_finanzas?: boolean
          bio_corta?: string | null
          bio?: string | null
          linkedin?: string | null
          portfolio?: string | null
          category?: string
          visible_en_landing?: boolean
          foto_landing_url?: string | null
          recibe_citas?: boolean
        }
        Relationships: []
      }
      dim_proyectos: {
        Row: {
          id: string
          cliente_id: string | null
          nombre: string
          tipo: string
          estado: string
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
          servicios_ids: string[]
        }
        Insert: {
          id?: string
          cliente_id?: string | null
          nombre: string
          tipo: string
          estado?: string
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
          servicios_ids?: string[]
        }
        Update: {
          id?: string
          cliente_id?: string | null
          nombre?: string
          tipo?: string
          estado?: string
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
          servicios_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: 'dim_proyectos_cliente_id_fkey'
            columns: ['cliente_id']
            isOneToOne: false
            referencedRelation: 'dim_clientes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'dim_proyectos_responsable_id_fkey'
            columns: ['responsable_id']
            isOneToOne: false
            referencedRelation: 'dim_integrantes'
            referencedColumns: ['id']
          }
        ]
      }
      disponibilidad: {
        Row: {
          id: string
          integrante_id: string
          dia_semana: number
          hora: number
          created_at: string
          publica: boolean
        }
        Insert: {
          id?: string
          integrante_id: string
          dia_semana: number
          hora: number
          created_at?: string
          publica?: boolean
        }
        Update: {
          id?: string
          integrante_id?: string
          dia_semana?: number
          hora?: number
          created_at?: string
          publica?: boolean
        }
        Relationships: [
          {
            foreignKeyName: 'disponibilidad_integrante_id_fkey'
            columns: ['integrante_id']
            isOneToOne: false
            referencedRelation: 'dim_integrantes'
            referencedColumns: ['id']
          }
        ]
      }
      eventos: {
        Row: {
          id: string
          titulo: string
          tipo: string
          inicio: string
          fin: string
          lead_id: string | null
          cliente_id: string | null
          creado_por: string | null
          notas: string | null
          created_at: string
          google_event_id: string | null
          origen: string
          meet_link: string | null
          ubicacion: string | null
          html_link: string | null
          asistentes_externos: Json
        }
        Insert: {
          id?: string
          titulo: string
          tipo?: string
          inicio: string
          fin: string
          lead_id?: string | null
          cliente_id?: string | null
          creado_por?: string | null
          notas?: string | null
          created_at?: string
          google_event_id?: string | null
          origen?: string
          meet_link?: string | null
          ubicacion?: string | null
          html_link?: string | null
          asistentes_externos?: Json
        }
        Update: {
          id?: string
          titulo?: string
          tipo?: string
          inicio?: string
          fin?: string
          lead_id?: string | null
          cliente_id?: string | null
          creado_por?: string | null
          notas?: string | null
          created_at?: string
          google_event_id?: string | null
          origen?: string
          meet_link?: string | null
          ubicacion?: string | null
          html_link?: string | null
          asistentes_externos?: Json
        }
        Relationships: [
          {
            foreignKeyName: 'eventos_lead_id_fkey'
            columns: ['lead_id']
            isOneToOne: false
            referencedRelation: 'fact_leads'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'eventos_cliente_id_fkey'
            columns: ['cliente_id']
            isOneToOne: false
            referencedRelation: 'dim_clientes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'eventos_creado_por_fkey'
            columns: ['creado_por']
            isOneToOne: false
            referencedRelation: 'dim_integrantes'
            referencedColumns: ['id']
          }
        ]
      }
      eventos_asistentes: {
        Row: {
          evento_id: string
          integrante_id: string
          rol: string
          asignado_por: string | null
          created_at: string
        }
        Insert: {
          evento_id: string
          integrante_id: string
          rol?: string
          asignado_por?: string | null
          created_at?: string
        }
        Update: {
          evento_id?: string
          integrante_id?: string
          rol?: string
          asignado_por?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'eventos_asistentes_evento_id_fkey'
            columns: ['evento_id']
            isOneToOne: false
            referencedRelation: 'eventos'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'eventos_asistentes_integrante_id_fkey'
            columns: ['integrante_id']
            isOneToOne: false
            referencedRelation: 'dim_integrantes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'eventos_asistentes_asignado_por_fkey'
            columns: ['asignado_por']
            isOneToOne: false
            referencedRelation: 'dim_integrantes'
            referencedColumns: ['id']
          }
        ]
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
          estado: string
          responsable_id: string | null
          origen: string
          ultimo_contacto: string | null
          notas: string | null
          created_at: string
          updated_at: string
          razon_perdida: string | null
          wa_leido_hasta: string | null
          google_rating: number | null
          google_resenas: number | null
          horario: string | null
          instagram: string | null
          google_place_id: string | null
          categoria_google: string | null
          email: string | null
          nombre_contacto: string | null
          pitch: Json | null
          // Migración 092. Agregado a mano porque este archivo se regenera
          // con scripts/generar-tipos-db.mjs contra la base real, y no hay
          // credenciales disponibles en este entorno para correrlo — alguien
          // con acceso debería regenerarlo cuando pueda, esto es un parche.
          ultima_llamada_respondio: boolean | null
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
          estado?: string
          responsable_id?: string | null
          origen?: string
          ultimo_contacto?: string | null
          notas?: string | null
          created_at?: string
          updated_at?: string
          razon_perdida?: string | null
          wa_leido_hasta?: string | null
          google_rating?: number | null
          google_resenas?: number | null
          horario?: string | null
          instagram?: string | null
          google_place_id?: string | null
          categoria_google?: string | null
          email?: string | null
          nombre_contacto?: string | null
          pitch?: Json | null
          ultima_llamada_respondio?: boolean | null
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
          estado?: string
          responsable_id?: string | null
          origen?: string
          ultimo_contacto?: string | null
          notas?: string | null
          created_at?: string
          updated_at?: string
          razon_perdida?: string | null
          wa_leido_hasta?: string | null
          google_rating?: number | null
          google_resenas?: number | null
          horario?: string | null
          instagram?: string | null
          google_place_id?: string | null
          categoria_google?: string | null
          email?: string | null
          nombre_contacto?: string | null
          pitch?: Json | null
          ultima_llamada_respondio?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: 'fact_leads_responsable_id_fkey'
            columns: ['responsable_id']
            isOneToOne: false
            referencedRelation: 'dim_integrantes'
            referencedColumns: ['id']
          }
        ]
      }
      fact_ventas: {
        Row: {
          id: string
          cliente_id: string | null
          proyecto_id: string | null
          tipo: string
          monto_usd: number | null
          monto_clp: number | null
          estado_pago: string
          fecha_emision: string | null
          fecha_pago: string | null
          metodo_pago: string | null
          referencia: string | null
          created_at: string
          fecha_vencimiento: string | null
          descripcion: string | null
        }
        Insert: {
          id?: string
          cliente_id?: string | null
          proyecto_id?: string | null
          tipo: string
          monto_usd?: number | null
          monto_clp?: number | null
          estado_pago?: string
          fecha_emision?: string | null
          fecha_pago?: string | null
          metodo_pago?: string | null
          referencia?: string | null
          created_at?: string
          fecha_vencimiento?: string | null
          descripcion?: string | null
        }
        Update: {
          id?: string
          cliente_id?: string | null
          proyecto_id?: string | null
          tipo?: string
          monto_usd?: number | null
          monto_clp?: number | null
          estado_pago?: string
          fecha_emision?: string | null
          fecha_pago?: string | null
          metodo_pago?: string | null
          referencia?: string | null
          created_at?: string
          fecha_vencimiento?: string | null
          descripcion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'fact_ventas_cliente_id_fkey'
            columns: ['cliente_id']
            isOneToOne: false
            referencedRelation: 'dim_clientes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'fact_ventas_proyecto_id_fkey'
            columns: ['proyecto_id']
            isOneToOne: false
            referencedRelation: 'dim_proyectos'
            referencedColumns: ['id']
          }
        ]
      }
      google_sync_state: {
        Row: {
          id: string
          calendar_id: string
          sync_token: string | null
          channel_id: string | null
          resource_id: string | null
          channel_expiration: string | null
          last_sync_at: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          calendar_id: string
          sync_token?: string | null
          channel_id?: string | null
          resource_id?: string | null
          channel_expiration?: string | null
          last_sync_at?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          calendar_id?: string
          sync_token?: string | null
          channel_id?: string | null
          resource_id?: string | null
          channel_expiration?: string | null
          last_sync_at?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      interacciones_lead: {
        Row: {
          id: string
          lead_id: string
          integrante_id: string | null
          tipo: string
          contenido: string | null
          respondio: boolean | null
          created_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          integrante_id?: string | null
          tipo: string
          contenido?: string | null
          respondio?: boolean | null
          created_at?: string
        }
        Update: {
          id?: string
          lead_id?: string
          integrante_id?: string | null
          tipo?: string
          contenido?: string | null
          respondio?: boolean | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'interacciones_lead_lead_id_fkey'
            columns: ['lead_id']
            isOneToOne: false
            referencedRelation: 'fact_leads'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'interacciones_lead_integrante_id_fkey'
            columns: ['integrante_id']
            isOneToOne: false
            referencedRelation: 'dim_integrantes'
            referencedColumns: ['id']
          }
        ]
      }
      invitaciones: {
        Row: {
          id: string
          email: string
          token_hash: string
          invited_by_id: string
          expires_at: string
          used_at: string | null
          created_at: string | null
          aprobado_at: string | null
          aprobado_por: string | null
        }
        Insert: {
          id?: string
          email: string
          token_hash: string
          invited_by_id: string
          expires_at: string
          used_at?: string | null
          created_at?: string | null
          aprobado_at?: string | null
          aprobado_por?: string | null
        }
        Update: {
          id?: string
          email?: string
          token_hash?: string
          invited_by_id?: string
          expires_at?: string
          used_at?: string | null
          created_at?: string | null
          aprobado_at?: string | null
          aprobado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'invitaciones_invited_by_id_fkey'
            columns: ['invited_by_id']
            isOneToOne: false
            referencedRelation: 'dim_integrantes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'invitaciones_aprobado_por_fkey'
            columns: ['aprobado_por']
            isOneToOne: false
            referencedRelation: 'dim_integrantes'
            referencedColumns: ['id']
          }
        ]
      }
      jornadas: {
        Row: {
          id: string
          integrante_id: string
          entrada_at: string
          salida_at: string | null
          pausas: Json
          nota: string | null
          origen: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          integrante_id: string
          entrada_at?: string
          salida_at?: string | null
          pausas?: Json
          nota?: string | null
          origen?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          integrante_id?: string
          entrada_at?: string
          salida_at?: string | null
          pausas?: Json
          nota?: string | null
          origen?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'jornadas_integrante_id_fkey'
            columns: ['integrante_id']
            isOneToOne: false
            referencedRelation: 'dim_integrantes'
            referencedColumns: ['id']
          }
        ]
      }
      knowledge_chunks: {
        Row: {
          id: string
          source: string
          referencia_id: string | null
          titulo: string | null
          contenido: string
          embedding: string | null
          prioridad: number
          created_at: string
        }
        Insert: {
          id?: string
          source: string
          referencia_id?: string | null
          titulo?: string | null
          contenido: string
          embedding?: string | null
          prioridad?: number
          created_at?: string
        }
        Update: {
          id?: string
          source?: string
          referencia_id?: string | null
          titulo?: string | null
          contenido?: string
          embedding?: string | null
          prioridad?: number
          created_at?: string
        }
        Relationships: []
      }
      lead_asignaciones: {
        Row: {
          lead_id: string
          integrante_id: string
          rol: string
          asignado_por: string | null
          created_at: string
        }
        Insert: {
          lead_id: string
          integrante_id: string
          rol?: string
          asignado_por?: string | null
          created_at?: string
        }
        Update: {
          lead_id?: string
          integrante_id?: string
          rol?: string
          asignado_por?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'lead_asignaciones_lead_id_fkey'
            columns: ['lead_id']
            isOneToOne: false
            referencedRelation: 'fact_leads'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'lead_asignaciones_integrante_id_fkey'
            columns: ['integrante_id']
            isOneToOne: false
            referencedRelation: 'dim_integrantes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'lead_asignaciones_asignado_por_fkey'
            columns: ['asignado_por']
            isOneToOne: false
            referencedRelation: 'dim_integrantes'
            referencedColumns: ['id']
          }
        ]
      }
      llamada_participantes: {
        Row: {
          llamada_id: string
          integrante_id: string
          estado: string
          entro_at: string | null
          salio_at: string | null
          via_relay: boolean | null
          segundos: number | null
        }
        Insert: {
          llamada_id: string
          integrante_id: string
          estado?: string
          entro_at?: string | null
          salio_at?: string | null
          via_relay?: boolean | null
          segundos?: number | null
        }
        Update: {
          llamada_id?: string
          integrante_id?: string
          estado?: string
          entro_at?: string | null
          salio_at?: string | null
          via_relay?: boolean | null
          segundos?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'llamada_participantes_llamada_id_fkey'
            columns: ['llamada_id']
            isOneToOne: false
            referencedRelation: 'llamadas'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'llamada_participantes_integrante_id_fkey'
            columns: ['integrante_id']
            isOneToOne: false
            referencedRelation: 'dim_integrantes'
            referencedColumns: ['id']
          }
        ]
      }
      llamadas: {
        Row: {
          id: string
          conversacion_id: string
          iniciada_por: string
          estado: string
          con_video: boolean
          created_at: string
          contestada_at: string | null
          terminada_at: string | null
          motivo_fin: string | null
        }
        Insert: {
          id?: string
          conversacion_id: string
          iniciada_por: string
          estado?: string
          con_video?: boolean
          created_at?: string
          contestada_at?: string | null
          terminada_at?: string | null
          motivo_fin?: string | null
        }
        Update: {
          id?: string
          conversacion_id?: string
          iniciada_por?: string
          estado?: string
          con_video?: boolean
          created_at?: string
          contestada_at?: string | null
          terminada_at?: string | null
          motivo_fin?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'llamadas_conversacion_id_fkey'
            columns: ['conversacion_id']
            isOneToOne: false
            referencedRelation: 'conversaciones'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'llamadas_iniciada_por_fkey'
            columns: ['iniciada_por']
            isOneToOne: false
            referencedRelation: 'dim_integrantes'
            referencedColumns: ['id']
          }
        ]
      }
      mensaje_adjuntos: {
        Row: {
          id: string
          mensaje_id: string
          ruta: string
          nombre: string
          tipo_mime: string
          bytes: number
          ancho: number | null
          alto: number | null
          created_at: string
        }
        Insert: {
          id?: string
          mensaje_id: string
          ruta: string
          nombre: string
          tipo_mime: string
          bytes: number
          ancho?: number | null
          alto?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          mensaje_id?: string
          ruta?: string
          nombre?: string
          tipo_mime?: string
          bytes?: number
          ancho?: number | null
          alto?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'mensaje_adjuntos_mensaje_id_fkey'
            columns: ['mensaje_id']
            isOneToOne: false
            referencedRelation: 'mensajes'
            referencedColumns: ['id']
          }
        ]
      }
      mensaje_reacciones: {
        Row: {
          id: string
          mensaje_id: string
          integrante_id: string | null
          agente_id: string | null
          emoji: string
          created_at: string
        }
        Insert: {
          id?: string
          mensaje_id: string
          integrante_id?: string | null
          agente_id?: string | null
          emoji: string
          created_at?: string
        }
        Update: {
          id?: string
          mensaje_id?: string
          integrante_id?: string | null
          agente_id?: string | null
          emoji?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'mensaje_reacciones_mensaje_id_fkey'
            columns: ['mensaje_id']
            isOneToOne: false
            referencedRelation: 'mensajes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'mensaje_reacciones_integrante_id_fkey'
            columns: ['integrante_id']
            isOneToOne: false
            referencedRelation: 'dim_integrantes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'mensaje_reacciones_agente_id_fkey'
            columns: ['agente_id']
            isOneToOne: false
            referencedRelation: 'agentes'
            referencedColumns: ['id']
          }
        ]
      }
      mensajes: {
        Row: {
          id: string
          conversacion_id: string
          autor_id: string | null
          contenido: string | null
          editado_at: string | null
          eliminado_at: string | null
          created_at: string
          agente_id: string | null
          responder_a: string | null
          hilo_padre: string | null
          origen_ref: string | null
          fijado_at: string | null
          fijado_por: string | null
        }
        Insert: {
          id?: string
          conversacion_id: string
          autor_id?: string | null
          contenido?: string | null
          editado_at?: string | null
          eliminado_at?: string | null
          created_at?: string
          agente_id?: string | null
          responder_a?: string | null
          hilo_padre?: string | null
          origen_ref?: string | null
          fijado_at?: string | null
          fijado_por?: string | null
        }
        Update: {
          id?: string
          conversacion_id?: string
          autor_id?: string | null
          contenido?: string | null
          editado_at?: string | null
          eliminado_at?: string | null
          created_at?: string
          agente_id?: string | null
          responder_a?: string | null
          hilo_padre?: string | null
          origen_ref?: string | null
          fijado_at?: string | null
          fijado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'mensajes_conversacion_id_fkey'
            columns: ['conversacion_id']
            isOneToOne: false
            referencedRelation: 'conversaciones'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'mensajes_autor_id_fkey'
            columns: ['autor_id']
            isOneToOne: false
            referencedRelation: 'dim_integrantes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'mensajes_agente_id_fkey'
            columns: ['agente_id']
            isOneToOne: false
            referencedRelation: 'agentes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'mensajes_responder_a_fkey'
            columns: ['responder_a']
            isOneToOne: false
            referencedRelation: 'mensajes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'mensajes_hilo_padre_fkey'
            columns: ['hilo_padre']
            isOneToOne: false
            referencedRelation: 'mensajes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'mensajes_fijado_por_fkey'
            columns: ['fijado_por']
            isOneToOne: false
            referencedRelation: 'dim_integrantes'
            referencedColumns: ['id']
          }
        ]
      }
      mensajes_wa: {
        Row: {
          id: string
          lead_id: string | null
          cliente_id: string | null
          direccion: string
          texto: string
          wa_message_id: string | null
          chip_id: string | null
          es_bot: boolean
          created_at: string
          enviado_por: string | null
          estado_envio: string | null
          integrante_id: string | null
        }
        Insert: {
          id?: string
          lead_id?: string | null
          cliente_id?: string | null
          direccion: string
          texto: string
          wa_message_id?: string | null
          chip_id?: string | null
          es_bot?: boolean
          created_at?: string
          enviado_por?: string | null
          estado_envio?: string | null
          integrante_id?: string | null
        }
        Update: {
          id?: string
          lead_id?: string | null
          cliente_id?: string | null
          direccion?: string
          texto?: string
          wa_message_id?: string | null
          chip_id?: string | null
          es_bot?: boolean
          created_at?: string
          enviado_por?: string | null
          estado_envio?: string | null
          integrante_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'mensajes_wa_lead_id_fkey'
            columns: ['lead_id']
            isOneToOne: false
            referencedRelation: 'fact_leads'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'mensajes_wa_cliente_id_fkey'
            columns: ['cliente_id']
            isOneToOne: false
            referencedRelation: 'dim_clientes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'mensajes_wa_integrante_id_fkey'
            columns: ['integrante_id']
            isOneToOne: false
            referencedRelation: 'dim_integrantes'
            referencedColumns: ['id']
          }
        ]
      }
      movimientos_financieros: {
        Row: {
          id: string
          tipo: string
          categoria: string
          descripcion: string
          monto_clp: number
          monto_usd: number | null
          fecha: string
          metodo_pago: string | null
          contraparte: string | null
          cliente_id: string | null
          proyecto_id: string | null
          venta_id: string | null
          voucher_path: string | null
          voucher_nombre: string | null
          notas: string | null
          creado_por: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tipo: string
          categoria: string
          descripcion: string
          monto_clp: number
          monto_usd?: number | null
          fecha?: string
          metodo_pago?: string | null
          contraparte?: string | null
          cliente_id?: string | null
          proyecto_id?: string | null
          venta_id?: string | null
          voucher_path?: string | null
          voucher_nombre?: string | null
          notas?: string | null
          creado_por?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tipo?: string
          categoria?: string
          descripcion?: string
          monto_clp?: number
          monto_usd?: number | null
          fecha?: string
          metodo_pago?: string | null
          contraparte?: string | null
          cliente_id?: string | null
          proyecto_id?: string | null
          venta_id?: string | null
          voucher_path?: string | null
          voucher_nombre?: string | null
          notas?: string | null
          creado_por?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'movimientos_financieros_cliente_id_fkey'
            columns: ['cliente_id']
            isOneToOne: false
            referencedRelation: 'dim_clientes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'movimientos_financieros_proyecto_id_fkey'
            columns: ['proyecto_id']
            isOneToOne: false
            referencedRelation: 'dim_proyectos'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'movimientos_financieros_venta_id_fkey'
            columns: ['venta_id']
            isOneToOne: false
            referencedRelation: 'fact_ventas'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'movimientos_financieros_creado_por_fkey'
            columns: ['creado_por']
            isOneToOne: false
            referencedRelation: 'dim_integrantes'
            referencedColumns: ['id']
          }
        ]
      }
      musica_busquedas: {
        Row: {
          consulta: string
          resultados: Json
          created_at: string
        }
        Insert: {
          consulta: string
          resultados?: Json
          created_at?: string
        }
        Update: {
          consulta?: string
          resultados?: Json
          created_at?: string
        }
        Relationships: []
      }
      notificaciones: {
        Row: {
          id: string
          integrante_id: string
          tipo: string
          titulo: string
          cuerpo: string | null
          link: string | null
          leida: boolean
          created_at: string
        }
        Insert: {
          id?: string
          integrante_id: string
          tipo: string
          titulo: string
          cuerpo?: string | null
          link?: string | null
          leida?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          integrante_id?: string
          tipo?: string
          titulo?: string
          cuerpo?: string | null
          link?: string | null
          leida?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'notificaciones_integrante_id_fkey'
            columns: ['integrante_id']
            isOneToOne: false
            referencedRelation: 'dim_integrantes'
            referencedColumns: ['id']
          }
        ]
      }
      outreach_messages: {
        Row: {
          id: string
          lead_id: string
          canal: string
          texto: string
          estado: string
          aprobado_por: string | null
          wa_message_id: string | null
          error: string | null
          created_at: string
          enviado_at: string | null
          enviado_por: string | null
          integrante_id: string | null
        }
        Insert: {
          id?: string
          lead_id: string
          canal: string
          texto: string
          estado?: string
          aprobado_por?: string | null
          wa_message_id?: string | null
          error?: string | null
          created_at?: string
          enviado_at?: string | null
          enviado_por?: string | null
          integrante_id?: string | null
        }
        Update: {
          id?: string
          lead_id?: string
          canal?: string
          texto?: string
          estado?: string
          aprobado_por?: string | null
          wa_message_id?: string | null
          error?: string | null
          created_at?: string
          enviado_at?: string | null
          enviado_por?: string | null
          integrante_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'outreach_messages_lead_id_fkey'
            columns: ['lead_id']
            isOneToOne: false
            referencedRelation: 'fact_leads'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'outreach_messages_aprobado_por_fkey'
            columns: ['aprobado_por']
            isOneToOne: false
            referencedRelation: 'dim_integrantes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'outreach_messages_integrante_id_fkey'
            columns: ['integrante_id']
            isOneToOne: false
            referencedRelation: 'dim_integrantes'
            referencedColumns: ['id']
          }
        ]
      }
      intentos_reserva_publica: {
        Row: {
          id: string
          ip: string
          creado_at: string
        }
        Insert: {
          id?: string
          ip: string
          creado_at?: string
        }
        Update: {
          id?: string
          ip?: string
          creado_at?: string
        }
        Relationships: []
      }
      password_reset_intentos: {
        Row: {
          id: string
          email: string
          ip: string | null
          created_at: string
        }
        Insert: {
          id?: string
          email: string
          ip?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          ip?: string | null
          created_at?: string
        }
        Relationships: []
      }
      proyecto_integrantes: {
        Row: {
          proyecto_id: string
          integrante_id: string
          created_at: string
        }
        Insert: {
          proyecto_id: string
          integrante_id: string
          created_at?: string
        }
        Update: {
          proyecto_id?: string
          integrante_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'proyecto_integrantes_proyecto_id_fkey'
            columns: ['proyecto_id']
            isOneToOne: false
            referencedRelation: 'dim_proyectos'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'proyecto_integrantes_integrante_id_fkey'
            columns: ['integrante_id']
            isOneToOne: false
            referencedRelation: 'dim_integrantes'
            referencedColumns: ['id']
          }
        ]
      }
      push_subscriptions: {
        Row: {
          id: string
          integrante_id: string
          endpoint: string
          p256dh: string
          auth: string
          user_agent: string | null
          created_at: string
          last_used_at: string | null
        }
        Insert: {
          id?: string
          integrante_id: string
          endpoint: string
          p256dh: string
          auth: string
          user_agent?: string | null
          created_at?: string
          last_used_at?: string | null
        }
        Update: {
          id?: string
          integrante_id?: string
          endpoint?: string
          p256dh?: string
          auth?: string
          user_agent?: string | null
          created_at?: string
          last_used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'push_subscriptions_integrante_id_fkey'
            columns: ['integrante_id']
            isOneToOne: false
            referencedRelation: 'dim_integrantes'
            referencedColumns: ['id']
          }
        ]
      }
      reservas_landing: {
        Row: {
          id: string
          evento_id: string
          lead_id: string | null
          integrante_id: string
          inicio: string
          fin: string
          periodo: string | null
          nombre: string
          email: string
          telefono: string
          mensaje: string | null
          consentimiento_version: string
          ip: string | null
          user_agent: string | null
          created_at: string
        }
        Insert: {
          id?: string
          evento_id: string
          lead_id?: string | null
          integrante_id: string
          inicio: string
          fin: string
          periodo?: string | null
          nombre: string
          email: string
          telefono: string
          mensaje?: string | null
          consentimiento_version: string
          ip?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          evento_id?: string
          lead_id?: string | null
          integrante_id?: string
          inicio?: string
          fin?: string
          periodo?: string | null
          nombre?: string
          email?: string
          telefono?: string
          mensaje?: string | null
          consentimiento_version?: string
          ip?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'reservas_landing_evento_id_fkey'
            columns: ['evento_id']
            isOneToOne: false
            referencedRelation: 'eventos'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'reservas_landing_lead_id_fkey'
            columns: ['lead_id']
            isOneToOne: false
            referencedRelation: 'fact_leads'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'reservas_landing_integrante_id_fkey'
            columns: ['integrante_id']
            isOneToOne: false
            referencedRelation: 'dim_integrantes'
            referencedColumns: ['id']
          }
        ]
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
        Relationships: [
          {
            foreignKeyName: 'reuniones_lead_id_fkey'
            columns: ['lead_id']
            isOneToOne: false
            referencedRelation: 'fact_leads'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'reuniones_cliente_id_fkey'
            columns: ['cliente_id']
            isOneToOne: false
            referencedRelation: 'dim_clientes'
            referencedColumns: ['id']
          }
        ]
      }
      sala_musica: {
        Row: {
          conversacion_id: string
          video_id: string | null
          titulo: string | null
          canal: string | null
          duracion_seg: number | null
          miniatura_url: string | null
          cola: Json
          historial: Json
          empezo_at: string | null
          offset_seg: number
          pausado: boolean
          modo_loop: string
          puesta_por: string | null
          actualizado_at: string
        }
        Insert: {
          conversacion_id: string
          video_id?: string | null
          titulo?: string | null
          canal?: string | null
          duracion_seg?: number | null
          miniatura_url?: string | null
          cola?: Json
          historial?: Json
          empezo_at?: string | null
          offset_seg?: number
          pausado?: boolean
          modo_loop?: string
          puesta_por?: string | null
          actualizado_at?: string
        }
        Update: {
          conversacion_id?: string
          video_id?: string | null
          titulo?: string | null
          canal?: string | null
          duracion_seg?: number | null
          miniatura_url?: string | null
          cola?: Json
          historial?: Json
          empezo_at?: string | null
          offset_seg?: number
          pausado?: boolean
          modo_loop?: string
          puesta_por?: string | null
          actualizado_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'sala_musica_conversacion_id_fkey'
            columns: ['conversacion_id']
            isOneToOne: false
            referencedRelation: 'conversaciones'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'sala_musica_puesta_por_fkey'
            columns: ['puesta_por']
            isOneToOne: false
            referencedRelation: 'dim_integrantes'
            referencedColumns: ['id']
          }
        ]
      }
      scraper_runs: {
        Row: {
          id: string
          fecha: string
          duracion_min: number | null
          nuevos_leads: number
          actualizados: number
          descartados: number
          total_procesados: number
          estado: string
          filtros: Json
          pedida_por: string | null
          categoria_actual: string | null
          categorias_totales: number | null
          categorias_hechas: number
          freno_pedido: boolean
          error: string | null
          iniciada_at: string | null
          terminada_at: string | null
        }
        Insert: {
          id?: string
          fecha?: string
          duracion_min?: number | null
          nuevos_leads?: number
          actualizados?: number
          descartados?: number
          total_procesados?: number
          estado?: string
          filtros?: Json
          pedida_por?: string | null
          categoria_actual?: string | null
          categorias_totales?: number | null
          categorias_hechas?: number
          freno_pedido?: boolean
          error?: string | null
          iniciada_at?: string | null
          terminada_at?: string | null
        }
        Update: {
          id?: string
          fecha?: string
          duracion_min?: number | null
          nuevos_leads?: number
          actualizados?: number
          descartados?: number
          total_procesados?: number
          estado?: string
          filtros?: Json
          pedida_por?: string | null
          categoria_actual?: string | null
          categorias_totales?: number | null
          categorias_hechas?: number
          freno_pedido?: boolean
          error?: string | null
          iniciada_at?: string | null
          terminada_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'scraper_runs_pedida_por_fkey'
            columns: ['pedida_por']
            isOneToOne: false
            referencedRelation: 'dim_integrantes'
            referencedColumns: ['id']
          }
        ]
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
        Relationships: [
          {
            foreignKeyName: 'subtareas_tarea_id_fkey'
            columns: ['tarea_id']
            isOneToOne: false
            referencedRelation: 'tareas'
            referencedColumns: ['id']
          }
        ]
      }
      tarea_responsables: {
        Row: {
          tarea_id: string
          integrante_id: string
        }
        Insert: {
          tarea_id: string
          integrante_id: string
        }
        Update: {
          tarea_id?: string
          integrante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'tarea_responsables_tarea_id_fkey'
            columns: ['tarea_id']
            isOneToOne: false
            referencedRelation: 'tareas'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'tarea_responsables_integrante_id_fkey'
            columns: ['integrante_id']
            isOneToOne: false
            referencedRelation: 'dim_integrantes'
            referencedColumns: ['id']
          }
        ]
      }
      tareas: {
        Row: {
          id: string
          titulo: string
          descripcion: string | null
          tipo: string
          estado: string
          prioridad: string
          esfuerzo: string
          fecha_limite: string | null
          proyecto_id: string | null
          cliente_id: string | null
          created_by: string | null
          created_at: string
          updated_at: string
          eliminado_at: string | null
          hora_limite: string | null
          completada_at: string | null
        }
        Insert: {
          id?: string
          titulo: string
          descripcion?: string | null
          tipo?: string
          estado?: string
          prioridad?: string
          esfuerzo?: string
          fecha_limite?: string | null
          proyecto_id?: string | null
          cliente_id?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
          eliminado_at?: string | null
          hora_limite?: string | null
          completada_at?: string | null
        }
        Update: {
          id?: string
          titulo?: string
          descripcion?: string | null
          tipo?: string
          estado?: string
          prioridad?: string
          esfuerzo?: string
          fecha_limite?: string | null
          proyecto_id?: string | null
          cliente_id?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
          eliminado_at?: string | null
          hora_limite?: string | null
          completada_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'tareas_proyecto_id_fkey'
            columns: ['proyecto_id']
            isOneToOne: false
            referencedRelation: 'dim_proyectos'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'tareas_cliente_id_fkey'
            columns: ['cliente_id']
            isOneToOne: false
            referencedRelation: 'dim_clientes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'tareas_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'dim_integrantes'
            referencedColumns: ['id']
          }
        ]
      }
      vex_conversaciones: {
        Row: {
          id: string
          integrante_id: string
          rol: string
          texto: string
          created_at: string
        }
        Insert: {
          id?: string
          integrante_id: string
          rol: string
          texto: string
          created_at?: string
        }
        Update: {
          id?: string
          integrante_id?: string
          rol?: string
          texto?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'vex_conversaciones_integrante_id_fkey'
            columns: ['integrante_id']
            isOneToOne: false
            referencedRelation: 'dim_integrantes'
            referencedColumns: ['id']
          }
        ]
      }
    }
    Views: {
      agentes_publicos: {
        Row: {
          id: string | null
          nombre: string | null
          descripcion: string | null
          color: string | null
          avatar_url: string | null
          activo: boolean | null
          ultimo_uso_at: string | null
          created_at: string | null
        }
        Insert: {
          id?: string | null
          nombre?: string | null
          descripcion?: string | null
          color?: string | null
          avatar_url?: string | null
          activo?: boolean | null
          ultimo_uso_at?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string | null
          nombre?: string | null
          descripcion?: string | null
          color?: string | null
          avatar_url?: string | null
          activo?: boolean | null
          ultimo_uso_at?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      cerebro_timeline: {
        Row: {
          id: string | null
          entidad_tipo: string | null
          entidad_id: string | null
          entidad_nombre: string | null
          fuente: string | null
          titulo: string | null
          contenido: string | null
          autor_id: string | null
          autor_nombre: string | null
          ocurrio_at: string | null
          metadata: Json | null
        }
        Insert: {
          id?: string | null
          entidad_tipo?: string | null
          entidad_id?: string | null
          entidad_nombre?: string | null
          fuente?: string | null
          titulo?: string | null
          contenido?: string | null
          autor_id?: string | null
          autor_nombre?: string | null
          ocurrio_at?: string | null
          metadata?: Json | null
        }
        Update: {
          id?: string | null
          entidad_tipo?: string | null
          entidad_id?: string | null
          entidad_nombre?: string | null
          fuente?: string | null
          titulo?: string | null
          contenido?: string | null
          autor_id?: string | null
          autor_nombre?: string | null
          ocurrio_at?: string | null
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: 'cerebro_timeline_autor_id_fkey'
            columns: ['autor_id']
            isOneToOne: false
            referencedRelation: 'dim_integrantes'
            referencedColumns: ['id']
          }
        ]
      }
      finanzas_resumen_mensual: {
        Row: {
          mes: string | null
          ingresos_clp: number | null
          egresos_clp: number | null
          saldo_clp: number | null
          movimientos: number | null
        }
        Insert: {
          mes?: string | null
          ingresos_clp?: number | null
          egresos_clp?: number | null
          saldo_clp?: number | null
          movimientos?: number | null
        }
        Update: {
          mes?: string | null
          ingresos_clp?: number | null
          egresos_clp?: number | null
          saldo_clp?: number | null
          movimientos?: number | null
        }
        Relationships: []
      }
      jornadas_resumen: {
        Row: {
          id: string | null
          integrante_id: string | null
          integrante_nombre: string | null
          integrante_email: string | null
          entrada_at: string | null
          salida_at: string | null
          nota: string | null
          origen: string | null
          fecha_local: string | null
          horas: number | null
        }
        Insert: {
          id?: string | null
          integrante_id?: string | null
          integrante_nombre?: string | null
          integrante_email?: string | null
          entrada_at?: string | null
          salida_at?: string | null
          nota?: string | null
          origen?: string | null
          fecha_local?: string | null
          horas?: number | null
        }
        Update: {
          id?: string | null
          integrante_id?: string | null
          integrante_nombre?: string | null
          integrante_email?: string | null
          entrada_at?: string | null
          salida_at?: string | null
          nota?: string | null
          origen?: string | null
          fecha_local?: string | null
          horas?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'jornadas_resumen_integrante_id_fkey'
            columns: ['integrante_id']
            isOneToOne: false
            referencedRelation: 'dim_integrantes'
            referencedColumns: ['id']
          }
        ]
      }
      llamadas_resumen_mes: {
        Row: {
          mes: string | null
          llamadas: number | null
          segundos_totales: number | null
          segundos_relay: number | null
          sin_medir: number | null
          gb_estimados: number | null
        }
        Insert: {
          mes?: string | null
          llamadas?: number | null
          segundos_totales?: number | null
          segundos_relay?: number | null
          sin_medir?: number | null
          gb_estimados?: number | null
        }
        Update: {
          mes?: string | null
          llamadas?: number | null
          segundos_totales?: number | null
          segundos_relay?: number | null
          sin_medir?: number | null
          gb_estimados?: number | null
        }
        Relationships: []
      }
      presencia_equipo: {
        Row: {
          integrante_id: string | null
          nombre: string | null
          avatar_url: string | null
          color: string | null
          es_del_equipo: boolean | null
          en_turno: boolean | null
          turno_desde: string | null
          en_pausa: boolean | null
          reunion_desde: string | null
          estado: string | null
        }
        Insert: {
          integrante_id?: string | null
          nombre?: string | null
          avatar_url?: string | null
          color?: string | null
          es_del_equipo?: boolean | null
          en_turno?: boolean | null
          turno_desde?: string | null
          en_pausa?: boolean | null
          reunion_desde?: string | null
          estado?: string | null
        }
        Update: {
          integrante_id?: string | null
          nombre?: string | null
          avatar_url?: string | null
          color?: string | null
          es_del_equipo?: boolean | null
          en_turno?: boolean | null
          turno_desde?: string | null
          en_pausa?: boolean | null
          reunion_desde?: string | null
          estado?: string | null
        }
        Relationships: []
      }
      v_equipo_publico: {
        Row: {
          id: string | null
          nombre: string | null
          role: string | null
          bio_corta: string | null
          bio: string | null
          photo: string | null
          linkedin: string | null
          portfolio: string | null
          category: string | null
        }
        Insert: {
          id?: string | null
          nombre?: string | null
          role?: string | null
          bio_corta?: string | null
          bio?: string | null
          photo?: string | null
          linkedin?: string | null
          portfolio?: string | null
          category?: string | null
        }
        Update: {
          id?: string | null
          nombre?: string | null
          role?: string | null
          bio_corta?: string | null
          bio?: string | null
          photo?: string | null
          linkedin?: string | null
          portfolio?: string | null
          category?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      mi_integrante_id: {
        Args: Record<string, never>
        Returns: unknown
      }
      set_proyecto_equipo: {
        Args: {
          p_integrante_ids: string[] | null
          p_proyecto_id: string | null
        }
        Returns: unknown
      }
      crear_evento_con_asistentes: {
        Args: {
          p_asistentes_ids: string[] | null
          p_cliente_id: string | null
          p_creado_por: string | null
          p_fin: string | null
          p_inicio: string | null
          p_lead_id: string | null
          p_notas: string | null
          p_tipo: string | null
          p_titulo: string | null
        }
        Returns: unknown
      }
      set_tarea_responsables: {
        Args: {
          p_integrante_ids: string[] | null
          p_tarea_id: string | null
        }
        Returns: unknown
      }
      buscar_conocimiento: {
        Args: {
          match_count?: number | null
          query_embedding: string | null
        }
        Returns: unknown
      }
      cerrar_llamadas_zombis: {
        Args: {
          conv_id: string | null
        }
        Returns: unknown
      }
      abrir_dm: {
        Args: {
          otro_id: string | null
        }
        Returns: unknown
      }
      crear_grupo: {
        Args: {
          p_miembros: string[] | null
          p_nombre: string | null
        }
        Returns: unknown
      }
      is_integrante: {
        Args: Record<string, never>
        Returns: unknown
      }
      tengo_permiso: {
        Args: {
          p_permiso: string | null
        }
        Returns: unknown
      }
      cerrar_llamadas_zombis_global: {
        Args: Record<string, never>
        Returns: unknown
      }
      soy_superadmin: {
        Args: Record<string, never>
        Returns: unknown
      }
      limpiar_reset_intentos: {
        Args: Record<string, never>
        Returns: unknown
      }
      es_miembro_conversacion: {
        Args: {
          conv_id: string | null
        }
        Returns: unknown
      }
      reemplazar_disponibilidad: {
        Args: {
          p_dias: number[] | null
          p_horas: number[] | null
          p_integrante_id: string | null
          p_publicas: boolean[] | null
        }
        Returns: unknown
      }
      reservar_cita_publica: {
        Args: {
          p_consentimiento_version: string | null
          p_duracion_min: number | null
          p_email: string | null
          p_inicio: string | null
          p_ip: string | null
          p_mensaje: string | null
          p_nombre: string | null
          p_telefono: string | null
          p_user_agent: string | null
        }
        Returns: unknown
      }
    }
    Enums: Record<string, never>
  }
}
