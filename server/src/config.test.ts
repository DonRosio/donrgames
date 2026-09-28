import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.ts';

describe('loadConfig', () => {
  it('has development defaults', () => {
    const config = loadConfig({});
    expect(config).toMatchObject({
      env: 'development',
      host: '127.0.0.1',
      port: 3000,
      publicOrigin: null,
      trustProxy: false,
      limits: { maxRooms: 100, maxPlayersPerRoom: 10 },
    });
  });

  it('requires a public origin in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(ConfigError);
    expect(
      loadConfig({ NODE_ENV: 'production', PUBLIC_ORIGIN: 'https://jeux.example.com' })
        .publicOrigin,
    ).toBe('https://jeux.example.com');
  });

  it('rejects a public origin with a path or a trailing slash', () => {
    expect(() => loadConfig({ PUBLIC_ORIGIN: 'https://jeux.example.com/' })).toThrow(ConfigError);
    expect(() => loadConfig({ PUBLIC_ORIGIN: 'https://jeux.example.com/app' })).toThrow(
      ConfigError,
    );
  });

  it('treats empty values as unset and parses numbers and booleans', () => {
    const config = loadConfig({ PUBLIC_ORIGIN: '', PORT: '8080', TRUST_PROXY: 'true' });
    expect(config).toMatchObject({ publicOrigin: null, port: 8080, trustProxy: true });
  });
});
