import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { esIpPrivada, extraerVistaPrevia, urlPermitida } = await import('./vista-previa')

describe('esIpPrivada', () => {
  it('bloquea la red local, loopback y la metadata de la nube', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.1.10', '172.20.0.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', 'fd00::1', '::ffff:127.0.0.1']) {
      expect(esIpPrivada(ip), ip).toBe(true)
    }
  })
  it('deja pasar IPs públicas', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) expect(esIpPrivada(ip), ip).toBe(false)
  })
})

describe('urlPermitida', () => {
  it('rechaza lo que no es http(s), puertos raros, credenciales y hosts internos', async () => {
    expect(await urlPermitida('file:///etc/passwd')).not.toBeNull()
    expect(await urlPermitida('http://example.com:8080/')).not.toBeNull()
    expect(await urlPermitida('http://user:pass@example.com/')).not.toBeNull()
    expect(await urlPermitida('http://localhost/admin')).not.toBeNull()
    expect(await urlPermitida('http://127.0.0.1/')).not.toBeNull()
    expect(await urlPermitida('http://[::1]/')).not.toBeNull()
    expect(await urlPermitida('http://169.254.169.254/latest/meta-data')).not.toBeNull()
  })
})

describe('extraerVistaPrevia', () => {
  it('lee Open Graph, en cualquier orden de atributos, y resuelve la imagen relativa', () => {
    const html = `<html><head>
      <meta property="og:title" content="Landing &amp; diseño">
      <meta content="Una web muy buena" property="og:description">
      <meta property="og:image" content="/img/portada.png">
      <title>Otro título</title></head></html>`
    expect(extraerVistaPrevia(html, 'https://www.ejemplo.cl/x')).toEqual({
      titulo: 'Landing & diseño',
      descripcion: 'Una web muy buena',
      imagen: 'https://www.ejemplo.cl/img/portada.png',
      sitio: 'ejemplo.cl',
    })
  })
  it('sin Open Graph usa el <title> y el dominio', () => {
    const v = extraerVistaPrevia('<title> Hola  mundo </title>', 'https://tiktok.com/@a/video/1')
    expect(v.titulo).toBe('Hola mundo')
    expect(v.sitio).toBe('tiktok.com')
    expect(v.imagen).toBeNull()
  })
  it('descarta imágenes con protocolos raros', () => {
    const v = extraerVistaPrevia('<meta property="og:image" content="javascript:alert(1)">', 'https://a.cl')
    expect(v.imagen).toBeNull()
  })
})
