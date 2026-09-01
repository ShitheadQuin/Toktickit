import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useRequester } from '../context/RequesterContext';

// Redirects to the Requester Selection screen (Home, "/") when no Requester is selected.
// Factored out once a second route needed the same check Home already did inline —
// this is the shared route guard Chanat suggested (minor, PR #21 review) once it was
// actually useful rather than speculative.
export function RequireRequester({ children }: { children: ReactNode }) {
  const { requester } = useRequester();

  if (!requester) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
