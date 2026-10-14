/**
 * El dominio del CRM, para armar links que viajan fuera (correos, invitaciones,
 * webhooks de Google).
 *
 * Se queda SOLO con el origen (`https://dominio`) de `NEXT_PUBLIC_APP_URL`,
 * aunque la variable traiga una ruta o una barra al final. Pasó en producción:
 * la variable decía `https://tryvexplataform.vercel.app/login`, y todos los
 * links salían como `/login/auth/confirmar…` o `/login/signup…` → 404. El
 * correo de recuperar contraseña y las invitaciones no servían, y nadie lo
 * notaba hasta usarlos.
 *
 * `respaldo` es el origen del request (o `window.location.origin`), para cuando
 * la variable no está o viene mal escrita. Sin variable y sin respaldo, error:
 * un link a un dominio inventado es peor que no mandar nada.
 */
export function urlApp(respaldo?: string): string {
  const configurada = process.env.NEXT_PUBLIC_APP_URL
  if (configurada) {
    try {
      return new URL(configurada).origin
    } catch {
      // Mal escrita (sin https://, por ejemplo): se cae al respaldo.
    }
  }
  if (respaldo) return new URL(respaldo).origin
  throw new Error('NEXT_PUBLIC_APP_URL no configurado')
}
