import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'shared', include: ['shared/src/**/*.test.ts'], environment: 'node' } },
      { test: { name: 'server', include: ['server/src/**/*.test.ts'], environment: 'node' } },
      { test: { name: 'client', include: ['client/src/**/*.test.ts'], environment: 'node' } },
      // Cross-package checks (server and client registries).
      { test: { name: 'registries', include: ['tests/**/*.test.ts'], environment: 'node' } },
    ],
  },
});
