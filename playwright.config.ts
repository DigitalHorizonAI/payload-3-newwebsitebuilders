import { defineConfig } from '@playwright/test'

import { baseURL, databaseURL, payloadSecret, port } from './tests/e2e/env'

const slowMo = Number(process.env.PLAYWRIGHT_SLOW_MO ?? '0')

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  /**
   * One worker, because every spec shares one database and one bootstrap
   * account. `fullyParallel: false` only serialises tests *within* a file —
   * separate files still ran in separate workers, so two specs raced to claim
   * `first-register` and the loser reported a confusing failure that did not
   * reproduce when its file was run alone.
   */
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 180000,
  expect: {
    timeout: 15000,
  },
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    launchOptions: slowMo > 0 ? { slowMo } : undefined,
  },
  webServer: {
    command: 'node ./tests/e2e/web-server.mjs',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_URI: databaseURL,
      DISABLE_SEARCH_SYNC: 'true',
      PAYLOAD_SECRET: payloadSecret,
      NEXT_PUBLIC_SERVER_URL: baseURL,
    },
    timeout: 180000,
  },
})
