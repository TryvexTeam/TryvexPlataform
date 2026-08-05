import { describe, expect, test } from 'vitest'
import {
  aplicarComando,
  duracionISOaSegundos,
  extraerVideoId,
  hayQueSaltar,
  leerComando,
  mandaAvanzar,
  mezclar,
  normalizarConsulta,
  pistaTerminada,
  posicionActual,
  reloj,
  siguiente,
  type Pista,
  type SalaMusica,
} from './musica'

const AHORA = new Date('2026-08-05T12:00:00Z')

function pista(parcial: Partial<Pista> = {}): Pista {
  return {
    video_id: 'aaaaaaaaaaa',
    titulo: 'Una cancion',
    canal: 'Un canal',
    duracion_seg: 200,
    miniatura_url: null,
    puesta_por: null,
    ...parcial,
  }
}

function sala(parcial: Partial<SalaMusica> = {}): SalaMusica {
  return {
    conversacion_id: 'c1',
    video_id: 'aaaaaaaaaaa',
    titulo: 'Una cancion',
    canal: 'Un canal',
    duracion_seg: 200,
    miniatura_url: null,
    cola: [],
    historial: [],
    // Arrancó un minuto antes de AHORA.
    empezo_at: '2026-08-05T11:59:00Z',
    offset_seg: 0,
    pausado: false,
    modo_loop: 'off',
    puesta_por: null,
    actualizado_at: '2026-08-05T11:59:00Z',
    ...parcial,
  }
}

// ── Lo que sostiene toda la sincronizacion ──────────────────────────────────

describe('posicionActual', () => {
  test('cuenta lo transcurrido desde que empezó', () => {
    expect(posicionActual(sala(), AHORA)).toBe(60)
  })

  test('suma el offset al tiempo transcurrido', () => {
    expect(posicionActual(sala({ offset_seg: 30 }), AHORA)).toBe(90)
  })

  test('pausada devuelve el offset congelado, sin importar cuánto pasó', () => {
    const congelada = sala({ pausado: true, offset_seg: 45, empezo_at: null })
    expect(posicionActual(congelada, AHORA)).toBe(45)
    expect(posicionActual(congelada, new Date('2026-08-05T14:00:00Z'))).toBe(45)
  })

  test('no pasa de la duración de la pista', () => {
    const vieja = sala({ empezo_at: '2026-08-05T11:00:00Z' })
    expect(posicionActual(vieja, AHORA)).toBe(200)
  })

  test('un empezo_at en el futuro no manda la aguja hacia atrás', () => {
    const futura = sala({ empezo_at: '2026-08-05T12:00:30Z', offset_seg: 10 })
    expect(posicionActual(futura, AHORA)).toBe(10)
  })

  test('sin pista es cero', () => {
    expect(posicionActual(sala({ video_id: null }), AHORA)).toBe(0)
  })
})

describe('hayQueSaltar', () => {
  test('no corrige desfases chicos: el salto suena peor que el desfase', () => {
    expect(hayQueSaltar(60, 61.5)).toBe(false)
    expect(hayQueSaltar(60, 58.5)).toBe(false)
  })

  test('corrige cuando el desfase ya se nota', () => {
    expect(hayQueSaltar(60, 65)).toBe(true)
    expect(hayQueSaltar(65, 60)).toBe(true)
  })
})

describe('pistaTerminada', () => {
  test('detecta el final', () => {
    expect(pistaTerminada(sala({ empezo_at: '2026-08-05T11:56:00Z' }), AHORA)).toBe(true)
  })

  test('a mitad de camino no', () => {
    expect(pistaTerminada(sala(), AHORA)).toBe(false)
  })

  test('pausada nunca termina', () => {
    expect(pistaTerminada(sala({ pausado: true, offset_seg: 200 }), AHORA)).toBe(false)
  })

  test('sin duración conocida (un directo) no termina nunca', () => {
    expect(pistaTerminada(sala({ duracion_seg: 0 }), AHORA)).toBe(false)
  })
})

// ── Pausar y reanudar: el ciclo que rompe el offset si se hace mal ──────────

describe('pausa y reanudación', () => {
  test('pausar guarda la posición alcanzada', () => {
    const { cambio } = aplicarComando(sala(), 'pause', AHORA)
    expect(cambio.pausado).toBe(true)
    expect(cambio.offset_seg).toBe(60)
    expect(cambio.empezo_at).toBeNull()
  })

  test('reanudar reinicia el reloj conservando el offset', () => {
    const pausada = sala({ pausado: true, offset_seg: 60, empezo_at: null })
    const { cambio } = aplicarComando(pausada, 'resume', AHORA)
    expect(cambio.pausado).toBe(false)
    expect(cambio.empezo_at).toBe(AHORA.toISOString())
    expect(cambio.offset_seg).toBeUndefined()
  })

  test('el ciclo completo no pierde ni regala segundos', () => {
    const enMinuto = sala()
    const pausa = aplicarComando(enMinuto, 'pause', AHORA).cambio
    const pausada = { ...enMinuto, ...pausa } as SalaMusica

    const diezMinutosDespues = new Date('2026-08-05T12:10:00Z')
    const reanuda = aplicarComando(pausada, 'resume', diezMinutosDespues).cambio
    const sonando = { ...pausada, ...reanuda } as SalaMusica

    // Diez minutos en pausa no adelantan la cancion.
    expect(posicionActual(sonando, diezMinutosDespues)).toBe(60)
    // Y a los 30 segundos de reanudar va en 1:30, no en 11:30.
    expect(posicionActual(sonando, new Date('2026-08-05T12:10:30Z'))).toBe(90)
  })
})

