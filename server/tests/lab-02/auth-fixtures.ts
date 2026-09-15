import { prisma } from '../../src/prisma';
import { hashPassword } from '../../src/auth/password-hash';
import { createSession } from '../../src/auth/session';

// #36 removes X-Requester-Id entirely; every Lab 2 API test now needs a real session instead.
// Self-contained fixture users, never the real seeded accounts - same reasoning as #35's
// auth.api.test.ts: mutating a seeded account's state would risk the plan's screenshot evidence.
export async function makeRequesterFixture(email: string, overrides: { isActive?: boolean } = {}) {
  return prisma.user.create({
    data: {
      name: 'Fixture Requester',
      email,
      role: 'REQUESTER',
      isActive: overrides.isActive ?? true,
      mustChangePassword: false,
      passwordHash: await hashPassword('FixturePass1'),
    },
  });
}

// Creates a session directly (bypassing the real /auth/login round-trip, which every one of
// these fixture users would otherwise need) and returns it ready to hand to supertest's
// .set('Cookie', ...).
export async function sessionCookieFor(userId: number): Promise<string> {
  const { token } = await createSession(userId);
  return `sid=${token}`;
}
