import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: {
    timeout: 25_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3099',
    headless: false,
    channel: 'chrome',
    viewport: { width: 1440, height: 900 },
    actionTimeout: 15_000,
  },
  webServer: {
    command: 'node server.js',
    url: 'http://127.0.0.1:3099/api/health',
    env: {
      PORT: '3099',
      NODE_ENV: 'production',
    },
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
