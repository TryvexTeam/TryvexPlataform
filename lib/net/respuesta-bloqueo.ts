export function respuestaBloqueo(): Response {
  const html = '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Acceso bloqueado</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0b0c;color:#f4f4f5;font:16px system-ui"><main style="max-width:36rem;padding:2rem;text-align:center"><h1 style="font-size:1.5rem">No tienes acceso a Tryvex desde esta red</h1><p style="color:#a1a1aa">Contacta al administrador si crees que se trata de un error.</p></main></body></html>'
  return new Response(html, { status: 403, headers: { 'content-type': 'text/html; charset=utf-8' } })
}
