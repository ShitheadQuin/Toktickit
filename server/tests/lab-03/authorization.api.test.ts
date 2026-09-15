import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import app from '../../src/app';
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

  // PR #43 review: the DB-side sliding expiry is worthless if the browser's own copy of the
  // cookie still expires at the original login time - requireAuth must refresh it every request.
  it('refreshes the sid cookie expiry on every authenticated request', async () => {
    const response = await request(testApp).get('/protected').set('Cookie', normalCookie);
    expect(response.status).toBe(200);
    expect(response.headers['set-cookie']?.[0]).toMatch(/^sid=/);
  });

  it('requireAuth alone rejects a missing or invalid session with 401', async () => {
    const missing = await request(testApp).get('/protected');
    expect(missing.status).toBe(401);

    const invalid = await request(testApp).get('/protected').set('Cookie', 'sid=not-a-real-token');
    expect(invalid.status).toBe(401);
  });
});

// API-09, API-10, API-15 - against the real app now that #36 wires requireAuth/requireRole onto
// the Lab 2 Requester routes. (API-11 to API-14 target endpoints that don't exist until
// #37/#38/#39 - deferred to those Issues, per tests.md.)
describe('Lab 2 route authorization (API-09, API-10, API-15)', () => {
  const AUTHZ_EMAIL_PREFIX = 'lab3-authz2-test-';
  let requesterAId: number;
  let requesterACookie: string;
  let requesterBCookie: string;

  beforeAll(async () => {
    const passwordHash = await hashPassword(PASSWORD);
    const requesterA = await prisma.user.create({
      data: { name: 'Authz Test A', email: `${AUTHZ_EMAIL_PREFIX}a@toktickit.dev`, role: 'REQUESTER', passwordHash, mustChangePassword: false },
    });
    const requesterB = await prisma.user.create({
      data: { name: 'Authz Test B', email: `${AUTHZ_EMAIL_PREFIX}b@toktickit.dev`, role: 'REQUESTER', passwordHash, mustChangePassword: false },
    });
    requesterAId = requesterA.id;
    requesterACookie = `sid=${(await createSession(requesterA.id)).token}`;
    requesterBCookie = `sid=${(await createSession(requesterB.id)).token}`;
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { user: { email: { startsWith: AUTHZ_EMAIL_PREFIX } } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: AUTHZ_EMAIL_PREFIX } } });
  });

  // API-09 - AC-09, BR-12: a Ticket owned by a different Requester is indistinguishable from
  // one that doesn't exist. Fuller coverage (including the fixture Ticket itself) lives in
  // server/tests/lab-02/ticket-detail.api.test.ts; this confirms the same behavior end to end
  // through the real app, which is what this Issue's authorization suite is meant to prove.
  it('GET /api/tickets/:id for another Requester’s Ticket returns 404, not 403 (BR-12)', async () => {
    const category = await prisma.category.findFirst({ where: { isActive: true } });
    const relatedSystem = await prisma.relatedSystem.findFirst({ where: { isActive: true } });
    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: 'TKT-2099-900901',
        requesterId: requesterAId,
        categoryId: category!.id,
        relatedSystemId: relatedSystem!.id,
        summary: `${AUTHZ_EMAIL_PREFIX} fixture`,
        description: 'Fixture Ticket for API-09.',
        requestedPriority: 'MEDIUM',
        itPriority: 'MEDIUM',
      },
    });

    const response = await request(app).get(`/api/tickets/${ticket.id}`).set('Cookie', requesterBCookie);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');

    await prisma.ticket.delete({ where: { id: ticket.id } });
  });

  // API-10 - AC-03, BR-03: a requesterId in the body is ignored; ownership always comes from
  // the session. Same scenario as create-ticket.api.test.ts's own regression test, confirmed
  // here too since this Issue's "Done when" list names API-10 explicitly.
  it('POST /api/tickets ignores a requesterId in the body pointing at another Requester', async () => {
    const category = await prisma.category.findFirst({ where: { isActive: true } });
    const relatedSystem = await prisma.relatedSystem.findFirst({ where: { isActive: true } });

    const response = await request(app)
      .post('/api/tickets')
      .set('Cookie', requesterACookie)
      .send({
        requesterId: 999999,
        categoryId: category!.id,
        relatedSystemId: relatedSystem!.id,
        summary: `${AUTHZ_EMAIL_PREFIX} API-10 fixture`,
        description: 'Body requesterId must be ignored.',
        requestedPriority: 'MEDIUM',
      });

    expect(response.status).toBe(201);
    expect(response.body.requesterId).toBe(requesterAId);

    await prisma.ticket.delete({ where: { id: response.body.id } });
  });

  // API-15 - AC-01 (inverse): any protected Lab 2 endpoint with no sid cookie -> 401.
  it('GET /api/tickets with no session returns 401 UNAUTHENTICATED', async () => {
    const response = await request(app).get('/api/tickets');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });
});
