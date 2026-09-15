import type { Lead, TurnoPitch } from '@/lib/types/lead'

/**
 * Genera el guion de llamada en frío para un lead, personalizado con sus datos.
 *
 * No es un mensaje suelto: es la conversación completa que sigue el Playbook de
 * Llamada en Frío de Tryvex — apertura que cede el control, la señal del
 * negocio, la pregunta, el porqué (sin vender) y el cierre hacia un diagnóstico.
 *
 * La apertura usa una pregunta "no-orientada": está hecha para que respondan
 * "no, dale" — así el cliente siente que él manda, pero abre la puerta.
 *
 * Todo se arma acá con los campos del lead (rubro, reseñas, rating, si tiene
 * web, comuna), igual que se hizo para la hoja de llamadas. Cambiar el criterio
 * de los pitch = cambiar este archivo.
 */

export interface Guion {
  resumen: string
  turnos: TurnoPitch[]
  /** true si los turnos vienen de una edición a mano guardada, no del generador. */
  editado: boolean
}

type Familia = 'citas' | 'comida' | 'optica' | 'taller' | 'tienda' | 'generico'

const CITAS = new Set([
  'barberías', 'peluquerías', 'centros de estética',
  'kinesiólogos', 'dentistas', 'veterinarias',
])
const COMIDA = new Set(['cafeterías', 'restaurantes', 'pizzerías', 'panaderías'])

function familia(nicho: string | null): Familia {
  const n = (nicho ?? '').toLowerCase()
  if (CITAS.has(n)) return 'citas'
  if (COMIDA.has(n)) return 'comida'
  if (n === 'ópticas') return 'optica'
  if (n === 'talleres mecánicos') return 'taller'
  if (n === 'tiendas de ropa') return 'tienda'
  return 'generico'
}

/** Saca la comuna de una localidad tipo "Calle 123, 8330128 Providencia, Región…". */
export function comunaDe(localidad: string | null): string {
  if (!localidad) return 'la zona'
  const partes = localidad.split(',').map((p) => p.trim())
  const idx = partes.findIndex(
    (p) => /Región|Bío|Valparaíso|Metropolitana/i.test(p),
  )
  if (idx > 0) return partes[idx - 1].replace(/^\d+\s*/, '') || 'la zona'
  return partes[partes.length - 1] || 'la zona'
}

const PREGUNTA: Record<Familia, string> = {
  citas: 'Cuando un cliente nuevo los busca por Google o las redes sociales, ¿cómo termina agendando su hora hoy — te escribe, te llama, o llega a tu local y espera?',
  comida: 'Cuando alguien busca dónde comer cerca y los encuentra, ¿cómo ve hoy la carta y hace el pedido — por Instagram, WhatsApp, o tiene que ir al local?',
  optica: 'Cuando alguien necesita un examen de vista o busca marcos, ¿cómo llega hoy a ustedes — por Google, por recomendación, o pasando por fuera?',
  taller: 'Cuando a alguien se le echa a perder el auto y los busca, ¿cómo pide hoy la cotización o la hora — llamando no más, o tiene que ir hasta allá?',
  tienda: 'Cuando alguien ve algo suyo en Instagram y lo quiere, ¿cómo lo compra hoy si no puede pasar al local?',
  generico: 'Cuando alguien nuevo los descubre, ¿cuál es hoy la forma más común de que termine contactándolos o comprando?',
}

const BENEFICIO: Record<Familia, string> = {
  citas: 'un sitio donde tus clientes reservan la hora solos, a cualquier hora, sin que tengas que estar contestando — y que aparezcas en Google cuando buscan tu rubro en tu zona',
  comida: 'un sitio con tu carta siempre al día y pedidos directos, que salga en Google cuando la gente busca dónde comer cerca — sin depender de que alguien conteste el mensaje',
  optica: 'un sitio con tu catálogo y la agenda de exámenes online, con tus reseñas bien a la vista, que da la confianza que una compra de salud visual necesita',
  taller: 'un sitio donde te piden cotización y agendan solos, y tú recibes la pega ya filtrada, sin perder llamadas cuando estás metido bajo un auto',
  tienda: 'una tienda online con tu catálogo para vender también fuera del local, sin pagarle comisión a un marketplace',
  generico: 'un sitio web que capte los clientes que hoy se pierden por no aparecer en Google',
}

/**
 * Un halago real del negocio, no del numero de estrellas — eso va aparte, en
 * `traccion`. Sin esto la señal sonaba a que solo miramos el rating.
 */