// ── Comandos ───────────────────────────────────────────────────────────────

describe('play', () => {
  test('con la sala en silencio, suena de inmediato', () => {
    const vacia = sala({ video_id: null, titulo: null, duracion_seg: null, empezo_at: null })
    const { cambio } = aplicarComando(vacia, 'play', AHORA, { pista: pista({ video_id: 'bbbbbbbbbbb' }) })
    expect(cambio.video_id).toBe('bbbbbbbbbbb')
    expect(cambio.empezo_at).toBe(AHORA.toISOString())
    expect(cambio.offset_seg).toBe(0)
  })

  test('con algo sonando, encola en vez de interrumpir', () => {
    const { cambio } = aplicarComando(sala(), 'play', AHORA, { pista: pista({ video_id: 'bbbbbbbbbbb' }) })
    expect(cambio.video_id).toBeUndefined()
    expect(cambio.cola).toHaveLength(1)
  })
})

describe('siguiente', () => {
  test('avanza a la próxima y manda la actual al historial', () => {
    const conCola = sala({ cola: [pista({ video_id: 'bbbbbbbbbbb', titulo: 'La que sigue' })] })
    const cambio = siguiente(conCola, AHORA)
    expect(cambio.video_id).toBe('bbbbbbbbbbb')
    expect(cambio.cola).toEqual([])
    expect(cambio.historial?.[0].video_id).toBe('aaaaaaaaaaa')
    expect(cambio.offset_seg).toBe(0)
  })

  test('sin cola y sin loop, queda en silencio', () => {
    const cambio = siguiente(sala(), AHORA)
    expect(cambio.video_id).toBeNull()
    expect(cambio.empezo_at).toBeNull()
  })

  test('loop de pista repite la misma cuando termina sola', () => {
    const cambio = siguiente(sala({ modo_loop: 'pista' }), AHORA)
    expect(cambio.video_id).toBeUndefined()
    expect(cambio.empezo_at).toBe(AHORA.toISOString())
    expect(cambio.offset_seg).toBe(0)
  })

  test('con loop de pista, saltar a mano sí sale del bucle', () => {
    const conCola = sala({ modo_loop: 'pista', cola: [pista({ video_id: 'bbbbbbbbbbb' })] })
    const cambio = siguiente(conCola, AHORA, { forzada: true })
    expect(cambio.video_id).toBe('bbbbbbbbbbb')
  })

  test('loop de cola manda la que terminó al final', () => {
    const conCola = sala({ modo_loop: 'cola', cola: [pista({ video_id: 'bbbbbbbbbbb' })] })
    const cambio = siguiente(conCola, AHORA)
    expect(cambio.video_id).toBe('bbbbbbbbbbb')
    expect(cambio.cola?.map((p) => p.video_id)).toEqual(['aaaaaaaaaaa'])
  })

  test('el historial se recorta a 20 para que la fila no crezca sin techo', () => {
    const largo = Array.from({ length: 25 }, (_, i) => pista({ video_id: `h${i}`.padEnd(11, 'x') }))
    const cambio = siguiente(sala({ historial: largo }), AHORA)
    expect(cambio.historial).toHaveLength(20)
  })
})

describe('previous', () => {
  test('vuelve a la anterior y devuelve la actual al frente de la cola', () => {
    const conHistorial = sala({ historial: [pista({ video_id: 'zzzzzzzzzzz', titulo: 'La de antes' })] })
    const { cambio } = aplicarComando(conHistorial, 'previous', AHORA)
    expect(cambio.video_id).toBe('zzzzzzzzzzz')
    expect(cambio.historial).toEqual([])
    expect(cambio.cola?.[0].video_id).toBe('aaaaaaaaaaa')
  })

  test('sin historial no hace nada', () => {
    const { cambio } = aplicarComando(sala(), 'previous', AHORA)
    expect(cambio).toEqual({})
  })
})

