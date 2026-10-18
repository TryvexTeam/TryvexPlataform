import { describe, expect, it } from 'vitest'
import { linkGoogleMaps, linkRuta } from './mapa'

describe('linkGoogleMaps', () => {
  it('usa el cid (la segunda mitad del place_id, en decimal)', () => {
    expect(linkGoogleMaps({ placeId: '0x9662c5a1:0xff', lat: -33.4, lng: -70.6 })).toBe('https://www.google.com/maps?cid=255')
  })
  it('sin place_id cae a las coordenadas', () => {
    expect(linkGoogleMaps({ placeId: null, lat: -33.4, lng: -70.6 })).toContain('query=-33.4%2C-70.6'.replace('%2C', ','))
  })
})

describe('linkRuta', () => {
  it('el último local es el destino y los demás son paradas, en orden', () => {
    const url = linkRuta([
      { lat: -33.1, lng: -70.1 },
      { lat: -33.2, lng: -70.2 },
      { lat: -33.3, lng: -70.3 },
    ]) as string
    const q = new URL(url).searchParams
    expect(q.get('destination')).toBe('-33.3,-70.3')
    expect(q.get('waypoints')).toBe('-33.1,-70.1|-33.2,-70.2')
  })
  it('sin paradas no hay ruta', () => {
    expect(linkRuta([])).toBeNull()
  })
})
