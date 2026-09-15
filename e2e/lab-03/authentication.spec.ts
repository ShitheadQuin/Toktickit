import { test, expect } from '@playwright/test';
import { E2E_AUTH_EMAIL, E2E_AUTH_INITIAL_PASSWORD, setUpAuthFixtureUser, tearDownAuthFixtureUser } from './fixtures';

// E2E-01 (AC-01, AC-02, AC-07): log in with an initial password, forced change, reach the app,
// log out, attempt to revisit a protected URL.
//
// Note on scope: #36, not #35, adds a client-side route guard that redirects an unauthenticated
// visitor away from a protected screen - no Lab 2 screen is authenticated yet at this point in
// the sprint (they still key off the Development Requester selector). So "blocked after logout"
// is verified at the layer #35 actually builds: the session cookie itself, via a direct
// GET /api/auth/me request through the same browser context Playwright is driving, which proves
// the server no longer honors the old cookie. #36 can extend this spec once a protected route
// exists to redirect from.
test.describe('Authentication', () => {
  test.beforeAll(async () => {
    await setUpAuthFixtureUser();
  });

  test.afterAll(async () => {
    await tearDownAuthFixtureUser();
  });

  test('initial password forces a change before the app is reachable, then logout blocks the session', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(E2E_AUTH_EMAIL);
    await page.getByLabel(/^password$/i).fill(E2E_AUTH_INITIAL_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();

    // AC-02: normal screens stay unavailable until the change is made.
    await page.waitForURL('**/change-password');
    await expect(page.getByRole('heading', { name: /change password/i })).toBeVisible();

    const newPassword = 'ChangedPass1';
    await page.getByLabel(/current password/i).fill(E2E_AUTH_INITIAL_PASSWORD);
    await page.getByLabel(/^new password$/i).fill(newPassword);
    await page.getByLabel(/confirm new password/i).fill(newPassword);
    await expect(page.getByRole('button', { name: /continue/i })).toBeEnabled();
    await page.getByRole('button', { name: /continue/i }).click();

    // AC-01: the app is reachable once the change is saved - no longer stuck on Change Password.
    await page.waitForURL((url) => !url.pathname.includes('change-password'));

    const meWhileLoggedIn = await page.request.get('/api/auth/me');
    expect(meWhileLoggedIn.status()).toBe(200);

    // AC-07/BR-11: logout invalidates the session; the same browser context can no longer reach
    // a session-protected endpoint.
    await page.request.post('/api/auth/logout');
    const meAfterLogout = await page.request.get('/api/auth/me');
    expect(meAfterLogout.status()).toBe(401);
  });
});
