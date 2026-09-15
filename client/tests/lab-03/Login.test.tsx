import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../src/context/AuthContext';
import { Login } from '../../src/pages/Login';

function renderLogin() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Login />
      </AuthProvider>
    </MemoryRouter>,
  );
}

// AuthProvider always checks GET /api/auth/me on mount; Login itself doesn't depend on the
// result, but the mock must answer it so the provider settles.
function mockFetch(loginHandler: (init?: RequestInit) => Promise<Response> | Response) {
  vi.spyOn(global, 'fetch').mockImplementation((input, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.endsWith('/api/auth/me')) {
      return Promise.resolve({ ok: false, status: 401, json: async () => ({}) } as Response);
    }
    if (url.endsWith('/api/auth/login')) {
      return Promise.resolve(loginHandler(init)) as Promise<Response>;
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
}

describe('Login (UI-01)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows the generic invalid-credentials message on a 401', async () => {
    mockFetch(() => ({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } }),
    }) as Response);

    renderLogin();

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'jane@toktickit.dev' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'WrongPassword1' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password.');
    });
  });

  it('disables both fields and shows a spinner with "Signing in…" while busy', async () => {
    mockFetch(() => new Promise(() => {}));

    renderLogin();

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'jane@toktickit.dev' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'Something1' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/signing in…/i)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/email/i)).toBeDisabled();
    expect(screen.getByLabelText(/^password$/i)).toBeDisabled();
  });

  it('the password field is masked by default and can be revealed with the Show toggle', () => {
    mockFetch(() => new Promise(() => {}));
    renderLogin();

    const passwordField = screen.getByLabelText(/^password$/i) as HTMLInputElement;
    expect(passwordField.type).toBe('password');

    fireEvent.click(screen.getByRole('button', { name: /show/i }));
    expect(passwordField.type).toBe('text');
  });
});
