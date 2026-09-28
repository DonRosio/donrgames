import { createHmac, randomBytes } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

/**
 * Turns an IP address into an opaque key (HMAC with a secret drawn at startup), so that rate
 * limiters never keep raw IP addresses, even in memory.
 */
export function createIpKeyer(): (ip: string) => string {
  const secret = randomBytes(32);
  return (ip) => createHmac('sha256', secret).update(ip).digest('base64url').slice(0, 22);
}

/**
 * Client IP of a raw Node request (Socket.IO handshake). Behind one trusted reverse proxy, only
 * the last X-Forwarded-For entry (added by that proxy) is reliable: the earlier ones come from
 * the client and could be forged to dodge the rate limits.
 */
export function clientIpOf(request: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const header = request.headers['x-forwarded-for'];
    const forwarded = Array.isArray(header) ? header.join(',') : header;
    const last = forwarded?.split(',').at(-1)?.trim();
    if (last) return last;
  }
  return request.socket.remoteAddress ?? 'unknown';
}
