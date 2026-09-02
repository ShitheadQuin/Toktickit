import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useRequester } from '../context/RequesterContext';

export function AppShell({ children }: { children: ReactNode }) {
  const { requester, clearRequester } = useRequester();
  const [menuOpen, setMenuOpen] = useState(false);

  // ui-spec.md 10: below the large breakpoint the links collapse behind a menu control, while
  // the current Requester and Change Requester stay visible without opening it. Bootstrap's CSS
  // is loaded but not its JavaScript, so the toggle is React state rather than data-bs-toggle.
  const navClasses = `app-shell__nav gap-2 ${menuOpen ? 'd-flex' : 'd-none'} d-lg-flex`;

  return (
    <div className="app-shell">
      <header className="app-shell__header d-flex flex-wrap justify-content-between align-items-center p-3 border-bottom gap-2">
        <div className="d-flex align-items-center gap-2">
          <span className="app-shell__brand fw-bold" style={{ color: 'var(--tt-primary)' }}>TokTickIT</span>
          {requester && (
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

        {requester && (
          <nav id="app-shell-nav" className={navClasses} aria-label="Main">
            <NavLink to="/my-tickets" className="tt-nav-link" onClick={() => setMenuOpen(false)}>
              My Tickets
            </NavLink>
            <NavLink to="/create-ticket" className="tt-nav-link" onClick={() => setMenuOpen(false)}>
              Create Ticket
            </NavLink>
          </nav>
        )}

        {requester && (
          <div className="app-shell__requester d-flex align-items-center gap-2">
            <span>{requester.name}</span>
            <button
              type="button"
              className="btn btn-tt-secondary btn-sm"
              onClick={clearRequester}
            >
              Change Requester
            </button>
          </div>
        )}
      </header>
      <main className="app-shell__content p-3">{children}</main>
    </div>
  );
}
