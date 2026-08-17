import { describe, it, expect } from 'vitest'
import { generarDraftLead } from './draft'

// `tiene_web: null` a propósito en el lead base: "no sabemos" es el caso más
// común de la cartera real y el que antes se convertía en un "No" inventado.
const lead = { id: 'u1', nombre_negocio: 'Panadería San José', nicho: 'panadería',
  localidad: 'Maipú', score: 90, telefono: '987654321', redes_sociales: null,
  tiene_web: null, info_texto: null, url_web: null }

/** Captura el prompt que se le manda al modelo, para poder revisarlo. */
function llmEspia() {
  const visto: string[] = []
  const llm = async (prompt: string) => {
    visto.push(prompt)
    return JSON.stringify({ whatsapp_text: 'Hola 👋 mira tryvex.tech' })
  }
  return { llm, prompt: () => visto[0] ?? '' }
}

describe('generarDraftLead', () => {
  it('genera whatsapp con link cuando hay teléfono', async () => {
    const llm = async () => JSON.stringify({ whatsapp_text: 'Hola 👋 mira tryvex.tech' })
    const d = await generarDraftLead(lead, undefined, llm)
    expect(d.whatsapp?.text).toContain('tryvex.tech')
    expect(d.whatsapp?.link).toMatch(/^https:\/\/wa\.me\/56987654321\?text=/)
    expect(d.social).toBeNull()
  })
  it('avisa cuando el lead no tiene ningún canal', async () => {
    const d = await generarDraftLead({ ...lead, telefono: null }, undefined, async () => '{}')
    expect(d.aviso).toMatch(/sin canal/i)
  })
  it('avisa cuando la IA devuelve JSON inválido', async () => {
    const d = await generarDraftLead(lead, undefined, async () => 'no soy json')
    expect(d.aviso).toMatch(/JSON/i)
  })
})

