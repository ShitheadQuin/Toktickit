import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within, cleanup, fireEvent } from '@testing-library/react';
import { UserManagement } from '../../src/pages/UserManagement';
import { renderWithAuth, withAuthMe } from '../support/auth-mock';
import type { AuthUser } from '../../src/context/AuthContext';

// UI-06 (AC-18, AC-20, AC-21) and UI-07 (AC-19), plus the list, search and role filter
// (ui-spec.md 8). The signed-in Administrator is user 1.
const ME: AuthUser = { id: 1, name: 'Duangjai Meesuk', email: 'duangjai.meesuk@toktickit.dev', role: 'ADMINISTRATOR', mustChangePassword: false };

const USERS = [
  { id: 1, name: 'Duangjai Meesuk', email: 'duangjai.meesuk@toktickit.dev', role: 'ADMINISTRATOR', isActive: true },
  { id: 2, name: 'Anong Srisai', email: 'anong.srisai@toktickit.dev', role: 'REQUESTER', isActive: true },
  { id: 3, name: 'Somporn Inthara', email: 'somporn.inthara@toktickit.dev', role: 'IT_STAFF', isActive: false },
];

const ok = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;
type Handler = (body: unknown) => Response | Promise<Response>;

/** Routes each fetch by "METHOD path" (query ignored); anything unlisted fails the test. */
function mockApi(routes: Record<string, Handler>) {
  return vi.spyOn(global, 'fetch').mockImplementation(
    withAuthMe(ME, async (input, init) => {
      const url = new URL(String(input), 'http://localhost');
      const method = (init?.method ?? 'GET').toUpperCase();
      const handler = routes[`${method} ${url.pathname}`];
      if (!handler) throw new Error(`Unexpected fetch: ${method} ${url.pathname}`);
      return handler(init?.body ? JSON.parse(String(init.body)) : undefined);
    }),
  );
}

const callsTo = (spy: ReturnType<typeof mockApi>, method: string, path: string) =>
  spy.mock.calls
    .filter(([input, init]) => new URL(String(input), 'http://localhost').pathname === path && (init?.method ?? 'GET').toUpperCase() === method)
    .map(([input, init]) => ({ url: new URL(String(input), 'http://localhost'), body: init?.body ? JSON.parse(String(init.body)) : undefined }));

const listRoute = { 'GET /api/users': () => ok(USERS) };

