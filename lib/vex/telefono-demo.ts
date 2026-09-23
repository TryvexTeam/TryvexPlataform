/** El mismo número debe reservar una sola demo, venga escrito con espacios o con +. */
export function normalizarTelefonoDemo(texto: string): string | null {
  let digitos = texto.replace(/\D/g, '')
  if (/^9\d{8}$/.test(digitos)) digitos = `56${digitos}`
  return /^[0-9]{8,15}$/.test(digitos) ? digitos : null
}
