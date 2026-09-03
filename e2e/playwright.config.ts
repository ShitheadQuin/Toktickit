import { defineConfig, devices } from '@playwright/test';

// labsheet §9.2/§8.8: Playwright E2E, UI style and responsive evidence for Lab 2 (Issue #17).
// Starts both dev servers so tests hit the real app through the Vite proxy, exactly like a
// Requester would - no mocked fetches here, unlike the Vitest UI suites in client/tests.
export default defineConfig({
  testDir: './lab-02',
  fullyParallel: false,
  // One worker, not just one test at a time within a file. Separate describes are handed to
  // separate workers otherwise, so requester-ticket-flow can be creating its fixture Tickets
  // while responsive.spec.ts is capturing the My Tickets screenshots - and those fixtures then
  // appear in the RESP-01 evidence. Costs a few seconds; the screenshots are graded.
  workers: 1,
  retries: 0,
  reporter: [['list']],
  globalTeardown: require.resolve('./global-teardown'),
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run dev',
      cwd: '../server',
      url: 'http://localhost:3000/api/health',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npm run dev',
      cwd: '../client',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
