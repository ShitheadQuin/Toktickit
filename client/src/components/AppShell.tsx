import type { ReactNode } from 'react';
import { useRequester } from '../context/RequesterContext';

export function AppShell({ children }: { children: ReactNode }) {
  const { requester, clearRequester } = useRequester();

  return (
    <div className="app-shell">
      <header className="app-shell__header d-flex justify-content-between align-items-center p-3 border-bottom">
        <span className="app-shell__brand fw-bold" style={{ color: 'var(--tt-primary)' }}>TokTickIT</span>
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
