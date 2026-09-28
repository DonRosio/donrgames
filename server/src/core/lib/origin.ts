/**
 * Checks the Origin header of a browser request.
 * - In production, it must be exactly the public origin of the site.
 * - In development (no public origin configured), it must match the Host header: this accepts
 *   the Vite dev server, which proxies requests without rewriting their Host.
 */
export function isAllowedOrigin(
  origin: string | undefined,
  host: string | undefined,
  publicOrigin: string | null,
): boolean {
  if (!origin) return false;
  if (publicOrigin) return origin === publicOrigin;
  try {
    return host !== undefined && new URL(origin).host === host;
  } catch {
    return false;
  }
}
