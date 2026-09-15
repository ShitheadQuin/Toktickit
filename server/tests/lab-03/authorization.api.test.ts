import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { prisma } from '../../src/prisma';
import { hashPassword } from '../../src/auth/password-hash';
import { createSession } from '../../src/auth/session';
import { requireAuth, requirePasswordChanged } from '../../src/middleware';

// API-08 needs a session-protected route to prove requirePasswordChanged actually blocks access -
// but no Lab 2 route is session-protected yet (#36 wires requireAuth onto the real routes). Rather
// than adding a placeholder route to the real app just for this test, a minimal local Express app
// mounts the same exported middleware in front of a dummy handler. #36 reuses requireAuth and
// requirePasswordChanged unchanged on the real routes.
const testApp = express();
testApp.use(cookieParser());
testApp.get('/protected', requireAuth, requirePasswordChanged, (req, res) => res.status(200).json({ ok: true }));

const EMAIL_PREFIX = 'lab3-authz-test-';
const PASSWORD = 'CorrectHorse1';

describe('requirePasswordChanged gate (API-08, AC-02, BR-02)', () => {
  let mustChangeCookie: string;
  let normalCookie: string;

  beforeAll(async () => {
    const passwordHash = await hashPassword(PASSWORD);
    const mustChangeUser = await prisma.user.create({
      data: { name: 'Authz Test', email: `${EMAIL_PREFIX}mustchange@toktickit.dev`, role: 'IT_STAFF', passwordHash, mustChangePassword: true },
    });
    const normalUser = await prisma.user.create({
      data: { name: 'Authz Test', email: `${EMAIL_PREFIX}normal@toktickit.dev`, role: 'IT_STAFF', passwordHash, mustChangePassword: false },
    });

    mustChangeCookie = `sid=${(await createSession(mustChangeUser.id)).token}`;
    normalCookie = `sid=${(await createSession(normalUser.id)).token}`;
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { user: { email: { startsWith: EMAIL_PREFIX } } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });
  });

  it('blocks a protected route with 403 PASSWORD_CHANGE_REQUIRED while mustChangePassword is true', async () => {
    const response = await request(testApp).get('/protected').set('Cookie', mustChangeCookie);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('allows the same route once mustChangePassword is false', async () => {
    const response = await request(testApp).get('/protected').set('Cookie', normalCookie);
    expect(response.status).toBe(200);
  });

  it('requireAuth alone rejects a missing or invalid session with 401', async () => {
    const missing = await request(testApp).get('/protected');
    expect(missing.status).toBe(401);

    const invalid = await request(testApp).get('/protected').set('Cookie', 'sid=not-a-real-token');
    expect(invalid.status).toBe(401);
  });
});
