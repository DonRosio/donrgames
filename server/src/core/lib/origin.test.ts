import { describe, expect, it } from 'vitest';
import { isAllowedOrigin } from './origin.ts';

describe('isAllowedOrigin', () => {
  it('requires the exact public origin in production', () => {
    const publicOrigin = 'https://jeux.example.com';
    expect(isAllowedOrigin('https://jeux.example.com', 'jeux.example.com', publicOrigin)).toBe(
      true,
    );
    expect(isAllowedOrigin('https://evil.example.com', 'jeux.example.com', publicOrigin)).toBe(
      false,
    );
    expect(isAllowedOrigin('http://jeux.example.com', 'jeux.example.com', publicOrigin)).toBe(
      false,
    );
  });

  it('requires the origin to match the Host header in development', () => {
    expect(isAllowedOrigin('https://192.168.1.20:5173', '192.168.1.20:5173', null)).toBe(true);
    expect(isAllowedOrigin('http://evil.test', 'localhost:5173', null)).toBe(false);
  });

  it('rejects missing or malformed origins', () => {
    expect(isAllowedOrigin(undefined, 'localhost:5173', null)).toBe(false);
    expect(isAllowedOrigin('null', 'localhost:5173', null)).toBe(false);
  });
});
