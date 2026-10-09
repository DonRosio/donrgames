import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';
import type { Project } from '@playwright/test';
import { E2E_ORIGIN } from './tests/e2e/env.ts';

// The installed Chrome and Brave are used, never a downloaded Chromium: Chromium builds cannot
// play H.264 videos, and these two browsers are the real target.
const BRAVE = process.env.BRAVE_PATH ?? '/usr/bin/brave-browser';

const args = [
  // Fake microphone (a beeping tone) granted without a prompt.
  '--use-fake-device-for-media-stream',
  '--use-fake-ui-for-media-stream',
  '--autoplay-policy=no-user-gesture-required',
  // Software WebGL: the head cut-out (MediaPipe) needs it, headless or not.
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
];

const projects: Project[] = [
  { name: 'chrome', use: { channel: 'chrome', launchOptions: { args } } },
];
if (existsSync(BRAVE)) {
  projects.push({ name: 'brave', use: { launchOptions: { executablePath: BRAVE, args } } });
}

export default defineConfig({
  testDir: 'tests/e2e',
  // One game at a time: parallel games would compete for the CPU and blur the audio timing.
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  timeout: 240_000,
  expect: { timeout: 60_000 },
  reporter: [['list']],
  use: {
    baseURL: E2E_ORIGIN,
    actionTimeout: 60_000,
    trace: 'retain-on-failure',
  },
  projects,
  webServer: {
    command: 'node tests/e2e/server.ts',
    url: `${E2E_ORIGIN}/api/health`,
    reuseExistingServer: false,
    stdout: 'pipe',
    timeout: 30_000,
  },
});
