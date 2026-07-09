import { Resend } from 'resend'

/* Template portado de tryvex-landing (src/app/api/contact/route.ts):
   card oscuro con banner crema + franja roja + bloque de Meet. */

function meetBlock(meetLink: string, label: string) {
  return `
  <table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 28px;">
    <tr>
      <td style="background:#1e1e1e;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:20px 24px;">
        <p style="margin:0 0 10px;color:rgba(255,255,255,0.4);font-size:9px;letter-spacing:0.18em;text-transform:uppercase;font-weight:700;">${label}</p>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="color:rgba(255,255,255,0.55);font-size:12px;word-break:break-all;padding-right:12px;">
              <a href="${meetLink}" style="color:rgba(255,255,255,0.55);text-decoration:none;">${meetLink}</a>
            </td>
            <td style="white-space:nowrap;">
              <a href="${meetLink}" style="display:inline-block;background:#e53935;color:#fff;text-decoration:none;padding:10px 20px;border-radius:999px;font-weight:600;font-size:12px;letter-spacing:0.03em;">
                Abrir →
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`
}

function slotBlock(fecha: string, hora: string) {
  return `
    <table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 28px;">
      <tr>
        <td style="background:#1e1e1e;border-left:3px solid #e53935;border-radius:8px;padding:18px 22px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <p style="margin:0 0 4px;color:rgba(255,255,255,0.4);font-size:9px;letter-spacing:0.14em;text-transform:uppercase;font-weight:700;">Fecha</p>
                <p style="margin:0;color:#ffffff;font-size:15px;font-weight:600;">${fecha}</p>
              </td>
              <td style="text-align:right;">
                <p style="margin:0 0 4px;color:rgba(255,255,255,0.4);font-size:9px;letter-spacing:0.14em;text-transform:uppercase;font-weight:700;">Hora</p>
                <p style="margin:0;color:#ffffff;font-size:15px;font-weight:600;">${hora} hrs</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`
}

function buildCitaEmail({ titulo, fecha, hora, meetLink }: {
  titulo: string
  fecha: string
  hora: string
  meetLink: string | null
}) {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Cita confirmada · Tryvex</title></head>
<body style="margin:0;padding:0;background:#090909;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#090909;padding:40px 16px 56px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td style="border-radius:20px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="background:#edeae2;padding:36px 40px 32px;text-align:center;">
              <img src="https://tryvex.tech/logo-email-dark.png" width="180" alt="tryvex." style="display:block;margin:0 auto;border:0;height:auto;max-width:180px;"/>
            </td></tr>
            <tr><td style="background:#e53935;height:3px;font-size:0;line-height:0;">&#8203;</td></tr>
            <tr><td style="background:#111111;padding:32px 40px 28px;border-bottom:1px solid rgba(255,255,255,0.05);">
              <p style="margin:0 0 6px;color:#e53935;font-size:9px;letter-spacing:0.2em;text-transform:uppercase;font-weight:700;">Cita confirmada</p>
              <h2 style="margin:0 0 6px;color:#ffffff;font-size:28px;font-weight:700;letter-spacing:-0.02em;line-height:1.15;">${titulo}</h2>
              <p style="margin:0;color:rgba(255,255,255,0.35);font-size:12px;letter-spacing:0.04em;">Equipo Tryvex</p>
            </td></tr>
            <tr><td style="background:#111111;padding:32px 40px 36px;">
              <p style="margin:0 0 28px;color:rgba(255,255,255,0.6);font-size:15px;line-height:1.72;">
                Te esperamos en la fecha agendada. Si algo cambia, respóndenos este correo y coordinamos un nuevo horario.
              </p>
              ${slotBlock(fecha, hora)}
              ${meetLink ? meetBlock(meetLink, 'Tu enlace de Google Meet') : ''}
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr><td style="height:1px;background:rgba(255,255,255,0.06);"></td></tr></table>
              <p style="margin:0;color:rgba(255,255,255,0.35);font-size:13px;line-height:1.65;">
                ¿Necesitas reagendar? Escríbenos a
                <a href="mailto:tryvexentreprise@gmail.com" style="color:#e53935;text-decoration:none;">tryvexentreprise@gmail.com</a>
                y te respondemos el mismo día.
              </p>
            </td></tr>
            <tr><td style="background:#090909;border-top:1px solid rgba(255,255,255,0.05);padding:18px 40px;text-align:center;">
              <p style="margin:0;color:rgba(255,255,255,0.2);font-size:11px;letter-spacing:0.06em;">© MMXXVI · Tryvex Studio · Santiago, Chile</p>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

/** Envía la confirmación de cita (template landing) a invitados externos. Best-effort. */
export async function enviarEmailCita({ emails, titulo, inicio, meetLink }: {
  emails: string[]
  titulo: string
  inicio: string
  meetLink: string | null
}): Promise<void> {
  if (emails.length === 0) return
  const resend = new Resend(process.env.RESEND_API_KEY)
  const d = new Date(inicio)
  const fecha = d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Santiago' })
  const hora = d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Santiago' })
  await resend.emails.send({
    from: 'Tryvex <tryvexentreprise@tryvex.tech>',
    replyTo: 'tryvexentreprise@gmail.com',
    to: emails,
    subject: `Cita confirmada · ${titulo}`,
    html: buildCitaEmail({ titulo, fecha, hora, meetLink }),
  })
}
