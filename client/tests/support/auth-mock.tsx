import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../src/context/AuthContext';
import type { AuthUser } from '../../src/context/AuthContext';
import type { ReactNode } from 'react';

export const MOCK_REQUESTER: AuthUser = {
  id: 1,
  name: 'Anong Srisai',
  email: 'anong.srisai@toktickit.dev',
  role: 'REQUESTER',
  mustChangePassword: false,
};

// Every component under AuthProvider fetches GET /api/auth/me on mount. Tests that don't care
// about the exact request set can build on this: pass their own handler for everything else, and
// /auth/me is answered automatically so AuthProvider settles with the given user.
export function withAuthMe(user: AuthUser | null, otherHandler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.endsWith('/api/auth/me')) {
      return user
        ? Promise.resolve({ ok: true, json: async () => user } as Response)
        : Promise.resolve({ ok: false, status: 401, json: async () => ({}) } as Response);
    }
    return otherHandler(input, init);
  };
}

export function renderWithAuth(children: ReactNode, initialEntries?: string[]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider>{children}</AuthProvider>
    </MemoryRouter>,
  );
}
