import path from 'node:path';
import { z } from 'zod';
import { DEFAULT_TIMINGS } from './core/rooms/room-manager.ts';
import type { RoomLimits } from './core/rooms/room-manager.ts';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

export interface Config {
  env: 'development' | 'production' | 'test';
  host: string;
  port: number;
  /** Public origin (scheme://host[:port]). Mandatory in production; null means development rules. */
  publicOrigin: string | null;
  trustProxy: boolean;
  contentDir: string;
  clientDistDir: string;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  limits: RoomLimits;
}

const booleanString = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const originString = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.origin === value;
  } catch {
    return false;
  }
}, 'must be an origin such as https://jeux.example.com (no path, no trailing slash)');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    HOST: z.string().min(1).default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    PUBLIC_ORIGIN: originString.optional(),
    TRUST_PROXY: booleanString.default(false),
    CONTENT_DIR: z.string().min(1).optional(),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    MAX_ROOMS: z.coerce.number().int().min(1).max(10_000).default(100),
    MAX_PLAYERS_PER_ROOM: z.coerce.number().int().min(2).max(50).default(10),
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.PUBLIC_ORIGIN !== undefined, {
    path: ['PUBLIC_ORIGIN'],
    message: 'is required in production',
  });

export class ConfigError extends Error {}

export function loadConfig(source: Record<string, string | undefined>): Config {
  // Empty values (e.g. "PUBLIC_ORIGIN=" in .env) mean "not set".
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''));
  const parsed = envSchema.safeParse(cleaned);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new ConfigError(`Invalid configuration:\n${details.join('\n')}`);
  }
  const env = parsed.data;
  return {
    env: env.NODE_ENV,
    host: env.HOST,
    port: env.PORT,
    publicOrigin: env.PUBLIC_ORIGIN ?? null,
    trustProxy: env.TRUST_PROXY,
    contentDir: path.resolve(REPO_ROOT, env.CONTENT_DIR ?? 'content'),
    clientDistDir: path.join(REPO_ROOT, 'client', 'dist'),
    logLevel: env.LOG_LEVEL,
    limits: {
      maxRooms: env.MAX_ROOMS,
      maxPlayersPerRoom: env.MAX_PLAYERS_PER_ROOM,
      timings: DEFAULT_TIMINGS,
    },
  };
}