const ALAGO: Record<Familia, string> = {
  citas: 'Se nota que le pones cariño al detalle en cada trabajo.',
  comida: 'Se nota que cuidan lo que sirven, no es solo llenar un plato.',
  optica: 'Se nota que explican bien las cosas antes de vender, y eso da confianza.',
  taller: 'Se nota que la gente confía en dejarles el auto, y eso no se gana fácil.',
  tienda: 'Se nota que cuidas cada pieza que subes, no es solo vender por vender.',
  generico: 'Se nota que hay un trabajo serio detrás de esto, no es cualquier cosa.',
}

/**
 * Respuestas a las objeciones mas comunes de una llamada en frio, tomadas del
 * Playbook de Llamada en Frio de Tryvex. No son parte del orden del guion: el
 * vendedor las usa solo si el negocio pone esa objecion puntual en la llamada.
 */
const OBJECIONES: TurnoPitch[] = [
  {
    rol: 'Objeción — “No me interesa”',
    texto: '“Totalmente. Antes de dejarte, ¿es porque ahora mismo esto no es prioridad o porque sientes que ya lo tienen resuelto?”',
    guia: 'Sección de referencia: se usa solo si el negocio pone esta objeción durante la llamada, no sigue el orden del guion.',
  },
  {
    rol: 'Objeción — “No tengo tiempo”',
    texto: '“Te entiendo. Justamente por eso no quiero explicarte nada ahora. Si te parece, dejamos una hora cerrada y en esa llamada vemos si hay algo que realmente valga la pena. Si no, lo dejamos ahí.”',
  },
  {
    rol: 'Objeción — “Mándame información”',
    texto: '“Claro. Puedo mandarte una presentación, pero sería bastante genérica. Lo que quería mostrarte nace de lo que vimos en tu negocio. Prefiero que usemos una llamada corta y que tú decidas con algo concreto delante. ¿Te acomoda martes o jueves para eso?”',
  },
  {
    rol: 'Objeción — “Ya tenemos página / agencia / alguien que ve eso”',
    texto: '“Perfecto, mejor todavía. No te estoy proponiendo reemplazar a nadie. Queremos revisar si hay algo entre lo que el cliente ve y cómo funciona el proceso por dentro que hoy esté quedando fuera. ¿Vemos 20 minutos igual, martes o jueves, para chequear eso puntual?”',
  },
  {
    rol: 'Objeción — “¿Cuánto cuesta?”',
    texto: '“El diagnóstico inicial no tiene costo. Si después detectamos algo que valga la pena implementar, en la reunión de entrega te mostramos una propuesta con alcance y precio. Tú decides si avanzas o no. ¿Partimos por ahí esta semana, martes o jueves?”',
  },
  {
    rol: 'Objeción — “No quiero IA”',
    texto: '“Está perfecto. Tampoco partimos desde la IA. Partimos desde el problema. Si se arregla con algo simple, te vamos a decir eso. ¿Vemos tu caso igual, martes o jueves, sin ningún compromiso?”',
  },
  {
    rol: 'Objeción — “Estamos bien como estamos”',
    texto: '“Puede ser. El diagnóstico también puede confirmar eso. ¿Vale la pena revisarlo en una llamada corta de 20 minutos, martes o jueves, aunque sea para confirmarlo?”',
  },
  {
    rol: 'Objeción — “Llámame más adelante”',
    texto: '“Dale. Para no quedar en el aire, ¿te parece que dejemos una fecha tentativa y si cambia algo la movemos?”',
  },
]

const RESUMEN: Record<Familia, string> = {
  citas: 'Sitio web con agenda de horas online (reservan solos, 24/7), galería de trabajos y contacto directo por WhatsApp. Menos horas por teléfono, menos citas perdidas.',
  comida: 'Sitio con carta/menú online, pedidos por WhatsApp y reservas, que aparezca en Google cuando buscan dónde comer cerca.',
  optica: 'Sitio con catálogo de marcas y agenda de exámenes de vista online, con reseñas a la vista. Confianza para una compra de salud visual.',
  taller: 'Sitio con cotización y agenda de hora online, servicios y ubicación claros. El cliente cotiza sin llamar y el taller filtra mejor la pega.',
  tienda: 'Tienda/catálogo online con productos, tallas y stock, más pedidos por WhatsApp. Vender fuera del local sin comisiones.',
  generico: 'Sitio web profesional que aparezca en Google, muestre el trabajo y capte clientes por WhatsApp.',
}

