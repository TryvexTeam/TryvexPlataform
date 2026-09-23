import { describe, it, expect } from 'vitest'
import { armarGuionDemo, type LeadParaDemo } from './guion-demo'

const base: LeadParaDemo = {
  nombre_negocio: 'Peluquería Época Estilistas',
  categoria_google: 'Peluquería',
  nicho: 'peluquerías',
  localidad: 'Moneda 782, 8320328 Santiago, Región Metropolitana, Chile',
  horario: 'lunes a sábado de 10:00 a 20:00',
  url_web: null,
  instagram: '@epocaestilistas',
  web_capacidades: null,
}

describe('guion de demo', () => {
  it('habla como el asistente del negocio, no como vendedor de Tryvex', () => {
    const g = armarGuionDemo(base)
    expect(g).toMatch(/^Eres el asistente de WhatsApp de Peluquería Época Estilistas, Peluquería\./)
    expect(g).not.toMatch(/vendedor|te escribimos de tryvex/i)
  })

  it('usa solo los datos que tiene, y los que faltan los dice como faltantes', () => {
    const g = armarGuionDemo({ ...base, horario: null, localidad: null })
    expect(g).toMatch(/Horario: no lo tienes/)
    expect(g).toMatch(/Dirección: no la tienes/)
    expect(g).toMatch(/Instagram: @epocaestilistas/)
    expect(g).not.toMatch(/Web:/)
  })

  it('nunca da precios, stock ni promociones: no los conoce', () => {
    expect(armarGuionDemo(base)).toMatch(/No das precios, stock, promociones/)
  })

  it('en una farmacia no recomienda medicamentos', () => {
    const g = armarGuionDemo({ ...base, nombre_negocio: 'Farmacia Los Andes', categoria_google: 'Farmacia' })
    expect(g).toMatch(/no recomiendas medicamentos/)
  })

  it('en un servicio de salud no diagnostica', () => {
    const g = armarGuionDemo({ ...base, categoria_google: 'Clínica dental' })
    expect(g).toMatch(/no diagnosticas/)
  })

  it('en una peluquería no agrega reglas de otros rubros', () => {
    const g = armarGuionDemo(base)
    expect(g).not.toMatch(/medicamentos|diagnosticas|asesoría legal/)
  })

  it('si le preguntan quién lo hizo, responde Tryvex con la dirección completa', () => {
    expect(armarGuionDemo(base)).toMatch(/Tryvex, https:\/\/tryvex\.tech/)
  })

  it('si su web ya hace algo, lo sabe', () => {
    const g = armarGuionDemo({ ...base, web_capacidades: { capacidades: ['reservas', 'formulario'] } })
    expect(g).toMatch(/En su web ya se puede: reservas, formulario/)
  })
})
