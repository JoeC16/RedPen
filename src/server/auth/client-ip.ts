/**
 * The client's address, for per-address sign-in limits. Clients can send any
 * X-Forwarded-For they like, so we never trust its left-most entry:
 * - CLIENT_IP_HEADER names a header the hosting proxy sets itself and clients
 *   cannot forge (on Fly.io: fly-client-ip). Use it when there is one.
 * - Otherwise the right-most X-Forwarded-For entry, which the nearest proxy
 *   appended, so a client cannot choose it.
 */
export function clientIp(headers: Headers, trustedHeader = process.env.CLIENT_IP_HEADER): string {
  if (trustedHeader) return headers.get(trustedHeader)?.trim() ?? "";
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",").at(-1)?.trim() ?? "";
  return headers.get("x-real-ip")?.trim() ?? "";
}