/**
 * Los tres estados de "¿tiene sitio web?", los mismos que usa `lib/vex/draft.ts`.
 *
 * Antes esto no existía acá: el guion afirmaba "no tienes un sitio web propio"
 * para todos. Para el 13,5% de la cartera que sí tiene uno, eso es falso en el
 * primer renglón — y el límite de Cristian fue textual: "no información falsa".
 *
 * `no-sabemos` es el caso real y frecuente: el auditor de leads encuentra un
 * dominio que responde con el nombre del negocio, pero no distingue un sitio
 * real de uno parqueado. Con `url_web` cargado y `tiene_web` en false, la
 * respuesta honesta no es sí ni no: es preguntar.
 */
export type EstadoWeb = 'si' | 'no' | 'no-sabemos'

export function estadoWebDelLead(lead: Lead): EstadoWeb {
  if (lead.tiene_web === true) return 'si'
  // Una URL cargada junto a un "no tiene web" es un dato que se contradice a
  // sí mismo: no alcanza para afirmar, pero sí para dejar de negar.
  if (lead.url_web?.trim()) return 'no-sabemos'
  return lead.tiene_web === false ? 'no' : 'no-sabemos'
}

/**
 * Lo que se le ofrece a un negocio que YA tiene sitio. No es una página: es que
 * esa página deje de ser un folleto y empiece a tomar el trabajo repetitivo.
 * Sale del catálogo real de tryvex.tech (automatización, IA aplicada).
 */
const BENEFICIO_CON_WEB: Record<Familia, string> = {
  citas: 'conectar tu web con la agenda para que el cliente reserve solo y te llegue confirmado, sin que nadie conteste el mensaje',
  comida: 'que los pedidos entren desde tu web o WhatsApp con las opciones ya puestas, en vez de ir preguntando uno por uno',
  optica: 'que la hora del examen se agende sola desde tu web y llegue al sistema, sin anotar a mano',
  taller: 'que la cotización entre por tu web con los datos del auto ya completos, y te llegue filtrada',
  tienda: 'conectar tu catálogo con el WhatsApp para que responder tallas, stock y precios deje de ser trabajo manual',
  generico: 'automatizar la parte repetitiva de atender clientes, para que tu web deje de ser solo una vitrina',
}

const RESUMEN_CON_WEB: Record<Familia, string> = {
  citas: 'Ya tienen sitio. La oportunidad es la agenda: que reserven solos y la hora llegue confirmada, sin contestar mensajes.',
  comida: 'Ya tienen sitio. La oportunidad son los pedidos: que entren con las opciones puestas en vez de coordinarse por WhatsApp.',
  optica: 'Ya tienen sitio. La oportunidad es la agenda de exámenes: que se reserve sola y entre al sistema.',
  taller: 'Ya tienen sitio. La oportunidad es la cotización: que entre con los datos completos y filtrada.',
  tienda: 'Ya tienen sitio. La oportunidad es el catálogo conectado al WhatsApp: tallas, stock y precios sin responder a mano.',
  generico: 'Ya tienen sitio. La oportunidad es automatizar lo repetitivo de atender clientes.',
}

/** La pregunta cambia: no es cómo los encuentran, es cuánto tiempo les cuesta atender. */
const PREGUNTA_CON_WEB: Record<Familia, string> = {
  citas: '¿Cuando alguien quiere hora, la reserva solo desde la web, o igual terminan escribiéndote por WhatsApp y tú los anotas?',
  comida: '¿Los pedidos entran solos desde la web, o igual terminan coordinándose por WhatsApp uno por uno?',
  optica: '¿La hora del examen se agenda sola desde la web, o la anotan ustedes cuando llaman?',
  taller: '¿Las cotizaciones llegan con los datos del auto ya puestos, o igual hay que preguntar todo por teléfono?',
  tienda: '¿Cuántas veces al día responden la misma pregunta de talla, stock o precio por WhatsApp?',
  generico: '¿Qué parte de atender a un cliente nuevo siguen haciendo a mano hoy?',
}

const RESUMEN_SIN_SABER: Record<Familia, string> = {
  citas: 'No sabemos si tienen sitio. Confirmarlo en la llamada: si no tienen, página con agenda; si tienen, conectar esa agenda para que reserven solos.',
  comida: 'No sabemos si tienen sitio. Confirmarlo en la llamada: si no tienen, carta y pedidos online; si tienen, que los pedidos entren solos.',
  optica: 'No sabemos si tienen sitio. Confirmarlo en la llamada: si no tienen, catálogo y agenda de exámenes; si tienen, automatizar esa agenda.',
  taller: 'No sabemos si tienen sitio. Confirmarlo en la llamada: si no tienen, cotización online; si tienen, que llegue con los datos completos.',
  tienda: 'No sabemos si tienen sitio. Confirmarlo en la llamada: si no tienen, catálogo online; si tienen, conectarlo al WhatsApp.',
  generico: 'No sabemos si tienen sitio. Confirmarlo en la llamada y, según eso, proponer la página o automatizar lo que ya tienen.',
}

