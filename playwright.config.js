import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', fullyParallel: false, workers: 1,
  use: { baseURL: 'http://127.0.0.1:3101', channel: 'msedge', trace: 'retain-on-failure' },
  webServer: { command: 'node tests/browser/server.js', url: 'http://127.0.0.1:3101', reuseExistingServer: false, timeout: 30000 },
});
