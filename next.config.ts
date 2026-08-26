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
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Content-Security-Policy-Report-Only", value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
