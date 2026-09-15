import crypto from 'node:crypto';
import { prisma } from '../prisma';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // ~12h sliding expiry, per specification.md's session design

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
  // logged out mid-work.
  await prisma.session.update({
    where: { id: token },
    data: { expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  });

  return session.user;
}
