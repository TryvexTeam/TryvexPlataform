import { google } from 'googleapis'

// Portado de tryvex-landing (src/lib/google-calendar.ts) — mismas credenciales OAuth
export function getGoogleAuth() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Credenciales de Google Calendar no configuradas')
  }

  const auth = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'https://developers.google.com/oauthplayground'
  )
  auth.setCredentials({ refresh_token: refreshToken })
  return auth
}

export function getCalendarClient() {
  return google.calendar({ version: 'v3', auth: getGoogleAuth() })
}

export function getCalendarId(): string {
  const id = process.env.GOOGLE_CALENDAR_ID
  if (!id) throw new Error('GOOGLE_CALENDAR_ID no configurado')
  return id
}
