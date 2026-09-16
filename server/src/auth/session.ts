import crypto from 'node:crypto';
import { prisma } from '../prisma';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // ~12h sliding expiry, per specification.md's session design

// PR #43 review: shared by routes/auth.ts (setting the cookie at login) and middleware.ts
// (refreshing it on every authenticated request), so the two never drift apart.
export const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
};

export async function createSession(userId: number): Promise<{ token: string; expiresAt: Date }> {
  // Cryptographically random opaque token, never a sequential id, so it can't be guessed.
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({ data: { id: token, userId, expiresAt } });
  return { token, expiresAt };
}

export async function deleteSession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { id: token } });
}

export async function getSessionUser(token: string) {
  const session = await prisma.session.findUnique({
    where: { id: token },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  // Sliding expiry: a valid request extends the session rather than letting an active user get
  // logged out mid-work. PR #43 review: the caller must also re-set the sid cookie with this new
  // expiresAt, or the browser drops the cookie at the original 12h mark regardless of activity.
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.update({ where: { id: token }, data: { expiresAt } });

  return { user: session.user, expiresAt };
}
