import { Resend } from 'resend'

/**
 * El link lo genera Supabase (`admin.generateLink`) y lo entrega Resend, igual que
 * las invitaciones. Motivo: el envío nativo de Supabase tiene un tope de correos muy
 * bajo sin SMTP propio, y el remitente sería genérico. Así el correo sale del dominio
 * de Tryvex y con el mismo control que el resto.
 */
export async function enviarEmailRecuperarPassword({
  email,
  link,
  minutosValidez = 60,
}: {
  email: string
  link: string
  minutosValidez?: number
}): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY)
  await resend.emails.send({
    from: 'Tryvex <tryvexentreprise@tryvex.tech>',
    replyTo: 'tryvexentreprise@gmail.com',
    to: email,
    subject: 'Restablecer tu contraseña de Tryvex',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="margin-bottom:8px">Restablecer contraseña</h2>
        <p style="color:#555;margin-bottom:24px">
          Recibimos una solicitud para cambiar la contraseña de esta cuenta.
          El link expira en <strong>${minutosValidez} minutos</strong> y sirve una sola vez.
        </p>
        <a href="${link}"
           style="display:inline-block;background:#111;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">
          Crear nueva contraseña
        </a>
        <p style="color:#999;font-size:12px;margin-top:24px">
          Si no fuiste tú, ignora este correo: tu contraseña actual sigue funcionando
          y nadie puede entrar sin este link.
        </p>
      </div>
    `,
  })
}
