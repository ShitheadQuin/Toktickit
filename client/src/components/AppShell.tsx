import { useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ROLE_LABEL: Record<string, string> = {
  REQUESTER: 'Requester',
  IT_STAFF: 'IT Staff',
  ADMINISTRATOR: 'Administrator',
};

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  // ui-spec.md 10: below the large breakpoint the links collapse behind a menu control, while
  // the current user and Logout stay visible without opening it. Bootstrap's CSS is loaded but
  // not its JavaScript, so the toggle is React state rather than data-bs-toggle.
  const navClasses = `app-shell__nav gap-2 ${menuOpen ? 'd-flex' : 'd-none'} d-lg-flex`;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="app-shell">
      <header className="app-shell__header d-flex flex-wrap justify-content-between align-items-center p-3 border-bottom gap-2">
        <div className="d-flex align-items-center gap-2">
          <span className="app-shell__brand fw-bold" style={{ color: 'var(--tt-primary)' }}>TokTickIT</span>
          {user && (
            <button
              type="button"
              className="btn btn-tt-tertiary btn-sm d-lg-none"
              aria-expanded={menuOpen}
              aria-controls="app-shell-nav"
              onClick={() => setMenuOpen((open) => !open)}
            >
              Menu
            </button>
          )}
        </div>

        {/* ui-spec.md 3: nav links scoped to role - a role never sees a link it can't reach, not
            just hidden by CSS. Rendered as a plain, role-checked list rather than one shared
            array, so the markup itself never contains a link the current role can't reach. */}
        {user && (
          <nav id="app-shell-nav" className={navClasses} aria-label="Main">
            {user.role === 'REQUESTER' && (
              <>
                <NavLink to="/my-tickets" className="tt-nav-link" onClick={() => setMenuOpen(false)}>
                  My Tickets
                </NavLink>
                <NavLink to="/create-ticket" className="tt-nav-link" onClick={() => setMenuOpen(false)}>
                  Create Ticket
                </NavLink>
              </>
            )}
            {user.role === 'IT_STAFF' && (
              <NavLink to="/staff/queue" className="tt-nav-link" onClick={() => setMenuOpen(false)}>
                My Queue
              </NavLink>
            )}
            {user.role === 'ADMINISTRATOR' && (
              <NavLink to="/users" className="tt-nav-link" onClick={() => setMenuOpen(false)}>
                Users
              </NavLink>
            )}
          </nav>
        )}

        {user && (
          <div className="app-shell__identity d-flex align-items-center gap-2">
            <span>{user.name}</span>
            <span className="tt-badge tt-badge-role">{ROLE_LABEL[user.role] ?? user.role}</span>
            <NavLink to="/change-password" className="btn btn-tt-tertiary btn-sm">
              Change Password
            </NavLink>
            <button type="button" className="btn btn-tt-secondary btn-sm" onClick={handleLogout}>
              Logout
            </button>
          </div>
        )}
      </header>
      <main className="app-shell__content p-3">{children}</main>
    </div>
  );
}
