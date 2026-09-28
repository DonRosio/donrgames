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

/** Client IP of a raw Node request (Socket.IO handshake). */
export function clientIpOf(request: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = request.headers['x-forwarded-for'];
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.socket.remoteAddress ?? 'unknown';
}
