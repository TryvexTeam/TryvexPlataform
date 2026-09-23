import { describe, it, expect } from 'vitest'
import { etiquetaHerramienta, sinSecretos, tocaAvisar } from './actividad.mjs'

describe('etiquetaHerramienta', () => {
  it('de un comando: su descripción, nunca los argumentos', () => {
    expect(etiquetaHerramienta('Bash', { command: 'npm test -- --token=abc', description: 'Correr las pruebas' }))
      .toBe('Bash · Correr las pruebas')
  })

  it('sin descripción: solo el programa', () => {
    expect(etiquetaHerramienta('Bash', { command: 'cd /home/x && curl -H "Authorization: Bearer txa_123456789" https://api' }))
      .toBe('Bash · curl')
  })

  it('un comando raro no deja pasar basura', () => {
    expect(etiquetaHerramienta('Bash', { command: '$(cat secreto)' })).toBe('Bash · comando')
  })

  it('de un archivo: solo el nombre, sin la carpeta', () => {
    expect(etiquetaHerramienta('Edit', { file_path: 'C:\\Users\\w10\\proyecto\\src\\lib\\db.ts' })).toBe('Edit · db.ts')
    expect(etiquetaHerramienta('Read', { file_path: '/home/ana/.ssh/config' })).toBe('Read · config')
  })

  it('MCP, web y subagentes', () => {
    expect(etiquetaHerramienta('mcp__tryvex__tryvex_encargos', {})).toBe('MCP · tryvex/tryvex_encargos')
    expect(etiquetaHerramienta('WebFetch', { url: 'https://docs.example.com/x?y=1' })).toBe('Leyendo web · docs.example.com')
    expect(etiquetaHerramienta('Task', { description: 'Revisar el proxy' })).toBe('Subagente · Revisar el proxy')
  })

  it('oculta cualquier cosa con forma de clave', () => {
    expect(etiquetaHerramienta('Grep', { pattern: 'sk-abcdefghijklmnop' })).toBe('Grep · [oculto]')
    expect(sinSecretos('clave ghp_1234567890abcdef ok')).toBe('clave [oculto] ok')
  })

  it('nunca pasa del largo que acepta el CRM', () => {
    expect(etiquetaHerramienta('Bash', { description: 'x'.repeat(500) }).length).toBeLessThanOrEqual(90)
  })

  it('una herramienta desconocida: solo su nombre', () => {
    expect(etiquetaHerramienta('TodoWrite', { todos: ['secreto'] })).toBe('TodoWrite')
  })
})

describe('tocaAvisar', () => {
  it('no avisa más de una vez cada 4 segundos', () => {
    expect(tocaAvisar(0, 1000)).toBe(true)
    expect(tocaAvisar(1000, 3000)).toBe(false)
    expect(tocaAvisar(1000, 5000)).toBe(true)
  })
})
