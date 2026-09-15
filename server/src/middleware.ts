import type { Request, Response, NextFunction } from 'express';
import { getSessionUser } from './auth/session';
import type { User } from './generated/prisma/models/User';

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
  const user = typeof token === 'string' ? await getSessionUser(token) : null;

  if (!user || !user.isActive) {
    return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Not logged in' } });
  }

  req.user = user;
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
