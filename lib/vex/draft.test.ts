import { describe, it, expect } from 'vitest'
import { generarDraftLead } from './draft'
import { CuotaAgotada } from './llm'

// `tiene_web: null` a propósito en el lead base: "no sabemos" es el caso más
// común de la cartera real y el que antes se convertía en un "No" inventado.
const lead = { id: 'u1', nombre_negocio: 'Panadería San José', nicho: 'panadería',
  localidad: 'Maipú', score: 90, telefono: '987654321', redes_sociales: null,
  tiene_web: null, info_texto: null, url_web: null,
  google_rating: null, google_resenas: null, horario: null, instagram: null,
  categoria_google: null }

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
    // La advertencia específica de la web, no cualquier "no menciones": el
    // prompt ahora trae otra para las reseñas cuando faltan.
    expect(espia.prompt()).not.toMatch(/NO SABEMOS si tiene sitio web/i)
  })

  it('con conversación previa, le pide el SIGUIENTE mensaje y no otra presentación', async () => {
    const espia = llmEspia()
    await generarDraftLead(lead, undefined, espia.llm, [
      { direccion: 'out', texto: 'Hola, somos Tryvex' },
      { direccion: 'in', texto: '¿cuánto sale?' },
    ])

    expect(espia.prompt()).toMatch(/YA FUE CONTACTADO/i)
    expect(espia.prompt()).toMatch(/SIN SALUDO DE PRESENTACION/i)
    expect(espia.prompt()).toMatch(/ESTO REEMPLAZA LA ESTRUCTURA DE ARRIBA/i)
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

  it('las estrellas y reseñas llegan explicadas, no crudas', async () => {
    // El caso real del 17-ago: `info_texto = "4,8\n(256)"` llegaba sin etiqueta
    // y el modelo escribió "256 personas buscan barberías como la tuya cada
    // semana". Un dato sin explicar es material para inventar.
    const espia = llmEspia()
    await generarDraftLead({ ...lead, info_texto: '4,8\n(256)' }, undefined, espia.llm)

    expect(espia.prompt()).toMatch(/Reputación en Google Maps: 4,8 estrellas con 256 reseñas/)
    // Y no se lo pasa además en bruto, que sería darle las dos versiones.
    expect(espia.prompt()).not.toMatch(/Otra info del negocio/)
  })

  it('sin reputación, le prohíbe hablar de estrellas', async () => {
    const espia = llmEspia()
    await generarDraftLead({ ...lead, info_texto: null }, undefined, espia.llm)
    expect(espia.prompt()).toMatch(/NO menciones estrellas ni reseñas/i)
  })

  it('la comuna sale de la dirección, no del primer tramo', async () => {
    // El modelo escribió "En Pto San Francisco", que es un pasaje de la
    // dirección, no la comuna.
    const espia = llmEspia()
    await generarDraftLead(
      {
        ...lead,
        localidad: 'Pto San Francisco, Av. El Peral 3642 con, 8150000 Puente Alto, Región Metropolitana',
      },
      undefined,
      espia.llm,
    )

    expect(espia.prompt()).toMatch(/Comuna: Puente Alto/)
    expect(espia.prompt()).not.toMatch(/Comuna: Pto San Francisco/)
  })

  it('si la comuna no se puede leer, le prohíbe nombrar una', async () => {
    const espia = llmEspia()
    await generarDraftLead({ ...lead, localidad: 'Av. Matta 1200' }, undefined, espia.llm)
    expect(espia.prompt()).toMatch(/NO nombres ninguna/i)
  })

  it('le pide las cinco partes, no solo gancho y cierre', async () => {
    // El defecto que Cristian vio: "ni siquiera saludaron ni explicaron quiénes
    // somos". El prompt viejo pedía literalmente "gancho+CTA" para WhatsApp,
    // tirando la presentación y la solución.
    const espia = llmEspia()
    await generarDraftLead(lead, undefined, espia.llm)

    expect(espia.prompt()).toMatch(/1\. SALUDO/)
    expect(espia.prompt()).toMatch(/2\. QUIEN ERES/)
    expect(espia.prompt()).toMatch(/3\. LO QUE ESTA PERDIENDO/)
    expect(espia.prompt()).toMatch(/4\. QUE LE ENTREGAMOS/)
    expect(espia.prompt()).toMatch(/5\. EL CIERRE/)
    expect(espia.prompt()).not.toMatch(/gancho\+CTA/)
  })

  it('encuadra en lo que PIERDE, no en lo que ganaría', async () => {
    // Perder pesa cerca del doble que ganar lo mismo (Kahneman). Lo trajo
    // Ignacio y es la mejora de fondo del mensaje.
    const espia = llmEspia()
    await generarDraftLead(lead, undefined, espia.llm)
    expect(espia.prompt()).toMatch(/Encuadre de PERDIDA, no de ganancia/i)
  })

  it('le prohíbe las frases de disculpa que bajan el valor', async () => {
    const espia = llmEspia()
    await generarDraftLead(lead, undefined, espia.llm)
    expect(espia.prompt()).toMatch(/PROHIBIDAS las frases de disculpa/i)
    expect(espia.prompt()).toMatch(/sin compromiso/i)   // aparece en la lista negra
  })

  it('le prohíbe el voseo argentino', async () => {
    // Ignacio vio un "querés" en un mensaje y no le gustó, con razón: el prompt
    // estaba escrito en voseo ("escribís", "usá", "nombrá") y el modelo copiaba
    // el registro. Se le habla a un chileno de tú.
    const espia = llmEspia()
    await generarDraftLead(lead, undefined, espia.llm)
    expect(espia.prompt()).toMatch(/PROHIBIDO el voseo/i)
    expect(espia.prompt()).toMatch(/Espanol de CHILE, tuteo/i)
  })

  it('solo puede ofrecer lo que Tryvex entrega de verdad, y sin precios', async () => {
    const espia = llmEspia()
    await generarDraftLead(lead, undefined, espia.llm)

    expect(espia.prompt()).toMatch(/1 a 2 semanas/i)      // el plazo publicado
    expect(espia.prompt()).toMatch(/NO menciones precios/i)
    // Ni periodos de soporte ni garantias: la pagina dice "30 dias de soporte"
    // en el plan Sprint, y el prompt llego a decir "90 dias de mantencion".
    // Prometer el triple de lo publicado es la clase de dato falso que estamos
    // sacando del sistema, y este es frente a un cliente.
    expect(espia.prompt()).not.toMatch(/90 d[ií]as/i)
    expect(espia.prompt()).toMatch(/NO prometas plazos, garantias, periodos de soporte/i)
  })

  it('el primer contacto NO pide tiempo ni pone el enlace', async () => {
    // Pedir una reunion en frio baja mucho la respuesta (Gong, via Ignacio).
    // El primer mensaje valida interes; el link va cuando ya contesto.
    const espia = llmEspia()
    await generarDraftLead(lead, undefined, espia.llm)

    expect(espia.prompt()).toMatch(/NO pidas una llamada, una reunion ni un horario/i)
    expect(espia.prompt()).toMatch(/NO pongas ningun enlace todavia/i)
    expect(espia.prompt()).toMatch(/NO ofrezcas "una demo"/)
    expect(espia.prompt()).not.toMatch(/15 minutos/)
  })

  it('en el seguimiento SÍ invita a agendar, con el enlace', async () => {
    const espia = llmEspia()
    await generarDraftLead(lead, undefined, espia.llm, [
      { direccion: 'out', texto: '¿es algo que te moleste hoy?' },
      { direccion: 'in', texto: 'sí, me interesa' },
    ])

    expect(espia.prompt()).toMatch(/CIERRA INVITANDO A AGENDAR/i)
    expect(espia.prompt()).toMatch(/20 minutos/)
    expect(espia.prompt()).toContain('https://tryvex.tech')
    // Y que la instruccion del seguimiento MANDE sobre la del primer contacto:
    // mientras convivieron sin jerarquia, el modelo obedecia la equivocada.
    expect(espia.prompt()).toMatch(/NO REPITAS EL DIAGNOSTICO/i)
  })

  it('el catálogo completo llega al modelo, no solo la página web', async () => {
    // "Ofreces una página web cuando en nuestro catálogo tenemos muchos más
    // servicios" — Cristian, 18-ago.
    const espia = llmEspia()
    await generarDraftLead(lead, undefined, espia.llm)

    expect(espia.prompt()).toMatch(/Automatizacion/i)
    expect(espia.prompt()).toMatch(/Sistema a medida/i)
    expect(espia.prompt()).toMatch(/Inteligencia aplicada/i)
    expect(espia.prompt()).toMatch(/elige.*lo que le sirve a ESTE negocio segun su/i)
  })

  it('la columna manda sobre el texto crudo', async () => {
    // Los dos datos existen y no coinciden: gana la columna, que es la que se
    // corrigió en la migración 047. El número de `notas` estaba mal en las 510
    // filas (era la calificación por diez).
    const espia = llmEspia()
    await generarDraftLead(
      { ...lead, info_texto: '4,3\n(43)', google_rating: 4.3, google_resenas: 7885 },
      undefined,
      espia.llm,
    )
    expect(espia.prompt()).toMatch(/4,3 estrellas con 7885 reseñas/)
    expect(espia.prompt()).not.toMatch(/con 43 reseñas/)
  })

  it('sin columna, todavía se apoya en el texto crudo', async () => {
    // Un lead recién traído por el scraper no tiene las columnas llenas.
    const espia = llmEspia()
    await generarDraftLead({ ...lead, info_texto: '4,9\n(35)' }, undefined, espia.llm)
    expect(espia.prompt()).toMatch(/4,9 estrellas con 35 reseñas/)
  })

  it('el Instagram entra como ángulo cuando existe', async () => {
    const espia = llmEspia()
    await generarDraftLead(
      { ...lead, instagram: 'https://www.instagram.com/casasalvo.cl' },
      undefined,
      espia.llm,
    )
    expect(espia.prompt()).toContain('instagram.com/casasalvo.cl')
    expect(espia.prompt()).toMatch(/SU INSTAGRAM/)
  })

  it('sin Instagram, le prohíbe mencionarlo', async () => {
    const espia = llmEspia()
    await generarDraftLead(lead, undefined, espia.llm)
    expect(espia.prompt()).toMatch(/Instagram: no sabemos si tiene \(NO lo menciones\)/)
  })

  it('el horario va con la advertencia de que pudo cambiar', async () => {
    // Es una foto del día que se raspó Maps. Decirle "cierras a las 7" a alguien
    // que cambió el horario es el mismo error de siempre con otro dato.
    const espia = llmEspia()
    await generarDraftLead(
      { ...lead, horario: 'Abierto · Cierra a las 7 p. m.' },
      undefined,
      espia.llm,
    )
    expect(espia.prompt()).toMatch(/PUEDE haber cambiado, no lo afirmes como un hecho/)
    expect(espia.prompt()).toMatch(/NO afirmes su horario como un hecho/)
  })

  it('cuando se acaba la cuota, lo dice — no culpa al JSON', async () => {
    // El 17-ago esto costó veinte minutos de buscar un problema de
    // personalización que no existía: se había acabado la cuota diaria de Groq
    // y el aviso decía "la IA no devolvió un JSON válido".
    const sinCuota = async () => {
      throw new CuotaAgotada('14m4s')
    }
    const d = await generarDraftLead(lead, undefined, sinCuota)
    expect(d.aviso).toMatch(/cuota diaria/i)
    expect(d.aviso).toContain('14m4s')
    expect(d.aviso).not.toMatch(/JSON/i)
  })

  it('otro fallo de la llamada tampoco se disfraza de JSON inválido', async () => {
    const caido = async () => {
      throw new Error('503 service unavailable')
    }
    const d = await generarDraftLead(lead, undefined, caido)
    expect(d.aviso).toMatch(/No se pudo generar el mensaje/i)
    expect(d.aviso).toContain('503')
  })

  it('un JSON de verdad roto sí se reporta como tal', async () => {
    const basura = async () => 'esto no es json'
    const d = await generarDraftLead(lead, undefined, basura)
    expect(d.aviso).toMatch(/no es JSON válido/i)
  })

  it('solo pide el canal que el lead tiene', async () => {
    // Pedirle siempre las dos versiones gasta tokens de una cuota que hoy
    // alcanza para ~50 mensajes al día.
    const espia = llmEspia()
    await generarDraftLead(lead, undefined, espia.llm) // solo teléfono
    expect(espia.prompt()).toContain('"whatsapp_text"')
    expect(espia.prompt()).not.toContain('"social_text"')
  })

  it('el rubro de Google gana sobre el nuestro', async () => {
    // `nicho` guarda el término con el que BUSCAMOS ("pizzerías"); Google dice
    // lo que el negocio ES ("Restaurante italiano"). Escribirle por lo que es
    // da un mensaje más al grano, y el dato ya lo teníamos guardado sin usar.
    const espia = llmEspia()
    await generarDraftLead(
      { ...lead, nicho: 'pizzerías', categoria_google: 'Restaurante italiano' },
      undefined,
      espia.llm,
    )
    expect(espia.prompt()).toMatch(/Rubro \(asi lo clasifica Google\): Restaurante italiano/)
    expect(espia.prompt()).not.toMatch(/- Rubro: pizzerías/)
  })

  it('sin el rubro de Google, usa el nuestro', async () => {
    // Los 45 leads de rubros que el scraper no recorre nunca lo van a tener.
    const espia = llmEspia()
    await generarDraftLead(
      { ...lead, nicho: 'Panadería', categoria_google: null },
      undefined,
      espia.llm,
    )
    expect(espia.prompt()).toMatch(/- Rubro: panadería/)
  })

  it('un rubro de Google en blanco no deja al lead sin rubro', async () => {
    const espia = llmEspia()
    await generarDraftLead(
      { ...lead, nicho: 'panadería', categoria_google: '   ' },
      undefined,
      espia.llm,
    )
    expect(espia.prompt()).toMatch(/- Rubro: panadería/)
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
