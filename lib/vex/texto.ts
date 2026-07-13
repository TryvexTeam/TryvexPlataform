/**
 * Normaliza texto para comparaciones tolerantes: minúsculas, sin tildes/diacríticos,
 * sin espacios sobrantes. Así "Barberías" == "barberia" == "barberias".
 */
export function normalizar(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * ¿El valor coincide con el término buscado, ignorando tildes y singular/plural?
 * Matchea en ambos sentidos para que "barbería" encuentre "barberías" y viceversa.
 */
export function coincideTermino(valor: string | null | undefined, termino: string | null | undefined): boolean {
  const v = normalizar(valor);
  const t = normalizar(termino);
  if (!t) return true; // sin término = no filtra
  if (!v) return false;
  return v.includes(t) || t.includes(v);
}
