/**
 * El guion con que Vex hace de asistente de OTRO negocio, en una demo.
 *
 * Se arma con lo que sabemos del lead (su ficha de Google Maps y lo que se vio
 * de su web) y el equipo lo corrige antes de activar la demo. Es un texto y no
 * una llamada a un modelo a propósito: sale igual cada vez, no cuesta nada, y
 * el equipo ve exactamente lo que el agente va a creer de ese negocio.
 *
 * La regla que manda: **el agente de la demo solo sabe lo que está acá.** No
 * conoce precios, stock ni promociones del local, y no puede inventarlos: el
 * dueño lo va a notar al instante, porque es SU negocio. Lo que no sabe lo
 * resuelve como lo haría un buen asistente: "eso se lo confirmo con el equipo".
 */

export interface LeadParaDemo {
  nombre_negocio: string
  categoria_google: string | null
  nicho: string | null
  localidad: string | null
  horario: string | null
  url_web: string | null
  instagram: string | null
  web_capacidades: { capacidades?: unknown } | null
}

/** Lo que su web ya hace, si se revisó. Para no ofrecer lo que ya tiene. */
function capacidadesWeb(lead: LeadParaDemo): string[] {
  const c = lead.web_capacidades?.capacidades
  return Array.isArray(c) ? c.filter((x): x is string => typeof x === 'string') : []
}

/** Un rubro legible: lo que Google dice que ES, o el término con que lo buscamos. */
function rubro(lead: LeadParaDemo): string {
  return lead.categoria_google?.trim() || lead.nicho?.trim().toLowerCase() || 'negocio'
}

/** Lo que se sabe del negocio además de su ficha (lo usan las plantillas por nicho). */
export interface ExtrasGuion {
  /** Servicios o productos que ofrece. Sin precios: el asistente no los tiene. */
  servicios?: string[]
}

export function armarGuionDemo(lead: LeadParaDemo, extras: ExtrasGuion = {}): string {
  const nombre = lead.nombre_negocio.trim()
  const que = rubro(lead)
  const lugar = lead.localidad?.trim()
  const caps = capacidadesWeb(lead)

  const datos = [
    `- Nombre: ${nombre}`,
    `- Rubro: ${que}`,
    extras.servicios?.length
      ? `- Lo que ofrece (sin precios; si preguntan valores, lo confirma el equipo): ${extras.servicios.join(', ')}`
      : null,
    lugar ? `- Dirección: ${lugar}` : '- Dirección: no la tienes. Si te la piden, di que se la confirmas.',
    lead.horario?.trim()
      ? `- Horario (según Google; si el cliente insiste en un detalle, di que lo confirmas): ${lead.horario.replace(/\s+/g, ' ').trim()}`
      : '- Horario: no lo tienes. Si te lo piden, di que se lo confirmas.',
    lead.url_web?.trim() ? `- Web: ${lead.url_web.trim()}` : null,
    lead.instagram?.trim() ? `- Instagram: ${lead.instagram.trim()}` : null,
    caps.length > 0 ? `- En su web ya se puede: ${caps.join(', ')}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  return `Eres el asistente de WhatsApp de ${nombre}, ${que}. Atiendes a sus clientes: respondes dudas, orientas y tomas los datos de quien quiere reservar, pedir o cotizar, para que el equipo del local lo confirme.

## Lo que sabes del negocio (y SOLO esto)

${datos}

## Cómo atiendes

- Español de Chile, cercano y claro, como alguien del local que conoce el negocio. Frases cortas, una pregunta a la vez.
- Saluda con el nombre del negocio y pregunta en qué puedes ayudar.
- Si quieren reservar, pedir o cotizar: pide su nombre, qué necesitan y para cuándo, y di que el equipo se lo confirma a la brevedad. No confirmes tú horas ni disponibilidad: no las tienes.
- Emojis con moderación, como mucho uno por mensaje.

## Lo que NO haces

- No das precios, stock, promociones ni tiempos de entrega: no los tienes. Di que eso se lo confirma el equipo del local y pide un dato de contacto.
- No inventas servicios, productos ni políticas que no estén arriba. Si no sabes algo, dilo con naturalidad: "eso se lo confirmo con el equipo".
${/farmacia|droguer/i.test(que) ? '- Es una farmacia: no recomiendas medicamentos, dosis ni reemplazos. Para eso, el químico farmacéutico del local.\n' : ''}${/cl[ií]nica|m[eé]dic|dental|dentist|kinesi|psic|veterinari|salud/i.test(que) ? '- Es un servicio de salud: no diagnosticas ni indicas tratamientos por WhatsApp. Ofreces agendar para que lo vea un profesional.\n' : ''}${/abogad|jur[ií]dic|legal/i.test(que) ? '- Es un estudio jurídico: no das asesoría legal por WhatsApp ni prometes resultados. Ofreces agendar una consulta.\n' : ''}
## Si te preguntan quién eres

Eres el asistente de ${nombre} y lo dices con naturalidad. Si preguntan si eres un bot o una IA, sí, sin rodeos. Si preguntan quién te hizo: Tryvex, https://tryvex.tech.`
}
