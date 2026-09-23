import { describe, it, expect } from 'vitest'
import { afirmacionesSinRespaldo, generarDraftLead, limpiarNombreParaSaludo } from './draft'
import { CuotaAgotada } from './llm'

// `tiene_web: null` a propósito en el lead base: "no sabemos" es el caso más
// común de la cartera real y el que antes se convertía en un "No" inventado.
const lead = { id: 'u1', nombre_negocio: 'Panadería San José', nicho: 'panadería',
  localidad: 'Maipú', score: 90, telefono: '987654321', redes_sociales: null,
  tiene_web: null, info_texto: null, url_web: null, web_capacidades: null,
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

  // El bug que esto cierra: pasarle el dato al modelo no alcanzaba. El catálogo
  // del prompt incluye "Landing o sitio web — 1 a 2 semanas" y nada le prohibía
  // ofrecerla, así que a Ópticas Premium (que tiene opticaspremium.com) le
  // escribió "estás perdiendo clientes que no te encuentran. Podemos crear un
  // sitio web". Había aviso para el caso "no sabemos" y ninguno para el "sí".
  it('con web confirmada, le PROHIBE ofrecer una pagina y decir que no lo encuentran', async () => {
    const espia = llmEspia()
    await generarDraftLead(
      { ...lead, tiene_web: true, url_web: 'https://opticaspremium.com' },
      undefined,
      espia.llm,
    )
    const p = espia.prompt()
    expect(p).toContain('YA TIENE SITIO WEB')
    expect(p).toContain('PROHIBIDO ofrecerle una pagina')
    expect(p).toContain('opticaspremium.com')
    // Y le dice por dónde sí: automatizar lo que ya tiene.
    expect(p).toMatch(/deje de ser una vitrina/)
  })

  it('sin web, NO aparece la prohibicion (ahi si se le ofrece la pagina)', async () => {
    const espia = llmEspia()
    await generarDraftLead({ ...lead, tiene_web: false }, undefined, espia.llm)
    expect(espia.prompt()).not.toContain('YA TIENE SITIO WEB')
  })

  // Saber que tiene web no alcanzaba: a un lead cuya pagina YA tenia agenda y
  // cotizaciones, el mensaje le ofrecio justo eso. Migracion 106 + revisar_web.py.
  it('si su web ya tiene agenda, le prohibe ofrecerle agenda', async () => {
    const espia = llmEspia()
    await generarDraftLead(
      {
        ...lead,
        tiene_web: true,
        url_web: 'https://opticaspremium.com',
        web_capacidades: {
          url: 'https://opticaspremium.com',
          revisada: true,
          capacidades: ['reserva', 'cotiza'],
        },
      },
      undefined,
      espia.llm,
    )
    const p = espia.prompt()
    expect(p).toContain('SU SITIO YA TIENE ESTO')
    expect(p).toContain('reservar hora / agendar online')
    expect(p).toContain('pedir cotización o presupuesto online')
  })

  it('si NO se pudo revisar la web, no afirma nada sobre lo que tiene', async () => {
    const espia = llmEspia()
    await generarDraftLead(
      {
        ...lead,
        tiene_web: true,
        web_capacidades: {
          url: 'https://x.cl',
          revisada: false,
          capacidades: [],
          error: 'ConnectTimeout',
        },
      },
      undefined,
      espia.llm,
    )
    expect(espia.prompt()).not.toContain('SU SITIO YA TIENE ESTO')
  })

  it('una web revisada sin capacidades tampoco inventa prohibiciones', async () => {
    const espia = llmEspia()
    await generarDraftLead(
      {
        ...lead,
        tiene_web: true,
        web_capacidades: { url: 'https://x.cl', revisada: true, capacidades: [] },
      },
      undefined,
      espia.llm,
    )
    expect(espia.prompt()).not.toContain('SU SITIO YA TIENE ESTO')
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
    // "El negocio: hola" ya no es literal desde que bloqueHistorial delimita
    // cada turno del lead (fix de prompt injection, commit 2511830) — el
    // mensaje real queda en la línea siguiente, entre los delimitadores.
    expect(espia.prompt()).toMatch(/El negocio: <<<MENSAJE_DEL_LEAD>>>\s*\nhola/)
    expect(espia.prompt()).not.toMatch(/El negocio: <<<MENSAJE_DEL_LEAD>>>\s*\n\s*\n/)
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
    expect(espia.prompt()).toMatch(/4\. LA PROPUESTA/)
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
    // El único enlace permitido es la firma; el de agendar sigue prohibido.
    expect(espia.prompt()).toMatch(/UNICO enlace del primer mensaje es https:\/\/tryvex\.tech/)
    expect(espia.prompt()).toMatch(/link de\s+agendar va DESPUES/i)
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
    expect(espia.prompt()).toMatch(/Que salga del catalogo de abajo y calce con su rubro/)
  })

  it('se presenta como Vex, con la dirección completa de Tryvex', async () => {
    const espia = llmEspia()
    await generarDraftLead(lead, undefined, espia.llm)
    expect(espia.prompt()).toMatch(/Soy Vex, de https:\/\/tryvex\.tech/)
    expect(espia.prompt()).not.toMatch(/Te escribimos de Tryvex/)
  })

  it('con el horario como único ángulo, pregunta la pérdida en vez de afirmarla', async () => {
    const espia = llmEspia()
    await generarDraftLead(lead, undefined, espia.llm)
    expect(espia.prompt()).toMatch(/NO SABES si pierde clientes: no lo afirmes/)
  })

  it('las directivas del equipo llegan al final y mandan sobre lo anterior', async () => {
    const espia = llmEspia()
    await generarDraftLead(lead, undefined, espia.llm, [], ['Este mes hay 20 % de descuento en landings.'])
    const prompt = espia.prompt()
    expect(prompt).toMatch(/Directivas vigentes del equipo de Tryvex \(mandan sobre todo lo anterior\)/)
    expect(prompt).toMatch(/- Este mes hay 20 % de descuento en landings\./)
    // Una promoción que no le sirve a este negocio no se nombra.
    expect(prompt).toMatch(/una promocion que no le aplica no se nombra/i)
  })

  it('sin directivas, no aparece el bloque', async () => {
    const espia = llmEspia()
    await generarDraftLead(lead, undefined, espia.llm, [], [])
    expect(espia.prompt()).not.toMatch(/Directivas vigentes/)
  })

  it('la columna manda sobre el texto crudo', async () => {
    // Los dos datos existen y no coinciden: gana la columna, que es la que se
    // corrigió en la migración 047. El número de `notas` estaba mal en las 510
    // filas (era la calificación por diez).
    const espia = llmEspia()
    await generarDraftLead(
      { ...lead, info_texto: '4,3\n(43)', google_rating: 4.8, google_resenas: 256 },
      undefined,
      espia.llm,
    )
    expect(espia.prompt()).toMatch(/4,8 estrellas con 256 reseñas/)
    expect(espia.prompt()).not.toMatch(/con 43 reseñas/)
  })

  it('sin columna, todavía se apoya en el texto crudo', async () => {
    // Un lead recién traído por el scraper no tiene las columnas llenas.
    const espia = llmEspia()
    await generarDraftLead({ ...lead, info_texto: '4,9\n(45)' }, undefined, espia.llm)
    expect(espia.prompt()).toMatch(/4,9 estrellas con 45 reseñas/)
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

// ---------------------------------------------------------------------------
// El filtro de salida: lo que el prompt pide y el modelo igual se salta.
// ---------------------------------------------------------------------------
describe('afirmacionesSinRespaldo', () => {
  const sinSaber = { tiene_web: null, url_web: 'https://x.cl', google_rating: 4.8, google_resenas: 256, horario: null }
  const conWeb = { tiene_web: true, url_web: 'https://x.cl', google_rating: 4.8, google_resenas: 256, horario: null }
  const sinWeb = { tiene_web: false, url_web: null, google_rating: 4.8, google_resenas: 256, horario: null }

  // Este es el mensaje REAL que Vex escribió para Ópticas Premium el 15-sep,
  // con el prompt que ya le decía "no menciones su web, ni Google, ni que no
  // aparece". Lo encontramos AHÍ, en Google, con sus 256 reseñas.
  const mensajeReal =
    'Hola, ¿hablo con Opticas Premium? Te escribimos de Tryvex. Veo que tienes 4,8 estrellas y 256 reseñas, ' +
    'pero cuando alguien busca ópticas en Santiago no aparecen tus datos, así pierdes clientes que ya están ' +
    'interesados. Podemos crear una página web de 1 a 2 semanas que muestre tus reseñas.'

  it('atrapa el mensaje real que se coló', () => {
    const m = afirmacionesSinRespaldo(mensajeReal, sinSaber)
    expect(m.length).toBeGreaterThanOrEqual(3)
    expect(m.join(' ')).toContain('no aparece')
    expect(m.join(' ')).toContain('pierde clientes')
    expect(m.join(' ')).toContain('página')
  })

  it('a quien YA tiene web, no le deja ofrecer una', () => {
    const m = afirmacionesSinRespaldo('Podemos crearte un sitio web en dos semanas.', conWeb)
    expect(m.join(' ')).toContain('ya tiene una')
  })

  it('a quien NO tiene web, ofrecerle una es correcto y pasa', () => {
    expect(afirmacionesSinRespaldo('Podemos crearte un sitio web en dos semanas.', sinWeb)).toEqual([])
  })

  it('preguntar lo que no sabemos SÍ se puede', () => {
    const texto = '¿Cómo llegan hoy tus clientes nuevos, te escriben o llaman?'
    expect(afirmacionesSinRespaldo(texto, sinSaber)).toEqual([])
  })

  it('sin reputación en la ficha, no puede citar estrellas', () => {
    const lead = { ...sinWeb, google_rating: null, google_resenas: null }
    const m = afirmacionesSinRespaldo('Vi que tienes 4,8 estrellas.', lead)
    expect(m.join(' ')).toContain('estrellas')
  })

  it('con reputación real, citarla no es problema', () => {
    expect(afirmacionesSinRespaldo('Vi tus 256 reseñas con 4,8 estrellas.', sinWeb)).toEqual([])
  })

  it('sin horario, no puede afirmar a qué hora cierra', () => {
    const m = afirmacionesSinRespaldo('Cuando cierras a las 7 nadie contesta.', sinWeb)
    expect(m.join(' ')).toContain('horario')
  })

  it('un mensaje limpio no reporta nada', () => {
    const texto =
      'Hola, ¿hablo con Ópticas Premium? Te escribimos de Tryvex. Vi que tienen 256 reseñas con 4,8 estrellas. ' +
      '¿Cuando alguien quiere una hora para examen de vista, cómo la piden hoy?'
    expect(afirmacionesSinRespaldo(texto, sinSaber)).toEqual([])
  })
})

describe('generarDraftLead: no entrega lo que no puede sostener', () => {
  const malo =
    'Veo que tienes 4,8 estrellas y 256 reseñas, pero cuando alguien busca ópticas en Santiago ' +
    'no aparecen tus datos, así pierdes clientes. Podemos crear una página web.'
  const bueno =
    'Hola, ¿hablo con Ópticas Premium? Vi tus 256 reseñas con 4,8 estrellas. ' +
    '¿Cómo pide hoy la gente su hora para examen de vista?'
  const premium = { ...lead, tiene_web: null, url_web: 'https://opticaspremium.com',
    google_rating: 4.8, google_resenas: 256 }

  it('si insiste con la invención, NO entrega mensaje y avisa por qué', async () => {
    const llm = async () => JSON.stringify({ whatsapp_text: malo })
    const d = await generarDraftLead(premium, undefined, llm)
    expect(d.whatsapp).toBeNull()
    expect(d.aviso).toMatch(/no podemos sostener/i)
    expect(d.aviso).toMatch(/no aparece/i)
  })

  it('le da una segunda oportunidad y acepta el mensaje corregido', async () => {
    let n = 0
    const llm = async () => {
      n++
      return JSON.stringify({ whatsapp_text: n === 1 ? malo : bueno })
    }
    const d = await generarDraftLead(premium, undefined, llm)
    expect(n).toBe(2)
    expect(d.aviso).toBeUndefined()
    expect(d.whatsapp?.text).toContain('examen de vista')
  })

  it('en el reintento le dice al modelo qué estuvo mal', async () => {
    const vistos: string[] = []
    const llm = async (p: string) => {
      vistos.push(p)
      return JSON.stringify({ whatsapp_text: vistos.length === 1 ? malo : bueno })
    }
    await generarDraftLead(premium, undefined, llm)
    expect(vistos[1]).toContain('EL MENSAJE ANTERIOR NO SIRVE')
    expect(vistos[1]).toMatch(/PREGUNTAR lo que no sabes/i)
  })

  it('un mensaje limpio pasa a la primera, sin reintento', async () => {
    let n = 0
    const llm = async () => { n++; return JSON.stringify({ whatsapp_text: bueno }) }
    const d = await generarDraftLead(premium, undefined, llm)
    expect(n).toBe(1)
    expect(d.whatsapp?.text).toBe(bueno)
  })
})

// El segundo escape: el filtro enumeraba verbos y el modelo ofrecio la pagina
// sin usar ninguno. Mensaje real del 15-sep, ya con el filtro puesto.
describe('afirmacionesSinRespaldo: ofrecer una web sin decir "crear"', () => {
  const sinSaber = { tiene_web: null, url_web: 'https://x.cl', google_rating: 4.8, google_resenas: 256, horario: null }
  const conWeb = { tiene_web: true, url_web: 'https://x.cl', google_rating: 4.8, google_resenas: 256, horario: null }
  const sinWeb = { tiene_web: false, url_web: null, google_rating: 4.8, google_resenas: 256, horario: null }

  const escape =
    'Hola 👋 ¿hablo con Opticas Premium? Somos Tryvex. Ayudamos a negocios como el tuyo a ' +
    'conseguir más clientes con una página web lista en días. ¿Te muestro un ejemplo, sin compromiso?'

  it('atrapa el mensaje que se colo por no usar el verbo', () => {
    const m = afirmacionesSinRespaldo(escape, sinSaber)
    expect(m.join(' ')).toContain('página web')
  })

  it('si no sabemos, NINGUNA mencion de pagina pasa', () => {
    for (const t of [
      'Te armamos un sitio web.',
      'con una página web lista en días',
      'una landing que convierta',
      'tu sitio puede recibir reservas',
    ]) {
      expect(afirmacionesSinRespaldo(t, sinSaber).length).toBeGreaterThan(0)
    }
  })

  it('si NO tiene web, ofrecersela sigue siendo correcto', () => {
    expect(afirmacionesSinRespaldo(escape, sinWeb)).toEqual([])
    expect(afirmacionesSinRespaldo('Te armamos una página web lista en días.', sinWeb)).toEqual([])
  })

  it('con web confirmada puede nombrarla, pero no ofrecersela', () => {
    // Nombrarla para automatizar lo que ya tiene: correcto.
    expect(afirmacionesSinRespaldo('Conectamos tu sitio con la agenda.', conWeb)).toEqual([])
    // Ofrecersela como si le faltara: no.
    expect(afirmacionesSinRespaldo(escape, conWeb).length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Reputación con piso: no toda nota es un logro que mostrarle al dueño.
// Casos reales: Florería Costanera 3,3 (16), Farmacia La Rebaja 3,7 (20),
// Centro Joyas 5,0 (1) — al dueño le suena a burla, no a elogio. Y una
// importadora del Persa Bío Bío mostraba 10.657 reseñas porque su ficha de
// Google está categorizada como el centro comercial entero, no como su local.
// ---------------------------------------------------------------------------
describe('reputación: solo se cita si pasa el umbral', () => {
  it('una nota de 3,3 con 16 reseñas (Florería Costanera) no se cita', async () => {
    const espia = llmEspia()
    await generarDraftLead({ ...lead, google_rating: 3.3, google_resenas: 16 }, undefined, espia.llm)
    expect(espia.prompt()).not.toMatch(/3,3 estrellas/)
    expect(espia.prompt()).toMatch(/NO menciones estrellas ni reseñas/i)
  })

  it('una nota de 3,7 con 20 reseñas (Farmacia La Rebaja) no se cita', async () => {
    const espia = llmEspia()
    await generarDraftLead({ ...lead, google_rating: 3.7, google_resenas: 20 }, undefined, espia.llm)
    expect(espia.prompt()).not.toMatch(/3,7 estrellas/)
  })

  it('un 5,0 con 1 sola reseña (Centro Joyas) no se cita: sobra nota, falta muestra', async () => {
    const espia = llmEspia()
    await generarDraftLead({ ...lead, google_rating: 5.0, google_resenas: 1 }, undefined, espia.llm)
    expect(espia.prompt()).not.toMatch(/estrellas con 1 reseñas?/)
  })

  it('10.657 reseñas (importadora del Persa Bío Bío) es sospechoso y no se cita', async () => {
    // La ficha de Google de esta importadora quedó categorizada como el Persa
    // Bío Bío entero: las reseñas son del centro comercial, no del negocio.
    const espia = llmEspia()
    await generarDraftLead({ ...lead, google_rating: 4.7, google_resenas: 10657 }, undefined, espia.llm)
    expect(espia.prompt()).not.toMatch(/10657 reseñas/)
    expect(espia.prompt()).toMatch(/NO menciones estrellas ni reseñas/i)
  })

  it('4,6 con 40 reseñas justo en el piso, sí se cita', async () => {
    const espia = llmEspia()
    await generarDraftLead({ ...lead, google_rating: 4.6, google_resenas: 40 }, undefined, espia.llm)
    expect(espia.prompt()).toMatch(/4,6 estrellas con 40 reseñas/)
  })

  it('4,6 pero con solo 39 reseñas, no alcanza', async () => {
    const espia = llmEspia()
    await generarDraftLead({ ...lead, google_rating: 4.6, google_resenas: 39 }, undefined, espia.llm)
    expect(espia.prompt()).not.toMatch(/4,6 estrellas/)
  })

  it('4,8 con 256 reseñas (dentro del umbral) sí se cita, como antes', async () => {
    const espia = llmEspia()
    await generarDraftLead({ ...lead, google_rating: 4.8, google_resenas: 256 }, undefined, espia.llm)
    expect(espia.prompt()).toMatch(/4,8 estrellas con 256 reseñas/)
  })

  it('afirmacionesSinRespaldo también rechaza citar una nota baja aunque el dato exista', () => {
    const florida = { tiene_web: false, url_web: null, google_rating: 3.3, google_resenas: 16, horario: null }
    const m = afirmacionesSinRespaldo('Vi que tienes 3,3 estrellas.', florida)
    expect(m.join(' ')).toContain('estrellas')
  })

  it('afirmacionesSinRespaldo rechaza citar reseñas sospechosamente altas', () => {
    const persa = { tiene_web: false, url_web: null, google_rating: 4.7, google_resenas: 10657, horario: null }
    const m = afirmacionesSinRespaldo('Vi tus 10657 reseñas.', persa)
    expect(m.join(' ')).toContain('estrellas')
  })
})

// ---------------------------------------------------------------------------
// Usted para rubros profesionales: se le tuteaba igual a un abogado que a una
// pizzería.
// ---------------------------------------------------------------------------
describe('trato de tú o de usted según el rubro', () => {
  it('a un abogado se le trata de usted', async () => {
    const espia = llmEspia()
    await generarDraftLead({ ...lead, nicho: 'abogados', categoria_google: null }, undefined, espia.llm)
    expect(espia.prompt()).toMatch(/Espanol de CHILE, de USTED/i)
    expect(espia.prompt()).not.toMatch(/Espanol de CHILE, tuteo/i)
  })

  it('a un contador se le trata de usted, por categoria_google', async () => {
    const espia = llmEspia()
    await generarDraftLead(
      { ...lead, nicho: null, categoria_google: 'Contador auditor' },
      undefined,
      espia.llm,
    )
    expect(espia.prompt()).toMatch(/de USTED/i)
  })

  it('a un químico farmacéutico se le trata de usted', async () => {
    const espia = llmEspia()
    await generarDraftLead(
      { ...lead, nicho: null, categoria_google: 'Químico farmacéutico' },
      undefined,
      espia.llm,
    )
    expect(espia.prompt()).toMatch(/de USTED/i)
  })

  it('a una panadería (el lead base) se le sigue tuteando', async () => {
    const espia = llmEspia()
    await generarDraftLead(lead, undefined, espia.llm)
    expect(espia.prompt()).toMatch(/Espanol de CHILE, tuteo/i)
  })

  it('el voseo argentino sigue prohibido tanto de tú como de usted', async () => {
    const espia = llmEspia()
    await generarDraftLead({ ...lead, nicho: 'abogados' }, undefined, espia.llm)
    expect(espia.prompt()).toMatch(/PROHIBIDO el voseo/i)
  })
})

// ---------------------------------------------------------------------------
// Limpiar el nombre de Google antes de saludar: "¿hablo con Miga S?" en vez de
// "Pastelería Miga's", número de local, y razón social completa.
// ---------------------------------------------------------------------------
describe('limpiarNombreParaSaludo', () => {
  it('saca "local 34" del saludo', () => {
    expect(limpiarNombreParaSaludo('Peluquería Santiago Barbería, local 34'))
      .not.toMatch(/local/i)
  })

  it('saca la razón social ("Limitada") del saludo', () => {
    expect(limpiarNombreParaSaludo('Comercial Ferretería Lazaros Limitada'))
      .not.toMatch(/limitada/i)
  })

  it('saca "Ltda" y "SpA"', () => {
    expect(limpiarNombreParaSaludo('Panificadora Don José Ltda.')).not.toMatch(/ltda/i)
    expect(limpiarNombreParaSaludo('Servicios Técnicos ABC SpA')).not.toMatch(/spa/i)
  })

  it('un nombre corto y normal no se toca', () => {
    expect(limpiarNombreParaSaludo('Panadería San José')).toBe('Panadería San José')
  })

  it('un nombre con posesivo corto (Pastelería Miga\'s) se mantiene entero', () => {
    // El caso real: "¿hablo con Miga S?" salió de tratar el nombre completo
    // como si sobrara algo que recortar. Sin forma jurídica ni número de
    // local ni más de 6 palabras, no hay nada que limpiar: se manda entero.
    expect(limpiarNombreParaSaludo("Pastelería Miga's")).toBe("Pastelería Miga's")
  })

  it('un nombre larguísimo se recorta, no se manda entero', () => {
    const largo = limpiarNombreParaSaludo(
      'Peluqueria Santiago Barberia Unisex Corte Y Color Estilo Moderno'
    )
    expect(largo.split(' ').length).toBeLessThanOrEqual(4)
  })

  it('si al limpiar queda demasiado corto, se vuelve al original', () => {
    // Un nombre real corto no debería quedar vacío ni reducido a nada por el
    // limpiador de formas jurídicas.
    expect(limpiarNombreParaSaludo('SA')).toBe('SA')
  })

  it('el prompt usa el nombre limpio para el saludo, no la razón social cruda', async () => {
    const espia = llmEspia()
    await generarDraftLead(
      { ...lead, nombre_negocio: 'Comercial Ferretería Lazaros Limitada' },
      undefined,
      espia.llm,
    )
    expect(espia.prompt()).toMatch(/Nombre para el saludo.*Ferretería Lazaros/)
    expect(espia.prompt()).not.toMatch(/Nombre para el saludo.*Limitada/)
  })
})
