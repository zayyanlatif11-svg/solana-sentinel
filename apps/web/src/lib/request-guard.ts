/**
 * Proportionate CSRF / origin check for mutating POST /api/state.
 * Loopback clients without Origin (curl) are allowed when Host is loopback.
 * Remote bind (0.0.0.0) requires Origin in SAT_ALLOWED_ORIGINS.
 */

function loopbackHost(host: string): boolean {
  const h = host.split(":")[0]?.toLowerCase() ?? "";
  return h === "127.0.0.1" || h === "localhost" || h === "[::1]" || h === "::1";
}

export function allowedOrigins(): string[] {
  const extra = (process.env.SAT_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const port = process.env.SAT_BIND_PORT ?? process.env.PORT ?? "4317";
  return [
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    "http://127.0.0.1:4317",
    "http://localhost:4317",
    ...extra,
  ];
}

export function originAllowed(origin: string | null, host: string): boolean {
  if (origin) {
    if (allowedOrigins().includes(origin)) return true;
    try {
      const u = new URL(origin);
      return loopbackHost(u.host);
    } catch {
      return false;
    }
  }
  return loopbackHost(host);
}

export function mutatingRequestDenied(req: Request): string | null {
  const host = req.headers.get("host") ?? "";
  const origin = req.headers.get("origin");
  if (originAllowed(origin, host)) return null;
  return "Cross-origin mutation blocked";
}
