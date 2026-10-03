// The engine's Socket.IO CORS allow-list. The SPA reaches the engine on its own
// origin through nginx, so the only legitimate origins are the frontend URLs
// compose passes in CORS_ORIGIN (LAN plus the static ngrok domain).
export function parseAllowedOrigins(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
