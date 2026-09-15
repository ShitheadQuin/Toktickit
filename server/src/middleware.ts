import type { Request, Response, NextFunction } from 'express';
import { getSessionUser, COOKIE_OPTIONS } from './auth/session';
import type { User } from './generated/prisma/models/User';
import type { Role } from './generated/prisma/enums';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

// Attaches req.user from the `sid` cookie, or responds 401 if there is none / it is invalid or
// expired. #36 applies this to the rest of the Lab 2 routes; #35 applies it only to the auth
// routes themselves (see docs/lab-03/specification.md's decision to keep Issues #35/#36 separate).
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.sid;
  const session = typeof token === 'string' ? await getSessionUser(token) : null;

  if (!session || !session.user.isActive) {
    return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Not logged in' } });
  }

  // PR #43 review: getSessionUser already extended the DB row's expiry (sliding session); the
  // cookie's own Expires must be refreshed too, or the browser drops it at the original 12h mark
  // regardless of how active the user has been.
  res.cookie('sid', token as string, { ...COOKIE_OPTIONS, expires: session.expiresAt });

  req.user = session.user;
  next();
}

// AC-02/API-08: while mustChangePassword is true, only /auth/me, /auth/logout and
// /auth/change-password are reachable. Must run after requireAuth, which sets req.user.
export function requirePasswordChanged(req: Request, res: Response, next: NextFunction) {
  if (req.user?.mustChangePassword) {
    return res.status(403).json({
      error: { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Password change required before continuing' },
    });
  }
  next();
}

// api-spec.md 7: a valid session whose role isn't permitted for this endpoint at all -> 403,
// nothing about a specific record revealed. Must run after requireAuth.
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not permitted for this role' } });
    }
    next();
  };
}
