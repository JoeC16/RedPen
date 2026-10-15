const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Same-origin check for state-changing requests to our own API routes.
 * Auth.js protects its own endpoints with a CSRF token and Next.js checks the
 * origin of server actions; this covers route handlers.
 */
export function isCrossSiteWrite(req: { method: string; url: string; headers: Headers }): boolean {
  if (SAFE_METHODS.has(req.method.toUpperCase())) return false;
  const path = new URL(req.url).pathname;
  if (!path.startsWith("/api/") || path.startsWith("/api/auth/")) return false;
  const origin = req.headers.get("origin");
  if (!origin) return req.headers.get("sec-fetch-site") !== "same-origin";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}
