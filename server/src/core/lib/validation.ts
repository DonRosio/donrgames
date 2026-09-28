import type { z } from 'zod';
import { DomainError } from './errors.ts';

/** Parses untrusted input; any mismatch becomes a generic INVALID_PAYLOAD error. */
export function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new DomainError('INVALID_PAYLOAD');
  return result.data;
}
