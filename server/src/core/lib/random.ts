import { createHash, randomBytes, randomInt } from 'node:crypto';

/** Sources of randomness used by the core; replaceable in tests. */
export interface RandomSource {
  /** Secret session token: 256 bits, base64url (43 chars). */
  token(): string;
  /** Public identifier: `bytes` random bytes, base64url. */
  id(bytes: number): string;
  /** Uniform random string drawn from `alphabet`. */
  string(length: number, alphabet: string): string;
}

export const cryptoRandom: RandomSource = {
  token: () => randomBytes(32).toString('base64url'),
  id: (bytes) => randomBytes(bytes).toString('base64url'),
  string: (length, alphabet) => {
    let result = '';
    for (let i = 0; i < length; i++) result += alphabet[randomInt(alphabet.length)];
    return result;
  },
};

/** Session tokens are only ever stored hashed. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}
