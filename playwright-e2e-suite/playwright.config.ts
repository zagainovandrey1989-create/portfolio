import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);
const port = Number(process.env.E2E_PORT ?? 4173);

/**
 * Set E2E_BASE_URL to run the suite against an already running / deployed instance.
 * Otherwise the Task Board app in ../fullstack-task-board is built and started
 * with an ephemeral in-memory SQLite database.
 */
const externalBaseURL = process.env.E2E_BASE_URL;
const baseURL = externalBaseURL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 5_000 },

  reporter: isCI
    ? [['github'], ['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],

  use: {
    baseURL,
    headless: true,
    testIdAttribute: 'data-testid',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: externalBaseURL
    ? undefined
    : {
        command: 'npm run build && npm start',
        cwd: path.resolve(__dirname, '../fullstack-task-board'),
        url: `${baseURL}/api/health`,
        reuseExistingServer: !isCI,
        timeout: 180_000,
        stdout: 'ignore',
        stderr: 'pipe',
        env: {
          PORT: String(port),
          HOST: '127.0.0.1',
          DATABASE_PATH: ':memory:',
          LOG_LEVEL: 'warn',
          NODE_ENV: 'production',
        },
      },
});