/**
 * El guion a mostrar para un lead: si tiene un pitch editado a mano guardado, ese;
 * si no, el generado automáticamente desde sus datos.
 */
export function generarGuion(lead: Lead): Guion {
  if (lead.pitch && lead.pitch.length > 0) {
    return { resumen: generarGuionAuto(lead).resumen, turnos: lead.pitch, editado: true }
  }
  return generarGuionAuto(lead)
}

/** El guion SIEMPRE generado desde los datos, ignorando cualquier edición guardada. */
export function generarGuionAuto(lead: Lead): Guion {
  const f = familia(lead.nicho)
  const nom = lead.nombre_negocio || 'este negocio'
  const rubro = (lead.nicho ?? 'negocios').toLowerCase()
  const comuna = comunaDe(lead.localidad)
  const rating = lead.google_rating != null ? String(lead.google_rating).replace('.', ',') : null
  const resenas = lead.google_resenas ?? null
  const tieneIg = !!lead.instagram
  const nombre = lead.nombre_contacto?.trim()
  const saludo = nombre ? `¿hablo con ${nombre}?` : '¿hablo con el dueño o encargado?'

  // El halago va ANTES de las estrellas y sobre algo del rubro, no de un
  // numero — un elogio que solo mira el rating se siente automatico.
  const alago = ALAGO[f]
  // La señal se adapta a si tenemos las reseñas o no: nunca inventamos números.
  const traccion =
    resenas != null && rating != null
      ? `Además, **${resenas} reseñas con ${rating} estrellas** — te va muy bien… `
      : 'Además, se nota que te va bien… '
  // La señal se arma segun los tres estados. Afirmar "no tienes sitio web" a un
  // negocio que si tiene es falso en el primer renglon, y ahi se pierde la
  // conversacion entera: "no informacion falsa".
  const estadoWeb = estadoWebDelLead(lead)
  const cierreSeñal =
    estadoWeb === 'si'
      ? 'y **ya tienen su sitio web**, que es más de lo que hace la mayoría. ' +
        'Justo por eso te llamo: lo que veo no es que falte la página, es lo que ' +
        'pasa después — por eso preferí preguntarte antes de asumirlo.”'
      : estadoWeb === 'no-sabemos'
        ? 'Y acá me falta un dato: **no sé si tienen sitio web propio o no**. ' +
          'Preferí preguntarte en vez de dar por hecho cualquiera de las dos.”'
        : 'pero **no tienes un sitio web propio**. No sé si hoy eso te está costando ' +
          'clientes o no — por eso preferí preguntarte antes de asumirlo.”'
  const señal =
    `“Estuve mirando ${rubro} en ${comuna} y me quedé con el tuyo: ${alago} ${traccion}` +
    cierreSeñal +
    (tieneIg ? ' (Vi que sí tienes Instagram, así que gente te busca.)' : '')

  return {
    resumen:
      estadoWeb === 'si'
        ? RESUMEN_CON_WEB[f]
        : estadoWeb === 'no-sabemos'
          ? RESUMEN_SIN_SABER[f]
          : RESUMEN[f],
    editado: false,
    turnos: [
      {
        rol: 'Tú — apertura',
        texto: `“Hola, ${saludo} de ${nom}… Mira, te llamo de Tryvex. Déjame partir por lo más honesto: **¿sería mala idea que te robe treinta segundos para mostrarte algo que vi en tu negocio?**”`,
        guia: 'Es una pregunta hecha para que responda “no, dale” — así siente que él manda, pero te dio el paso. Si dice “no es mala idea”, “¿de qué se trata?” o “ya, dime”, sigue.',
      },
      {
        // Va DESPUES de que diga que si, no antes de pedir el permiso. El
        // propio Playbook pide evitar decir que hacen antes de que sientan
        // el problema; meter esto en la apertura obligaba al prospecto a
        // entender la empresa antes de darle el pie.
        rol: 'Tú — quiénes somos',
        texto: '“Somos una agencia consultora que se encarga de posicionar negocios en internet para que puedan tener mayor visibilidad y aumenten sus ingresos económicos, implementando la inteligencia artificial a medida.”',
      },
      { rol: 'Tú — la señal', texto: señal },
      {
        rol: 'Tú — pregunta',
        texto: `“${estadoWeb === 'si' ? PREGUNTA_CON_WEB[f] : PREGUNTA[f]}”`,
        guia: 'Deja que hable. Lo que responda es la punta del diagnóstico — anótalo.',
      },
      {
        // Pregunta de Implicacion (SPIN Selling, Neil Rackham): en vez de
        // decirle tu el tamano del problema, dejas que el mismo le ponga un
        // numero. Aunque conteste "no se, hartos", ya sintio el peso — eso
        // vende mas que cualquier frase armada.
        rol: 'Tú — implicación',
        texto:
          estadoWeb === 'si'
            ? '“Y todo ese tiempo que se va contestando lo mismo —¿cuántas horas a la semana calculas que son?”'
            : estadoWeb === 'no-sabemos'
              ? // Sin saber si tienen sitio, "alguien te busca y no te
                // encuentra" ya da por hecho que no lo encuentran. Se pregunta
                // por el trabajo manual, que es cierto en los dos casos.
                '“Y de los que llegan preguntando, ¿cuántos terminas atendiendo tú mismo uno por uno —más o menos, al día?”'
              : '“Y cuando eso pasa —que alguien te busca y no te encuentra, o se cansa de esperar— ¿tienes idea de cuántos se te van así, más o menos, al mes?”',
        guia: 'No le des tú el número: déjalo que lo diga él. La respuesta no importa tanto como el hecho de que la piense.',
      },
      {
        // Dato real, no inventado: Camara de Comercio de Santiago (CCS),
        // estudio 2024, citado por Emol 13-sep-2024 — "solo el 23,1% de las
        // pymes en Chile cuentan con presencia en linea a traves de una
        // pagina web" (o sea, ~77% no tiene). Si cambia el estudio,
        // actualizar el numero aca.
        rol: 'Tú — el porqué (sin vender)',
        texto:
          estadoWeb === 'si'
            ? `“Mira, no te llamo para venderte nada ahora. Lo que hacemos es ${BENEFICIO_CON_WEB[f]}. Tener la página es el primer paso y ya lo dieron; la mayoría se queda ahí, con una vitrina bonita que igual obliga a contestar todo a mano. Te quiero mostrar rapidito qué se puede sacar de encima.”`
            : estadoWeb === 'no-sabemos'
              ? // Dos turnos antes acabamos de decirle "no sé si tienen sitio".
                // Afirmar acá que le vamos a hacer uno se contradice con eso en
                // la misma llamada, y es justo lo que el lead escucha: que no
                // miramos su negocio. Se ofrece segun lo que conteste.
                `“Mira, no te llamo para venderte nada ahora. Depende de lo que me digas: si todavía no tienen sitio, lo que hacemos es ${BENEFICIO[f]}; y si ya tienen uno, lo que aportamos es ${BENEFICIO_CON_WEB[f]}. Por eso prefiero preguntarte antes que llegar con algo armado. Te quiero mostrar rapidito qué se puede hacer en tu caso.”`
              : `“Mira, no te llamo para venderte nada ahora. Lo que hacemos es ${BENEFICIO[f]}. Y esto no te pasa solo a ti: casi 8 de cada 10 pymes en Chile tampoco tienen página web propia. Por eso el que sí la tiene se está llevando a los clientes que te buscan a ti por Google. Te quiero mostrar rapidito qué te estás perdiendo.”`,
      },
      {
        rol: 'Tú — cierre',
        texto: '“Te propongo algo concreto: una **llamada de diagnóstico de solo 30 minutos, sin costo y sin compromiso**, donde revisamos tu caso puntual y tú decides si tiene sentido lo que te proponemos. Para dejar agendada la llamada, ¿te acomoda mejor **a principio de semana (lunes o martes)** o **hacia el final (jueves o viernes)**?”',
        guia: 'Cierra ofreciendo DÍAS de la semana, no un “cuándo puedes”. Reduce a dos opciones. Si agenda, la llamada cumplió: no sigas vendiendo.',
      },
      {
        rol: 'Tú — agenda un horario',
        texto: '“Okey, mira, tengo un cupo libre en la agenda: ¿a las 5 pm o a las 7 pm? ¿Cuál te acomoda?”',
        guia: 'Mismo criterio que con los días: dos horarios concretos, no “¿a qué hora te acomoda?”. Ajusta los horarios a la disponibilidad real antes de llamar.',
      },
      {
        rol: 'Tú — pide sus datos',
        texto: '“Perfecto, ¿me podrías dar tu nombre y tu correo, por favor, para enviarte el link de la reunión? Te estaría llegando al correo.”',
      },
      {
        rol: 'Tú — despedida',
        texto: '“Okey, ha sido un placer, [nombre]. De igual manera, nos vamos a comunicar contigo por WhatsApp para mantener el contacto. Chao, chao.”',
      },
      ...OBJECIONES,
    ],
  }
}
