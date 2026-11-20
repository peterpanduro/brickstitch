import { defineConfig, devices } from '@playwright/test';

const PORT = 4317;

/** Smoke tests against the production build; `PW_CHANNEL=chrome` uses an installed Chrome. */
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${PORT}/`,
    locale: 'en-GB',
    channel: process.env.PW_CHANNEL,
  },
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
