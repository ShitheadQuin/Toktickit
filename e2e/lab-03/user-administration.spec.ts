import { test, expect, type Page } from '@playwright/test';
import {
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  E2E_CREATED_USER_EMAIL,
  E2E_EDIT_TARGET_EMAIL,
  setUpUserAdminFixtures,
  tearDownUserAdminFixtures,
} from './fixtures';

// E2E-03 (AC-18, AC-19, AC-20, AC-21): an Administrator creates a user with one role and a generated
// initial password, the new user logs in and must change it, the Administrator edits another user,
// then tries to deactivate their own account and to give up the last Administrator role.
async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/^password$/i).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
}

async function findUser(page: Page, text: string) {
  await page.getByLabel('Search', { exact: true }).fill(text);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.locator('.tt-user-table tbody tr')).toHaveCount(1);
}

test.describe('Administrator user administration (E2E-03)', () => {
  test.beforeAll(async () => {
    await setUpUserAdminFixtures();
  });

  test.afterAll(async () => {
    await tearDownUserAdminFixtures();
  });

  test('create, forced first change, edit, and both blocked changes', async ({ page, browser }) => {
    await signIn(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD);
    await page.waitForURL('**/users');

    // AC-19: create an IT Staff user; the one-time password is shown once.
    await page.getByRole('button', { name: 'Add user' }).click();
    await page.getByLabel('Name', { exact: true }).fill('E2E Created Staff');
    await page.getByLabel('Email', { exact: true }).fill(E2E_CREATED_USER_EMAIL);
    await page.getByRole('radio', { name: 'IT Staff' }).check();
    await page.getByRole('button', { name: 'Create user' }).click();
    const initialPassword = (await page.locator('.tt-initial-password-reveal code').textContent())!.trim();
    expect(initialPassword).toMatch(/^[A-Za-z0-9]{12}$/);
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.locator('.tt-initial-password-reveal')).toHaveCount(0);

    // AC-18: the same email again is refused, next to the email field.
    await page.getByRole('button', { name: 'Add user' }).click();
    await page.getByLabel('Name', { exact: true }).fill('Duplicate');
    await page.getByLabel('Email', { exact: true }).fill(E2E_CREATED_USER_EMAIL);
    await page.getByRole('button', { name: 'Create user' }).click();
    await expect(page.getByText('This email is already in use.')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();

    // AC-19: the new user signs in with it and must choose a new password first.
    const newUserContext = await browser.newContext();
    const newUser = await newUserContext.newPage();
    await signIn(newUser, E2E_CREATED_USER_EMAIL, initialPassword);
    await newUser.waitForURL('**/change-password');
    await newUser.getByLabel(/current password/i).fill(initialPassword);
    await newUser.getByLabel(/^new password$/i).fill('CreatedStaff2026');
    await newUser.getByLabel(/confirm new password/i).fill('CreatedStaff2026');
    await newUser.getByRole('button', { name: /continue/i }).click();
    await newUser.waitForURL('**/staff/queue');
    await newUserContext.close();

    // Edit another user's basic information.
    await findUser(page, E2E_EDIT_TARGET_EMAIL);
    await page.getByRole('button', { name: 'Edit E2E Edit Target' }).click();
    await page.getByLabel('Name', { exact: true }).fill('E2E Edited Target');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('status')).toHaveText('Changes saved.');
    await expect(page.locator('.tt-user-table')).toContainText('E2E Edited Target');

    // AC-20: not your own account.
    await findUser(page, E2E_ADMIN_EMAIL);
    await page.getByRole('button', { name: 'Edit E2E Admin' }).click();
    await page.getByRole('button', { name: 'Deactivate' }).click();
    await expect(page.getByText("You can't deactivate your own account.")).toBeVisible();

    // AC-21: the only active Administrator can't give up the role.
    await page.getByRole('radio', { name: 'IT Staff' }).check();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('At least one Administrator must stay active.')).toBeVisible();

    const me = await (await page.request.get('/api/auth/me')).json();
    expect(me).toMatchObject({ email: E2E_ADMIN_EMAIL, role: 'ADMINISTRATOR' });
  });
});