describe('loop, shuffle y stop', () => {
  test('loop sin argumento cicla off → pista → cola → off', () => {
    expect(aplicarComando(sala({ modo_loop: 'off' }), 'loop', AHORA).cambio.modo_loop).toBe('pista')
    expect(aplicarComando(sala({ modo_loop: 'pista' }), 'loop', AHORA).cambio.modo_loop).toBe('cola')
    expect(aplicarComando(sala({ modo_loop: 'cola' }), 'loop', AHORA).cambio.modo_loop).toBe('off')
  })

  test('loop con argumento va directo a ese modo', () => {
    expect(aplicarComando(sala(), 'loop', AHORA, { modo: 'cola' }).cambio.modo_loop).toBe('cola')
  })

  test('stop deja la sala en silencio y sin cola', () => {
    const { cambio } = aplicarComando(sala({ cola: [pista()] }), 'stop', AHORA)
    expect(cambio.video_id).toBeNull()
    expect(cambio.cola).toEqual([])
  })

  test('shuffle no pierde ni duplica pistas', () => {
    const cola = Array.from({ length: 8 }, (_, i) => pista({ video_id: `v${i}`.padEnd(11, 'x') }))
    const mezclada = mezclar(cola, () => 0.5)
    expect(mezclada).toHaveLength(8)
    expect(new Set(mezclada.map((p) => p.video_id)).size).toBe(8)
  })

  test('shuffle no toca la cola original', () => {
    const cola = [pista({ video_id: 'aaaaaaaaaaa' }), pista({ video_id: 'bbbbbbbbbbb' })]
    mezclar(cola, () => 0)
    expect(cola.map((p) => p.video_id)).toEqual(['aaaaaaaaaaa', 'bbbbbbbbbbb'])
  })

  test('una cola de una pista no se mezcla', () => {
    expect(aplicarComando(sala({ cola: [pista()] }), 'shuffle', AHORA).cambio).toEqual({})
  })
})

describe('comandos de lectura', () => {
  test('nowplaying dice dónde va', () => {
    expect(aplicarComando(sala(), 'nowplaying', AHORA).mensaje).toBe('Una cancion — 1:00 / 3:20')
  })

  test('queue lista la cola sin tocar nada', () => {
    const { cambio, mensaje } = aplicarComando(sala({ cola: [pista({ titulo: 'Otra' })] }), 'queue', AHORA)
    expect(cambio).toEqual({})
    expect(mensaje).toContain('1. Otra')
  })
})

// ── Quién avanza la cola ───────────────────────────────────────────────────

describe('mandaAvanzar', () => {
  const presentes = ['b', 'a', 'c']

  test('lo hace uno solo, el del id menor', () => {
    expect(presentes.filter((id) => mandaAvanzar(id, presentes))).toEqual(['a'])
  })

  test('si el encargado se va, el siguiente pasa a serlo solo', () => {
    const sinA = ['b', 'c']
    expect(sinA.filter((id) => mandaAvanzar(id, sinA))).toEqual(['b'])
  })

  test('estando solo, manda uno', () => {
    expect(mandaAvanzar('z', ['z'])).toBe(true)
    expect(mandaAvanzar('z', [])).toBe(true)
  })
})

// ── Texto ──────────────────────────────────────────────────────────────────

describe('extraerVideoId', () => {
  test.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?t=42', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RD', 'dQw4w9WgXcQ'],
    ['dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ])('%s → %s', (url, id) => {
    expect(extraerVideoId(url)).toBe(id)
  })

  test.each([
    ['bohemian rhapsody'],
    ['https://vimeo.com/12345'],
    ['https://www.youtube.com/watch?v=corto'],
  ])('%s no es una URL de video', (texto) => {
    expect(extraerVideoId(texto)).toBeNull()
  })
})

describe('normalizarConsulta', () => {
  test('la misma búsqueda escrita distinto cae en la misma entrada del cache', () => {
    expect(normalizarConsulta('  Bohemian   Rhapsody ')).toBe(normalizarConsulta('bohemian rhapsody'))
  })
})

describe('duracionISOaSegundos', () => {
  test.each([
    ['PT4M13S', 253],
    ['PT1H2M3S', 3723],
    ['PT45S', 45],
    ['P1DT2H', 93_600],
    ['basura', 0],
  ])('%s → %i', (iso, segundos) => {
    expect(duracionISOaSegundos(iso)).toBe(segundos)
  })
})

describe('reloj', () => {
  test.each([
    [0, '0:00'],
    [61, '1:01'],
    [3661, '1:01:01'],
  ])('%i → %s', (segundos, texto) => {
    expect(reloj(segundos)).toBe(texto)
  })
})

describe('leerComando', () => {
  test('un mensaje normal no es un comando', () => {
    expect(leerComando('hola equipo')).toBeNull()
  })

  test('reconoce el comando y su argumento', () => {
    expect(leerComando('/play bohemian rhapsody')).toEqual({
      comando: 'play',
      argumento: 'bohemian rhapsody',
      crudo: 'play',
    })
  })

  test('un comando mal escrito se identifica como inexistente, no como mensaje', () => {
    expect(leerComando('/plya algo')).toEqual({ comando: null, argumento: 'algo', crudo: 'plya' })
  })

  test('acepta los alias de otros bots', () => {
    expect(leerComando('/np')?.comando).toBe('nowplaying')
    expect(leerComando('/SKIP')?.comando).toBe('skip')
  })
})
