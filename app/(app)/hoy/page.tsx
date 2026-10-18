import { redirect } from 'next/navigation'

/**
 * `/hoy` se fusionó con el Panel de Mando.
 *
 * Sus tres secciones ya viven ahí y mejor resueltas: los leads enfriándose son
 * "Requiere acción hoy" (que mira interacciones reales en vez de `updated_at`),
 * las tareas por vencer son "Tus tareas de hoy", y los leads nuevos por score
 * son "Tus leads sin contactar". Además la página vieja se traía leads y tareas
 * COMPLETOS para filtrarlos en JavaScript.
 *
 * Queda el redirect y no un 404 porque la ruta está en los accesos directos de
 * la PWA (`app/manifest.ts`): quien tenga la app instalada de antes seguirá
 * teniendo ese icono en su pantalla hasta que el manifiesto se actualice, y
 * debe llevarlo a alguna parte.
 */
export default function HoyPage() {
  redirect('/dashboard')
}
