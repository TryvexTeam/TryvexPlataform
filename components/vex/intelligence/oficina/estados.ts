import type { EstadoOficina } from '@/lib/agentes/estado-oficina'

// Aparte de la escena a propósito: la lista y la ficha los usan al cargar la
// página, y si vivieran en escena-oficina.tsx arrastrarían Three.js completo
// a esa primera carga.

export const COLOR_ESTADO: Record<EstadoOficina, string> = {
  trabajando: '#3fcf8e',
  descansando: '#6c9cf5',
  esperando_permiso: '#f3b54a',
  ausente: '#6b7079',
}

export const NOMBRE_ESTADO: Record<EstadoOficina, string> = {
  trabajando: 'Trabajando',
  descansando: 'Descansando',
  esperando_permiso: 'Esperando permiso',
  ausente: 'No está',
}
