import { Resend } from 'resend'

export async function enviarEmailInvitacion({
  email,
  link,
}: {
  email: string
  link: string
}): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY)
  await resend.emails.send({
    from: 'Tryvex <tryvexentreprise@tryvex.tech>',
    replyTo: 'tryvexentreprise@gmail.com',
    to: email,
    subject: 'Te invitaron a Tryvex',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="margin-bottom:8px">Tienes una invitación</h2>
        <p style="color:#555;margin-bottom:24px">
          Alguien de tu equipo te invitó a unirte a Tryvex.
          Este link expira en <strong>30 minutos</strong> y es de un solo uso.
        </p>
        <a href="${link}"
           style="display:inline-block;background:#111;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">
          Aceptar invitación
        </a>
        <p style="color:#999;font-size:12px;margin-top:24px">
          Si no esperabas este email, puedes ignorarlo.
        </p>
      </div>
    `,
  })
}
