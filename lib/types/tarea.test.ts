import { describe, it, expect } from 'vitest'
import { TareaInsertSchema, TareaUpdateSchema } from './tarea'

describe('TareaUpdateSchema', () => {
  it('un PATCH que solo trae la fecha NO devuelve tipo, estado, prioridad ni esfuerzo', () => {
    // El bug real del 5-sep: repartir cuatro tareas (solo responsables y fecha)
    // las dejó a las cuatro en «General / Media / M». Los defaults del schema de
    // creación se colaban en el update y pisaban lo que había en la base.
    const r = TareaUpdateSchema.parse({ fecha_limite: '2026-09-08' })

    expect(r).not.toHaveProperty('tipo')
    expect(r).not.toHaveProperty('estado')
    expect(r).not.toHaveProperty('prioridad')
    expect(r).not.toHaveProperty('esfuerzo')
    expect(r.fecha_limite).toBe('2026-09-08')
  })

  it('un cuerpo vacío no escribe nada', () => {
    expect(TareaUpdateSchema.parse({})).toEqual({})
  })

  it('pero si el campo VIENE, sí se respeta', () => {
    const r = TareaUpdateSchema.parse({ tipo: 'error', prioridad: 'alta', esfuerzo: 'grande' })
    expect(r.tipo).toBe('error')
    expect(r.prioridad).toBe('alta')
    expect(r.esfuerzo).toBe('grande')
  })

  it('sigue rechazando valores inválidos', () => {
    expect(TareaUpdateSchema.safeParse({ prioridad: 'urgentisima' }).success).toBe(false)
    expect(TareaUpdateSchema.safeParse({ tipo: 'inventado' }).success).toBe(false)
  })

  it('crear una tarea SÍ conserva los valores de fábrica', () => {
    // El default es correcto al CREAR: una tarea nueva sin tipo es 'general'.
    // Lo que estaba mal era arrastrarlo al actualizar.
    const r = TareaInsertSchema.parse({ titulo: 'Una tarea' })
    expect(r.tipo).toBe('general')
    expect(r.estado).toBe('sin_empezar')
    expect(r.prioridad).toBe('media')
    expect(r.esfuerzo).toBe('medio')
  })
})