describe('UserManagement', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('lists users with Name, Email, Role and Status badges and an Edit action, and sends search and role filter', async () => {
    const spy = mockApi(listRoute);
    renderWithAuth(<UserManagement />);

    const table = await screen.findByRole('table');
    const headers = within(table).getAllByRole('columnheader').map((header) => header.textContent?.trim());
    expect(headers.slice(0, 4)).toEqual(['Name', 'Email', 'Role', 'Status']);

    const row = within(table).getByText('Somporn Inthara').closest('tr')!;
    expect(within(row).getByText('IT Staff')).toHaveClass('tt-badge-role-it-staff');
    expect(within(row).getByText('Inactive')).toHaveClass('tt-badge-user-inactive');
    expect(within(row).getByRole('button', { name: 'Edit Somporn Inthara' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^search$/i), { target: { value: 'anong' } });
    fireEvent.click(screen.getByRole('button', { name: /^search$/i }));
    await waitFor(() => expect(callsTo(spy, 'GET', '/api/users').at(-1)!.url.searchParams.get('search')).toBe('anong'));

    fireEvent.change(screen.getByLabelText(/filter by role/i), { target: { value: 'IT_STAFF' } });
    await waitFor(() => expect(callsTo(spy, 'GET', '/api/users').at(-1)!.url.searchParams.get('role')).toBe('IT_STAFF'));
  });

  it('UI-06: shows the duplicate-email error inline on the email field, not as a general failure', async () => {
    mockApi({
      ...listRoute,
      'POST /api/users': () => ok({ error: { code: 'EMAIL_ALREADY_EXISTS', message: 'Email already in use' } }, 409),
    });
    const { container } = renderWithAuth(<UserManagement />);

    fireEvent.click(await screen.findByRole('button', { name: 'Add user' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Another Anong' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'anong.srisai@toktickit.dev' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Requester' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create user' }));

    expect(await screen.findByText('This email is already in use.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveClass('is-invalid');
    expect(container.querySelector('.tt-alert-error')).toBeNull();
  });

  it('UI-06: blocks deactivating your own account with an inline message, without sending a request', async () => {
    const spy = mockApi(listRoute);
    renderWithAuth(<UserManagement />);

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Duangjai Meesuk' }));
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));

    expect(await screen.findByText("You can't deactivate your own account.")).toBeInTheDocument();
    expect(callsTo(spy, 'PATCH', '/api/users/1')).toHaveLength(0);
  });

  it('UI-06: shows the last-active-Administrator error inline when the server refuses the change', async () => {
    const spy = mockApi({
      ...listRoute,
      'PATCH /api/users/1': () => ok({ error: { code: 'LAST_ACTIVE_ADMIN_BLOCKED', message: 'At least one Administrator must stay active' } }, 409),
    });
    const { container } = renderWithAuth(<UserManagement />);

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Duangjai Meesuk' }));
    fireEvent.click(screen.getByRole('radio', { name: 'IT Staff' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('At least one Administrator must stay active.')).toBeInTheDocument();
    expect(callsTo(spy, 'PATCH', '/api/users/1')[0].body).toEqual({ name: 'Duangjai Meesuk', email: 'duangjai.meesuk@toktickit.dev', role: 'IT_STAFF' });
    expect(container.querySelector('.tt-alert-error')).toBeNull();
  });

  it('UI-07: shows the new user’s initial password once after creating, and not again after Done', async () => {
    const spy = mockApi({
      ...listRoute,
      'POST /api/users': (body) =>
        ok({ id: 9, ...(body as object), isActive: true, mustChangePassword: true, initialPassword: 'kQ7m2XpR9s3a' }, 201),
    });
    renderWithAuth(<UserManagement />);

    fireEvent.click(await screen.findByRole('button', { name: 'Add user' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Jane Lee' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jane.lee@toktickit.dev' } });
    fireEvent.click(screen.getByRole('radio', { name: 'IT Staff' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create user' }));

    const callout = (await screen.findByText('kQ7m2XpR9s3a')).closest('.tt-initial-password-reveal') as HTMLElement;
    expect(callout).not.toBeNull();
    expect(within(callout).getByText(/won't be shown again/i)).toBeInTheDocument();
    expect(within(callout).getByRole('button', { name: /copy/i })).toBeInTheDocument();
    expect(callsTo(spy, 'POST', '/api/users')[0].body).toEqual({ name: 'Jane Lee', email: 'jane.lee@toktickit.dev', role: 'IT_STAFF', isActive: true });

    fireEvent.click(within(callout).getByRole('button', { name: 'Done' }));
    expect(screen.queryByText('kQ7m2XpR9s3a')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add user' }));
    expect(screen.queryByText('kQ7m2XpR9s3a')).not.toBeInTheDocument();
  });

  it('UI-07: Set New Password shows the one-time password for that user', async () => {
    const spy = mockApi({ ...listRoute, 'POST /api/users/2/reset-password': () => ok({ initialPassword: 'Hx4mP9tQ2wZr' }) });
    renderWithAuth(<UserManagement />);

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Anong Srisai' }));
    fireEvent.click(screen.getByRole('button', { name: 'Set New Password' }));

    const callout = (await screen.findByText('Hx4mP9tQ2wZr')).closest('.tt-initial-password-reveal');
    expect(callout).not.toBeNull();
    expect(callsTo(spy, 'POST', '/api/users/2/reset-password')).toHaveLength(1);
  });

  it('deactivates another user and confirms it', async () => {
    const spy = mockApi({ ...listRoute, 'PATCH /api/users/2': () => ok({ ...USERS[1], isActive: false }) });
    renderWithAuth(<UserManagement />);

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Anong Srisai' }));
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));

    expect(await screen.findByRole('status')).toHaveTextContent('User deactivated.');
    expect(callsTo(spy, 'PATCH', '/api/users/2')[0].body).toEqual({ isActive: false });
  });
});
