import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, type AuthUser } from '../context/AuthContext';

interface RequireRoleProps {
  roles: AuthUser['role'][];
  children: ReactNode;
}

// ui-spec.md 3/FR-06: server-side authorization is the real control (enforced in app.ts); this
// guard only avoids rendering a screen whose data would be forbidden anyway, matching the
// "never renders an unauthorized link" stance carried into every route, not just nav.
export function RequireRole({ roles, children }: RequireRoleProps) {
  const { user, status } = useAuth();

  if (status === 'loading') {
    return <p role="status">Loading…</p>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (user.mustChangePassword) {
    return <Navigate to="/change-password" replace />;
  }
  if (!roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
