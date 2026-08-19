// Catálogo de servicios de Tryvex. Cada servicio trae su propia plantilla de
// tareas: al crear un proyecto de este tipo, el equipo parte con el trabajo
// ya desglosado en el orden real de ejecución, en vez de armarlo desde cero.

export type IdServicio =
  | 'landing-esencial'
  | 'landing-avanzada'
  | 'automatizacion-proceso'
  | 'automatizacion-operativa'
  | 'integracion-chile'
  | 'whatsapp-atencion'
  | 'producto-medida'
  | 'panel-interno'
  | 'portal-clientes'
  | 'agente-ia'

export interface TareaPlantilla {
  titulo: string
  descripcion: string
  tipo: 'error' | 'feature' | 'pulir' | 'general'
  prioridad: 'alta' | 'media' | 'baja'
  esfuerzo: 'pequeno' | 'medio' | 'grande'
}

export interface PlantillaServicio {
  id: IdServicio
  nombre: string
  familia: string
  resumen: string
  // Pesos chilenos, número entero (el CLP no usa decimales).
  precioDesde: number
  semanas: number
  tareas: TareaPlantilla[]
}

// El orden de las tareas importa: es la secuencia real de trabajo de la
// agencia, para que el equipo no tenga que reordenarlas al crear el proyecto.
export const PLANTILLAS_SERVICIO: PlantillaServicio[] = [
  {
    id: 'landing-esencial',
    nombre: 'Landing esencial',
    familia: 'Presencia digital',
    resumen: 'Una página, un formulario, métricas desde el día uno.',
    precioDesde: 150000,
    semanas: 1,
    tareas: [
      {
        titulo: 'Diseño y copy enfocado en conversión',
        descripcion: 'Definir estructura de secciones y redactar el copy priorizando la acción principal del cliente.',
        tipo: 'general',
        prioridad: 'alta',
        esfuerzo: 'medio',
      },
      {
        titulo: 'Maquetación de la landing',
        descripcion: 'Construir la página a partir del diseño aprobado, con el formulario de contacto integrado.',
        tipo: 'feature',
        prioridad: 'alta',
        esfuerzo: 'medio',
      },
      {
        titulo: 'SEO técnico',
        descripcion: 'Meta tags, sitemap, datos estructurados y URLs limpias para que la página sea indexable desde el lanzamiento.',
        tipo: 'general',
        prioridad: 'media',
        esfuerzo: 'pequeno',
      },
      {
        titulo: 'Tracking de conversiones',
        descripcion: 'Instrumentar el envío del formulario y los eventos clave para que el cliente vea resultados desde el día uno.',
        tipo: 'feature',
        prioridad: 'media',
        esfuerzo: 'pequeno',
      },
      {
        titulo: 'Optimización de performance',
        descripcion: 'Ajustar imágenes, fuentes y carga hasta llegar a 90+ en Core Web Vitals.',
        tipo: 'pulir',
        prioridad: 'alta',
        esfuerzo: 'pequeno',
      },
      {
        titulo: 'Deploy y monitoreo',
        descripcion: 'Publicar en producción y dejar monitoreo activo durante los primeros 90 días de mantención incluida.',
        tipo: 'general',
        prioridad: 'media',
        esfuerzo: 'pequeno',
      },
    ],
  },
  {
    id: 'landing-avanzada',
    nombre: 'Landing avanzada',
    familia: 'Presencia digital',
    resumen: 'Multipágina, animación, contenido editable.',
    precioDesde: 650000,
    semanas: 3,
    tareas: [
      {
        titulo: 'Arquitectura de secciones y rutas',
        descripcion: 'Mapear las páginas y secciones necesarias antes de diseñar, para que la navegación tenga sentido de negocio.',
        tipo: 'general',
        prioridad: 'alta',
        esfuerzo: 'medio',
      },
      {
        titulo: 'Diseño de las múltiples páginas',
        descripcion: 'Diseñar cada ruta manteniendo coherencia visual entre secciones.',
        tipo: 'general',
        prioridad: 'alta',
        esfuerzo: 'grande',
      },
      {
        titulo: 'Maquetación multipágina',
        descripcion: 'Implementar rutas y componentes compartidos entre páginas.',
        tipo: 'feature',
        prioridad: 'alta',
        esfuerzo: 'grande',
      },
      {
        titulo: 'Animación e interacción a medida',
        descripcion: 'Construir las transiciones y micro-interacciones específicas del diseño aprobado.',
        tipo: 'feature',
        prioridad: 'media',
        esfuerzo: 'medio',
      },
      {
        titulo: 'Contenido editable',
        descripcion: 'Conectar el contenido a un panel o CMS para que el cliente lo actualice sin depender de un desarrollador.',
        tipo: 'feature',
        prioridad: 'media',
        esfuerzo: 'medio',
      },
      {
        titulo: 'Configuración de A/B testing',
        descripcion: 'Dejar listas las variantes y el mecanismo de medición para que el cliente pueda experimentar tras el lanzamiento.',
        tipo: 'feature',
        prioridad: 'baja',
        esfuerzo: 'pequeno',
      },
      {
        titulo: 'Deploy y monitoreo',
        descripcion: 'Publicar en producción y dejar monitoreo activo durante los primeros 90 días de mantención incluida.',
        tipo: 'general',
        prioridad: 'media',
        esfuerzo: 'pequeno',
      },
    ],
  },
  {
    id: 'automatizacion-proceso',
    nombre: 'Automatización de un proceso',
    familia: 'Automatización de procesos',
    resumen: 'Un flujo, hasta 3 integraciones.',
    precioDesde: 450000,
    semanas: 2,
    tareas: [
      {
        titulo: 'Mapeo del proceso actual',
        descripcion: 'Entender el flujo manual antes de automatizarlo, para no automatizar un proceso mal diseñado.',
        tipo: 'general',
        prioridad: 'alta',
        esfuerzo: 'pequeno',
      },
      {
        titulo: 'Evaluación de ingeniería propia vs. n8n/Zapier',
        descripcion: 'Decidir la herramienta según el caso: ingeniería propia primero, y n8n o Zapier cuando conviene por costo o velocidad.',
        tipo: 'general',
        prioridad: 'alta',
        esfuerzo: 'pequeno',
      },
      {
        titulo: 'Construcción del flujo',
        descripcion: 'Implementar la lógica del proceso automatizado con la herramienta elegida.',
        tipo: 'feature',
        prioridad: 'alta',
        esfuerzo: 'medio',
      },
      {
        titulo: 'Integraciones (hasta 3 sistemas)',
        descripcion: 'Conectar el flujo con los sistemas externos definidos en el alcance.',
        tipo: 'feature',
        prioridad: 'alta',
        esfuerzo: 'medio',
      },
      {
        titulo: 'Logs y alertas',
        descripcion: 'Dejar trazabilidad de cada ejecución y alertas ante fallos, para que nadie descubra un error semanas después.',
        tipo: 'feature',
        prioridad: 'media',
        esfuerzo: 'pequeno',
      },
      {
        titulo: 'Deploy y monitoreo',
        descripcion: 'Publicar el flujo en producción y dejar monitoreo activo durante los primeros 90 días de mantención incluida.',
        tipo: 'general',
        prioridad: 'media',
        esfuerzo: 'pequeno',
      },
    ],
  },
  {
    id: 'automatizacion-operativa',
    nombre: 'Automatización operativa',
    familia: 'Automatización de procesos',
    resumen: 'Varios flujos, panel de control.',
    precioDesde: 1200000,
    semanas: 4,
    tareas: [
      {
        titulo: 'Mapeo de los procesos operativos',
        descripcion: 'Levantar todos los flujos a automatizar y sus dependencias entre sí antes de construir nada.',
        tipo: 'general',
        prioridad: 'alta',
        esfuerzo: 'medio',
      },
      {
        titulo: 'Construcción de los flujos coordinados',
        descripcion: 'Implementar cada flujo asegurando que se coordinen entre ellos sin duplicar trabajo.',
        tipo: 'feature',
        prioridad: 'alta',
        esfuerzo: 'grande',
      },
      {
        titulo: 'Conexión con Shopify, Bsale o Mercado Libre',
        descripcion: 'Integrar los sistemas operativos del cliente definidos en el alcance.',
        tipo: 'feature',
        prioridad: 'alta',
        esfuerzo: 'medio',
      },
      {
        titulo: 'Panel en tiempo real',
        descripcion: 'Construir la vista donde el cliente ve el estado de todos los flujos sin pedirle un reporte a nadie.',
        tipo: 'feature',
        prioridad: 'media',
        esfuerzo: 'medio',
      },
      {
        titulo: 'Alertas y logs centralizados',
        descripcion: 'Centralizar la trazabilidad de todos los flujos en un solo lugar para diagnosticar fallos rápido.',
        tipo: 'feature',
        prioridad: 'media',
        esfuerzo: 'pequeno',
      },
      {
        titulo: 'Deploy y monitoreo',
        descripcion: 'Publicar en producción y dejar monitoreo activo durante los primeros 90 días de mantención incluida.',
        tipo: 'general',
        prioridad: 'media',
        esfuerzo: 'pequeno',
      },
    ],
  },
  {
    id: 'integracion-chile',
    nombre: 'Integración con sistemas chilenos',
    familia: 'Automatización de procesos',
    resumen: 'SII, Bsale, Shopify, Mercado Libre.',
    precioDesde: 850000,
    semanas: 3,
    tareas: [
      {
        titulo: 'Levantamiento de sistemas a integrar',
        descripcion: 'Confirmar con el cliente qué sistemas (SII, Bsale, Shopify, Mercado Libre) participan y en qué dirección fluyen los datos.',
        tipo: 'general',
        prioridad: 'alta',
        esfuerzo: 'pequeno',
      },
      {
        titulo: 'Facturación electrónica SII',
        descripcion: 'Implementar la emisión y sincronización de documentos tributarios electrónicos.',
        tipo: 'feature',
        prioridad: 'alta',
        esfuerzo: 'grande',
      },
      {
        titulo: 'Sincronización de inventario y ventas',
        descripcion: 'Conectar stock y ventas entre los sistemas para que no haya datos desalineados entre plataformas.',
        tipo: 'feature',
        prioridad: 'alta',
        esfuerzo: 'medio',
      },
      {
        titulo: 'Panel de estado de las integraciones',
        descripcion: 'Dar visibilidad de qué se sincronizó y qué falló, para que el cliente no tenga que revisar cada sistema por separado.',
        tipo: 'feature',
        prioridad: 'media',
        esfuerzo: 'pequeno',
      },
      {
        titulo: 'Fase de validación previa',
        descripcion: 'Correr en paralelo con datos reales antes de reemplazar el proceso manual, para no arriesgar la operación del cliente.',
        tipo: 'general',
        prioridad: 'alta',
        esfuerzo: 'pequeno',
      },
      {
        titulo: 'Deploy y monitoreo',
        descripcion: 'Publicar en producción y dejar monitoreo activo durante los primeros 90 días de mantención incluida.',
        tipo: 'general',
        prioridad: 'media',
        esfuerzo: 'pequeno',
      },
    ],
  },
  {
    id: 'whatsapp-atencion',
    nombre: 'Atención automatizada por WhatsApp',
    familia: 'Automatización de procesos',
    resumen: 'Responde, agenda y deriva sin que nadie esté pegado al teléfono.',
    precioDesde: 900000,
    semanas: 3,
    tareas: [
      {
        titulo: 'Diseño de las conversaciones',
        descripcion: 'Definir los flujos de respuesta y los casos que se derivan a un humano, antes de programar nada.',
        tipo: 'general',
        prioridad: 'alta',
        esfuerzo: 'medio',
      },
      {
        titulo: 'Respuestas automáticas',
        descripcion: 'Implementar las respuestas a las consultas frecuentes definidas en el diseño de conversación.',
        tipo: 'feature',
        prioridad: 'alta',
        esfuerzo: 'medio',
      },
      {
        titulo: 'Agendamiento automático',
        descripcion: 'Conectar con Google Calendar para que el bot agende directamente sin intervención humana.',
        tipo: 'feature',
        prioridad: 'alta',
        esfuerzo: 'medio',
      },
      {
        titulo: 'Conexión con el CRM',
        descripcion: 'Registrar cada conversación y su resultado en el CRM del cliente.',
        tipo: 'feature',
        prioridad: 'media',
        esfuerzo: 'medio',
      },
      {
        titulo: 'Derivación a humano',
        descripcion: 'Implementar el punto de escalamiento para los casos que el bot no puede resolver.',
        tipo: 'feature',
        prioridad: 'alta',
        esfuerzo: 'pequeno',
      },
      {
        titulo: 'Métricas de conversación',
        descripcion: 'Dejar visibles los indicadores de volumen, resolución y derivación para que el cliente mida el impacto.',
        tipo: 'feature',
        prioridad: 'media',
        esfuerzo: 'pequeno',
      },
      {
        titulo: 'Deploy y monitoreo',
        descripcion: 'Publicar en producción y dejar monitoreo activo durante los primeros 90 días de mantención incluida.',
        tipo: 'general',
        prioridad: 'media',
        esfuerzo: 'pequeno',
      },
    ],
  },
  {
    id: 'producto-medida',
    nombre: 'Producto a medida (MVP)',
    familia: 'Productos a medida',
    resumen: 'Frontend, backend, autenticación y despliegue completo.',
    precioDesde: 2800000,
    semanas: 8,
    tareas: [
      {
        titulo: 'Definición de alcance y arquitectura',
        descripcion: 'Fijar el alcance del MVP y la arquitectura del stack antes de escribir código, para no rehacer trabajo a mitad de camino.',
        tipo: 'general',
        prioridad: 'alta',
        esfuerzo: 'medio',
      },
      {
        titulo: 'Modelo de datos y backend base',
        descripcion: 'Construir el esquema de datos y la API sobre PostgreSQL como base del producto.',
        tipo: 'feature',
        prioridad: 'alta',
        esfuerzo: 'grande',
      },
      {
        titulo: 'Autenticación y roles',
        descripcion: 'Implementar el acceso de usuarios y sus permisos antes de construir features que dependan de ellos.',
        tipo: 'feature',
        prioridad: 'alta',
        esfuerzo: 'medio',
      },
      {
        titulo: 'Frontend con Next.js y TypeScript',
        descripcion: 'Construir la interfaz del producto sobre el stack definido.',
        tipo: 'feature',
        prioridad: 'alta',
        esfuerzo: 'grande',
      },
      {
        titulo: 'Panel de administración',
        descripcion: 'Dar al equipo del cliente una forma de operar el producto sin acceso directo a la base de datos.',
        tipo: 'feature',
        prioridad: 'media',
        esfuerzo: 'medio',
      },
      {
        titulo: 'Pipeline de CI/CD',
        descripcion: 'Automatizar pruebas y despliegue para que cada cambio llegue a producción de forma controlada.',
        tipo: 'general',
        prioridad: 'media',
        esfuerzo: 'pequeno',
      },
      {
        titulo: 'Despliegue del MVP',
        descripcion: 'Publicar el producto en producción con el pipeline de CI/CD ya configurado.',
        tipo: 'general',
        prioridad: 'alta',
        esfuerzo: 'pequeno',
      },
      {
        titulo: 'Monitoreo y mantención inicial',
        descripcion: 'Dejar monitoreo activo durante los primeros 90 días de mantención incluida.',
        tipo: 'general',
        prioridad: 'media',
        esfuerzo: 'pequeno',
      },
    ],
  },
  {
    id: 'panel-interno',
    nombre: 'Panel interno / dashboard',
    familia: 'Productos a medida',
    resumen: 'Operación visible en un solo lugar.',
    precioDesde: 1400000,
    semanas: 4,
    tareas: [
      {
        titulo: 'Definición de métricas e indicadores',
        descripcion: 'Acordar con el cliente qué métricas necesita ver antes de diseñar la interfaz.',
        tipo: 'general',
        prioridad: 'alta',
        esfuerzo: 'pequeno',
      },
      {
        titulo: 'Modelo de datos del panel',
        descripcion: 'Construir las consultas y estructuras necesarias para alimentar las métricas en tiempo real.',
        tipo: 'feature',
        prioridad: 'alta',
        esfuerzo: 'medio',
      },
      {
        titulo: 'Roles y permisos',
        descripcion: 'Definir qué puede ver y hacer cada tipo de usuario dentro del panel.',
        tipo: 'feature',
        prioridad: 'alta',
        esfuerzo: 'medio',
      },
      {
        titulo: 'Interfaz de métricas en tiempo real',
        descripcion: 'Construir las vistas que consolidan la operación en un solo lugar.',
        tipo: 'feature',
        prioridad: 'alta',
        esfuerzo: 'medio',
      },
      {
        titulo: 'Exportación de reportes',
        descripcion: 'Permitir exportar los datos del panel para que el cliente los use fuera de la plataforma.',
        tipo: 'feature',
        prioridad: 'media',
        esfuerzo: 'pequeno',
      },
      {
        titulo: 'Deploy y monitoreo',
        descripcion: 'Publicar en producción y dejar monitoreo activo durante los primeros 90 días de mantención incluida.',
        tipo: 'general',
        prioridad: 'media',
        esfuerzo: 'pequeno',
      },
    ],
  },
  {
    id: 'portal-clientes',
    nombre: 'Portal de clientes',
    familia: 'Productos a medida',
    resumen: 'Acceso, estado y documentos, sin correos de ida y vuelta.',
    precioDesde: 2200000,
    semanas: 5,
    tareas: [
      {
        titulo: 'Definición de flujos del cliente final',
        descripcion: 'Mapear qué necesita ver y hacer el cliente final dentro del portal antes de diseñarlo.',
        tipo: 'general',
        prioridad: 'alta',
        esfuerzo: 'pequeno',
      },
      {
        titulo: 'Autenticación propia',
        descripcion: 'Implementar el acceso de los clientes finales al portal, independiente del panel interno.',
        tipo: 'feature',
        prioridad: 'alta',
        esfuerzo: 'medio',
      },
      {
        titulo: 'Centralización de estado y documentos',
        descripcion: 'Construir la vista donde el cliente final consulta su estado y documentos sin escribir un correo.',
        tipo: 'feature',
        prioridad: 'alta',
        esfuerzo: 'grande',
      },
      {
        titulo: 'Notificaciones automáticas',
        descripcion: 'Avisar al cliente final cuando su estado cambia, en vez de que tenga que revisar manualmente.',
        tipo: 'feature',
        prioridad: 'media',
        esfuerzo: 'medio',
      },
      {
        titulo: 'Panel de administración del portal',
        descripcion: 'Dar al equipo del cliente una forma de gestionar el contenido y los accesos del portal.',
        tipo: 'feature',
        prioridad: 'media',
        esfuerzo: 'medio',
      },
      {
        titulo: 'Deploy y monitoreo',
        descripcion: 'Publicar en producción y dejar monitoreo activo durante los primeros 90 días de mantención incluida.',
        tipo: 'general',
        prioridad: 'media',
        esfuerzo: 'pequeno',
      },
    ],
  },
  {
    id: 'agente-ia',
    nombre: 'Agente de IA conectado',
    familia: 'Inteligencia aplicada',
    resumen: 'Clasifica, redacta y consulta tus sistemas.',
    precioDesde: 1600000,
    semanas: 4,
    tareas: [
      {
        titulo: 'Definición de casos de uso del agente',
        descripcion: 'Acordar qué debe clasificar, redactar o consultar el agente antes de conectarlo a nada.',
        tipo: 'general',
        prioridad: 'alta',
        esfuerzo: 'pequeno',
      },
      {
        titulo: 'Conexión a los sistemas actuales',
        descripcion: 'Integrar el agente con las fuentes de datos del cliente que necesita consultar.',
        tipo: 'feature',
        prioridad: 'alta',
        esfuerzo: 'medio',
      },
      {
        titulo: 'Clasificación y redacción automática',
        descripcion: 'Implementar la lógica del agente para los casos de uso definidos.',
        tipo: 'feature',
        prioridad: 'alta',
        esfuerzo: 'grande',
      },
      {
        titulo: 'Trazabilidad de cada acción',
        descripcion: 'Registrar qué hizo el agente y por qué, para que el cliente pueda auditar sus decisiones.',
        tipo: 'feature',
        prioridad: 'alta',
        esfuerzo: 'medio',
      },
      {
        titulo: 'Fase de validación',
        descripcion: 'Correr el agente en paralelo con revisión humana antes de darle autonomía total.',
        tipo: 'general',
        prioridad: 'alta',
        esfuerzo: 'pequeno',
      },
      {
        titulo: 'Deploy y monitoreo',
        descripcion: 'Publicar en producción y dejar monitoreo activo durante los primeros 90 días de mantención incluida.',
        tipo: 'general',
        prioridad: 'media',
        esfuerzo: 'pequeno',
      },
    ],
  },
]

// Búsqueda directa por id: evita que cada consumidor repita el mismo .find()
// sobre el arreglo del catálogo.
export function plantillaDe(id: IdServicio): PlantillaServicio | undefined {
  return PLANTILLAS_SERVICIO.find((plantilla) => plantilla.id === id)
}
