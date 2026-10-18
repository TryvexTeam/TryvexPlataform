import { armarGuionDemo } from './guion-demo'

/**
 * Perfiles de demo listos por nicho.
 *
 * Sirven para dos cosas: mostrar una demo al instante en una reunión (sin
 * tener el lead cargado) y tener un punto de partida para el negocio real,
 * que el equipo ajusta antes de activarla.
 *
 * Pasan por `armarGuionDemo`, el mismo armado que usan los leads, así que
 * heredan todas sus reglas: sin precios, sin confirmar horas, y las
 * restricciones de farmacias, salud y estudios jurídicos.
 *
 * Los nombres son de EJEMPLO (no son negocios reales) y no llevan horario ni
 * dirección a propósito: el guion presenta el horario como "según Google", y
 * en una plantilla eso sería falso. Si el cliente pregunta, el asistente dice
 * que lo confirma el equipo, que es lo honesto.
 *
 * Los rubros usan las palabras con que Google clasifica a los negocios, para
 * que la vista previa del teléfono elija el flujo correcto (ver
 * `simulacion-demo.ts`).
 */

export interface PlantillaDemo {
  id: string
  /** Cómo se muestra en el selector. */
  nicho: string
  /** Rubro tal como lo escribe Google: decide el flujo de la simulación. */
  rubro: string
  nombreEjemplo: string
  servicios: string[]
}

export const PLANTILLAS_DEMO: readonly PlantillaDemo[] = [
  {
    id: 'barberia', nicho: 'Barbería', rubro: 'Barbería', nombreEjemplo: 'Barbería El Filo',
    servicios: ['corte de pelo', 'perfilado de barba', 'corte y barba', 'afeitado con toalla caliente', 'corte infantil'],
  },
  {
    id: 'peluqueria', nicho: 'Peluquería', rubro: 'Peluquería', nombreEjemplo: 'Salón Aurora',
    servicios: ['corte de mujer', 'corte de hombre', 'tinte y mechas', 'alisado', 'peinados para eventos', 'tratamientos capilares'],
  },
  {
    id: 'estetica', nicho: 'Centro de estética', rubro: 'Centro de estética', nombreEjemplo: 'Estética Lumière',
    servicios: ['limpieza facial', 'depilación', 'masajes', 'manicure y pedicure', 'lifting de pestañas'],
  },
  {
    id: 'dental', nicho: 'Clínica dental', rubro: 'Clínica dental', nombreEjemplo: 'Clínica Dental Sonríe',
    servicios: ['evaluación', 'limpieza', 'tapaduras', 'ortodoncia', 'blanqueamiento', 'urgencias dentales'],
  },
  {
    id: 'kinesiologia', nicho: 'Kinesiología', rubro: 'Kinesiólogo', nombreEjemplo: 'Kine Movimiento',
    servicios: ['evaluación kinésica', 'rehabilitación de lesiones', 'kinesiología deportiva', 'masoterapia', 'atención a domicilio'],
  },
  {
    id: 'veterinaria', nicho: 'Veterinaria', rubro: 'Veterinaria', nombreEjemplo: 'Veterinaria Huellitas',
    servicios: ['consulta general', 'vacunas', 'desparasitación', 'esterilización', 'peluquería canina'],
  },
  {
    id: 'optica', nicho: 'Óptica', rubro: 'Óptica', nombreEjemplo: 'Óptica Visión Clara',
    servicios: ['examen de la vista', 'lentes ópticos', 'lentes de sol', 'lentes de contacto', 'reparación de marcos'],
  },
  {
    id: 'restaurante', nicho: 'Restaurante', rubro: 'Restaurante', nombreEjemplo: 'Restaurante La Mesa',
    servicios: ['reserva de mesas', 'menú del día', 'pedidos para llevar', 'celebraciones y eventos'],
  },
  {
    id: 'cafeteria', nicho: 'Cafetería', rubro: 'Cafetería', nombreEjemplo: 'Café Grano Fino',
    servicios: ['café de especialidad', 'desayunos', 'pastelería', 'pedidos para llevar', 'reserva de mesas'],
  },
  {
    id: 'pasteleria', nicho: 'Panadería y pastelería', rubro: 'Pastelería', nombreEjemplo: 'Pastelería Dulce Hogar',
    servicios: ['tortas por encargo', 'pan amasado', 'kuchenes', 'cóctel dulce y salado', 'tortas para cumpleaños'],
  },
  {
    id: 'ferreteria', nicho: 'Ferretería', rubro: 'Ferretería', nombreEjemplo: 'Ferretería El Tornillo',
    servicios: ['herramientas', 'materiales de construcción', 'pinturas', 'gasfitería', 'electricidad', 'cotizaciones para obras'],
  },
  {
    id: 'taller', nicho: 'Taller mecánico', rubro: 'Taller mecánico', nombreEjemplo: 'Taller Motor Sur',
    servicios: ['mantención', 'frenos', 'cambio de aceite', 'diagnóstico electrónico', 'alineación y balanceo'],
  },
  {
    id: 'gimnasio', nicho: 'Gimnasio', rubro: 'Gimnasio', nombreEjemplo: 'Gimnasio Fuerza Viva',
    servicios: ['planes mensuales', 'clases grupales', 'entrenamiento personalizado', 'clase de prueba'],
  },
  {
    id: 'floreria', nicho: 'Florería', rubro: 'Florería', nombreEjemplo: 'Florería Pétalo',
    servicios: ['ramos', 'arreglos florales', 'flores para eventos', 'despacho a domicilio'],
  },
  {
    id: 'farmacia', nicho: 'Farmacia', rubro: 'Farmacia', nombreEjemplo: 'Farmacia Del Barrio',
    servicios: ['consulta de disponibilidad de productos', 'perfumería', 'dermocosmética', 'toma de presión'],
  },
] as const

export function plantillaPorId(id: string): PlantillaDemo | undefined {
  return PLANTILLAS_DEMO.find((p) => p.id === id)
}

/** El guion de una plantilla, con el nombre que el equipo le quiera dar. */
export function guionDePlantilla(p: PlantillaDemo, nombre = p.nombreEjemplo): string {
  return armarGuionDemo(
    {
      nombre_negocio: nombre.trim() || p.nombreEjemplo,
      categoria_google: p.rubro,
      nicho: null,
      localidad: null,
      horario: null,
      url_web: null,
      instagram: null,
      web_capacidades: null,
    },
    { servicios: p.servicios },
  )
}
