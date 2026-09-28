import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import { clientIpOf, createIpKeyer } from './client-ip.ts';

const request = (forwarded?: string | string[]) =>
  ({
    headers: forwarded === undefined ? {} : { 'x-forwarded-for': forwarded },
    socket: { remoteAddress: '127.0.0.1' },
  }) as unknown as IncomingMessage;

describe('client IP', () => {
  it('uses the socket address unless a proxy is trusted', () => {
    expect(clientIpOf(request('203.0.113.7'), false)).toBe('127.0.0.1');
    expect(clientIpOf(request(), true)).toBe('127.0.0.1');
  });

  it('behind a proxy, keeps the entry added by the proxy, not the forgeable ones', () => {
    expect(clientIpOf(request('203.0.113.7'), true)).toBe('203.0.113.7');
    expect(clientIpOf(request('1.2.3.4, 5.6.7.8, 203.0.113.7'), true)).toBe('203.0.113.7');
    expect(clientIpOf(request(['1.2.3.4', '203.0.113.7']), true)).toBe('203.0.113.7');
  });

  it('turns addresses into opaque, stable keys', () => {
    const key = createIpKeyer();
    expect(key('203.0.113.7')).toBe(key('203.0.113.7'));
    expect(key('203.0.113.7')).not.toContain('203');
    expect(key('203.0.113.7')).not.toBe(key('203.0.113.8'));
  });
});