// Estos son los que fallaban: el prompt convertia "no sabemos" en "No" y le
// pedia al modelo abrir con "sin web = invisible en Google". A un negocio que
// SI tiene web, eso es una mentira en el primer renglon — y el limite que puso
// Cristian fue textual: "no informacion falsa".
describe('generarDraftLead: no afirma lo que no sabe', () => {
  it('sin dato de web, no le dice al modelo que el negocio no tiene', async () => {
    const espia = llmEspia()
    await generarDraftLead({ ...lead, tiene_web: null }, undefined, espia.llm)

    expect(espia.prompt()).not.toMatch(/¿Tiene sitio web\?:\s*No\b/)
    expect(espia.prompt()).toMatch(/no sabemos/i)
  })

  it('sin dato de web, le prohíbe explícitamente hablar del tema', async () => {
    const espia = llmEspia()
    await generarDraftLead({ ...lead, tiene_web: null }, undefined, espia.llm)
    expect(espia.prompt()).toMatch(/no menciones|no hables/i)
  })

  it('el campo ausente se trata igual que null (llega así desde la base sin tipar)', async () => {
    // El tipo ya no permite `undefined`, pero los datos entran por clientes
    // casteados a `any` en varios endpoints: si algún día vuelve a faltar la
    // columna en un select, tiene que degradar a "no sabemos" y no a "No".
    const sinCampo = { ...lead } as Record<string, unknown>
    delete sinCampo.tiene_web

    const espia = llmEspia()
    await generarDraftLead(sinCampo as never, undefined, espia.llm)
    expect(espia.prompt()).toMatch(/no sabemos/i)
    expect(espia.prompt()).not.toMatch(/¿Tiene sitio web\?:\s*No\b/)
  })

  it('con web, se lo dice tal cual', async () => {
    const espia = llmEspia()
    await generarDraftLead({ ...lead, tiene_web: true }, undefined, espia.llm)
    expect(espia.prompt()).toMatch(/¿Tiene sitio web\?:\s*Sí/)
  })

  it('sin web confirmado, se lo dice tal cual', async () => {
    const espia = llmEspia()
    await generarDraftLead({ ...lead, tiene_web: false }, undefined, espia.llm)
    expect(espia.prompt()).toMatch(/¿Tiene sitio web\?:\s*No\b/)
  })

  it('un "no tiene web" con URL cargada se trata como desconocido', async () => {
    // La puerta real por donde entra el dato falso: el formulario de alta traía
    // `tiene_web: false` por defecto, así que alguien podía escribir la
    // dirección del negocio y dejar el control sin tocar. Ese `false` parece
    // medido y no lo es — y el tercer estado no lo agarra, porque `false` es
    // un valor legítimo.
    const espia = llmEspia()
    await generarDraftLead(
      { ...lead, tiene_web: false, url_web: 'https://barberiadonluis.cl' },
      undefined,
      espia.llm,
    )
    expect(espia.prompt()).toMatch(/no sabemos/i)
    expect(espia.prompt()).toMatch(/no menciones|no hables/i)
  })

  it('un "no tiene web" sin URL sigue siendo un no', async () => {
    const espia = llmEspia()
    await generarDraftLead({ ...lead, tiene_web: false, url_web: null }, undefined, espia.llm)
    expect(espia.prompt()).toMatch(/¿Tiene sitio web\?:\s*No\b/)
    expect(espia.prompt()).not.toMatch(/no menciones/i)
  })

  it('con conversación previa, le pide el SIGUIENTE mensaje y no otra presentación', async () => {
    const espia = llmEspia()
    await generarDraftLead(lead, undefined, espia.llm, [
      { direccion: 'out', texto: 'Hola, somos Tryvex' },
      { direccion: 'in', texto: '¿cuánto sale?' },
    ])

    expect(espia.prompt()).toMatch(/YA FUE CONTACTADO/i)
    expect(espia.prompt()).toMatch(/NO te presentes de nuevo/i)
    expect(espia.prompt()).toContain('¿cuánto sale?')
  })

  it('en el seguimiento le prohíbe inventar precios y plazos', async () => {
    // Es el riesgo propio de retomar: el cliente pregunta "cuánto sale" y el
    // modelo tiene todos los incentivos para tirar una cifra.
    const espia = llmEspia()
    await generarDraftLead(lead, undefined, espia.llm, [
      { direccion: 'in', texto: '¿cuánto sale?' },
    ])
    expect(espia.prompt()).toMatch(/No inventes precios, plazos ni compromisos/i)
  })

  it('sin conversación previa no aparece el bloque de seguimiento', async () => {
    const espia = llmEspia()
    await generarDraftLead(lead, undefined, espia.llm, [])
    expect(espia.prompt()).not.toMatch(/YA FUE CONTACTADO/i)
  })

  it('un hilo largo se recorta: quedan los últimos turnos', async () => {
    // Un hilo entero empuja los datos del negocio fuera de la vista del modelo.
    const largo = Array.from({ length: 25 }, (_, i) => ({
      direccion: 'in' as const,
      texto: `mensaje numero ${i}`,
    }))
    const espia = llmEspia()
    await generarDraftLead(lead, undefined, espia.llm, largo)

    expect(espia.prompt()).toContain('mensaje numero 24')
    expect(espia.prompt()).not.toContain('mensaje numero 0')
  })

  it('los mensajes vacíos del hilo no ensucian el prompt', async () => {
    const espia = llmEspia()
    await generarDraftLead(lead, undefined, espia.llm, [
      { direccion: 'in', texto: '   ' },
      { direccion: 'in', texto: 'hola' },
    ])
    expect(espia.prompt()).toMatch(/El negocio: hola/)
    expect(espia.prompt()).not.toMatch(/El negocio:\s*$/m)
  })

  it('la info del negocio llega al modelo cuando existe', async () => {
    const espia = llmEspia()
    await generarDraftLead(
      { ...lead, info_texto: 'Atiende solo con reserva, cierra los lunes' },
      undefined,
      espia.llm,
    )
    expect(espia.prompt()).toContain('Atiende solo con reserva')
  })
})
