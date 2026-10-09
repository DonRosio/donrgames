import helmet from '@fastify/helmet';
import type { FastifyInstance } from 'fastify';
import type { Config } from '../../config.ts';
import { DomainError } from '../lib/errors.ts';
import { isAllowedOrigin } from '../lib/origin.ts';

const PERMISSIONS_POLICY = 'microphone=(self), camera=(), geolocation=(), payment=(), usb=()';

export async function registerSecurity(app: FastifyInstance, config: Config): Promise<void> {
  const https = config.publicOrigin?.startsWith('https://') ?? false;
  const socketOrigin = config.publicOrigin?.replace(/^http/, 'ws');

  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        // WebAssembly only (head cut-out); no 'unsafe-eval' for JavaScript.
        scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'blob:'],
        connectSrc: socketOrigin ? ["'self'", socketOrigin] : ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        ...(https ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    strictTransportSecurity: https ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
  });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('Permissions-Policy', PERMISSIONS_POLICY);
    if (request.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');

    // Defense in depth: browsers always send Origin on state-changing requests.
    const origin = request.headers.origin;
    const mutating = request.method !== 'GET' && request.method !== 'HEAD';
    if (mutating && origin !== undefined) {
      if (!isAllowedOrigin(origin, request.headers.host, config.publicOrigin)) {
        throw new DomainError('FORBIDDEN_ORIGIN');
      }
    }
  });
}
