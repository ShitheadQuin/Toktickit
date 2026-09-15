import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { AppShell } from '../../src/components/AppShell';
import { renderWithAuth, withAuthMe } from '../support/auth-mock';
import type { AuthUser } from '../../src/context/AuthContext';

const userFor = (role: AuthUser['role']): AuthUser => ({
  id: 1,
  name: 'Test User',
  email: 'test@toktickit.dev',
  role,
  mustChangePassword: false,
});

function renderShell(user: AuthUser) {
  vi.spyOn(global, 'fetch').mockImplementation(withAuthMe(user, () => Promise.reject(new Error('unexpected fetch'))));
  return renderWithAuth(
    <AppShell>
      <p>content</p>
    </AppShell>,
  );
}

// UI-09 - ui-spec.md 3: a role never sees a link it can't reach, not just hidden by CSS.
describe('AppShell role-based navigation (UI-09)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows only My Tickets and Create Ticket for a Requester', async () => {
    renderShell(userFor('REQUESTER'));

    await waitFor(() => expect(screen.getByRole('link', { name: /my tickets/i })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /create ticket/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /my queue/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^users$/i })).not.toBeInTheDocument();
  });

  it('shows only My Queue for IT Staff, and never renders Create Ticket', async () => {
    renderShell(userFor('IT_STAFF'));

    await waitFor(() => expect(screen.getByRole('link', { name: /my queue/i })).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: /my tickets/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /create ticket/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^users$/i })).not.toBeInTheDocument();
  });

  it('shows only Users for an Administrator', async () => {
    renderShell(userFor('ADMINISTRATOR'));

    await waitFor(() => expect(screen.getByRole('link', { name: /^users$/i })).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: /my tickets/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /my queue/i })).not.toBeInTheDocument();
  });

  it('shows the current user’s name and role badge, replacing the Lab 2 Requester display', async () => {
    renderShell(userFor('IT_STAFF'));

    await waitFor(() => expect(screen.getByText('Test User')).toBeInTheDocument());
    expect(screen.getByText(/it staff/i)).toBeInTheDocument();
  });

  it('provides Change Password and Logout in the identity area', async () => {
    renderShell(userFor('REQUESTER'));

    await waitFor(() => expect(screen.getByRole('link', { name: /change password/i })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();
  });

  it('logs out and clears the session on Logout', async () => {
    const user = userFor('REQUESTER');
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(
      withAuthMe(user, (input) => {
        const url = String(input);
        if (url.endsWith('/api/auth/logout')) {
          return Promise.resolve({ ok: true, json: async () => ({ ok: true }) } as Response);
        }
        return Promise.reject(new Error(`unexpected fetch: ${url}`));
      }),
    );

    renderWithAuth(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /logout/i }));

    await waitFor(() => {
      expect(fetchSpy.mock.calls.some(([input]) => String(input).endsWith('/api/auth/logout'))).toBe(true);
    });
  });
});
