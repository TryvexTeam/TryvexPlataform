import type { NextConfig } from "next";

/**
 * CSP en modo Report-Only a propósito: el CRM habla con demasiados orígenes
 * de terceros (Google APIs, YouTube/YouTube Music embebidos, Cloudflare RTC
 * para llamadas, Groq/OpenRouter, Facebook Graph, Supabase realtime por
 * websocket) como para bloquear en base a un mapeo hecho a mano sin ver
 * violaciones reales primero. Reporta sin romper nada; cuando el reporte
 * confirme que la lista de orígenes está completa, pasar a enforce quitando
 * "-Report-Only" del header.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://www.googleapis.com https://generativelanguage.googleapis.com https://graph.facebook.com https://rtc.live.cloudflare.com",
  "frame-src 'self' https://www.youtube.com https://music.youtube.com https://vimeo.com",
  "media-src 'self' blob: https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Todo el CRM, MENOS el endpoint que sirve adjuntos del chat.
        //
        // `X-Frame-Options: DENY` llegó el 26-ago-2026 con la auditoría de
        // seguridad y está bien para las pantallas: impide que alguien monte el
        // CRM dentro de un marco ajeno y le robe clics al que está logueado.
        //
        // Pero aplicado a `/:path*` alcanzaba también a
        // `/api/chat/adjuntos/[id]`, que existe justamente PARA mostrarse
        // dentro de un marco: es lo que dibuja la vista previa de un HTML o un
        // PDF en el chat. El navegador rechazaba enmarcarlo y mostraba
        // "ha rechazado la conexión" sobre un recuadro en blanco — sin error en
        // consola, sin fallo en el servidor, sin nada que delatara la causa.
        // El visor estaba sano; lo bloqueaba una cabecera puesta cinco días
        // después de construirlo.
        //
        // Ese endpoint trae su propia protección, que es la que de verdad
        // importa acá: sirve el archivo con `Content-Security-Policy: sandbox`,
        // así que el navegador lo trata como origen opaco —sin cookies, sin
        // sesión, sin acceso al CRM— y además solo se deja enmarcar desde
        // nuestro propio dominio.
        source: "/((?!api/chat/adjuntos).*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Content-Security-Policy-Report-Only", value: csp },
        ],
      },
      {
        // El endpoint de adjuntos: mismas protecciones, menos el DENY que le
        // impedía cumplir su función. Se deja enmarcar solo desde este dominio.
        source: "/api/chat/adjuntos/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};

export default nextConfig;
