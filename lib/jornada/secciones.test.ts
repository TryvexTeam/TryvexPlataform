import { describe, expect, it } from 'vitest'

import { esSeccionDeTrabajo } from './secciones'

/**
 * Qué frena el freno y qué no.
 *
 * Lo importante es la segunda mitad: si el freno se comiera el panel o la
 * propia página de jornada, alguien quedaría encerrado sin poder marcar
 * entrada, y el remedio sería peor que la enfermedad.
 */
describe('esSeccionDeTrabajo', () => {
  it('frena donde uno viene a producir', () => {
    for (const r of ['/leads', '/tareas', '/clientes', '/proyectos', '/chat']) {
      expect(esSeccionDeTrabajo(r)).toBe(true)
    }
  })

  it('frena también las páginas de adentro', () => {
    expect(esSeccionDeTrabajo('/tareas/9f1c-uuid')).toBe(true)
    expect(esSeccionDeTrabajo('/leads/abc/historial')).toBe(true)
  })

  it('NO frena la página de jornada: ahí es donde se marca entrada', () => {
    // Si esta falla, el freno encierra a la persona fuera del único lugar
    // donde puede resolverlo.
    expect(esSeccionDeTrabajo('/jornada')).toBe(false)
  })

  it('NO frena el panel, el perfil ni la configuración', () => {
    for (const r of ['/dashboard', '/equipo', '/settings', '/finanzas', '/cerebro']) {
      expect(esSeccionDeTrabajo(r)).toBe(false)
    }
  })

  it('no confunde una ruta que solo EMPIEZA parecido', () => {
    // '/tareas-viejas' no es '/tareas'.
    expect(esSeccionDeTrabajo('/tareas-viejas')).toBe(false)
    expect(esSeccionDeTrabajo('/leadsx')).toBe(false)
  })
})
