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


// API-12 - BR-20, api-spec.md 7: the Queue is IT Staff only. A Requester and an Administrator both
// get 403 for the whole endpoint - nothing about any Ticket is returned.
describe('Staff Queue role authorization (API-12)', () => {
  const QUEUE_EMAIL_PREFIX = 'lab3-authz-queue-test-';
  let requesterCookie: string;
  let administratorCookie: string;
  let staffCookie: string;

  beforeAll(async () => {
    const passwordHash = await hashPassword(PASSWORD);
    const make = (key: string, role: 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR') =>
      prisma.user.create({
        data: { name: 'Authz Queue Test', email: `${QUEUE_EMAIL_PREFIX}${key}@toktickit.dev`, role, passwordHash, mustChangePassword: false },
      });

    requesterCookie = `sid=${(await createSession((await make('requester', 'REQUESTER')).id)).token}`;
    administratorCookie = `sid=${(await createSession((await make('admin', 'ADMINISTRATOR')).id)).token}`;
    staffCookie = `sid=${(await createSession((await make('staff', 'IT_STAFF')).id)).token}`;
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { user: { email: { startsWith: QUEUE_EMAIL_PREFIX } } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: QUEUE_EMAIL_PREFIX } } });
  });

  it('GET /api/staff/tickets as a Requester returns 403 FORBIDDEN with no Ticket data', async () => {
    const response = await request(app).get('/api/staff/tickets').set('Cookie', requesterCookie);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(response.body.data).toBeUndefined();
  });

  it('GET /api/staff/tickets as an Administrator returns 403 FORBIDDEN (Administrator performs no ticket operations)', async () => {
    const response = await request(app).get('/api/staff/tickets').set('Cookie', administratorCookie);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(response.body.data).toBeUndefined();
  });

  it('GET /api/staff/tickets as IT Staff returns 200', async () => {
    const response = await request(app).get('/api/staff/tickets').set('Cookie', staffCookie);
    expect(response.status).toBe(200);
  });

  it('GET /api/staff/tickets with no session returns 401 UNAUTHENTICATED', async () => {
    const response = await request(app).get('/api/staff/tickets');
    expect(response.status).toBe(401);
  });
});


// API-11 - AC-04, BR-04: a Requester is refused Internal Notes as a role, even on their own
// Ticket - 403 with no note content. API-14 - specification.md 11: an Administrator performs no
// Ticket actions, so claim, reassign, priority and status are all 403 before any Ticket lookup.
describe('Internal Notes and Ticket actions role authorization (API-11, API-14)', () => {
  const DETAIL_EMAIL_PREFIX = 'lab3-authz-detail-test-';
  const TICKET_NUMBER = 'TKT-2099-938901';
  let requesterCookie: string;
  let administratorCookie: string;
  let ownTicketId: number;

  beforeAll(async () => {
    const passwordHash = await hashPassword(PASSWORD);
    const requester = await prisma.user.create({
      data: { name: 'Authz Detail Requester', email: `${DETAIL_EMAIL_PREFIX}requester@toktickit.dev`, role: 'REQUESTER', passwordHash, mustChangePassword: false },
    });
    const administrator = await prisma.user.create({
      data: { name: 'Authz Detail Admin', email: `${DETAIL_EMAIL_PREFIX}admin@toktickit.dev`, role: 'ADMINISTRATOR', passwordHash, mustChangePassword: false },
    });
    requesterCookie = `sid=${(await createSession(requester.id)).token}`;
    administratorCookie = `sid=${(await createSession(administrator.id)).token}`;

    const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
    const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: TICKET_NUMBER,
        requesterId: requester.id,
        categoryId: category.id,
        relatedSystemId: relatedSystem.id,
        summary: 'Authz detail fixture',
        description: 'Fixture Ticket for API-11.',
        requestedPriority: 'LOW',
        itPriority: 'LOW',
      },
    });
    ownTicketId = ticket.id;
  });

  afterAll(async () => {
    await prisma.internalNote.deleteMany({ where: { ticket: { ticketNumber: TICKET_NUMBER } } });
    await prisma.ticket.deleteMany({ where: { ticketNumber: TICKET_NUMBER } });
    await prisma.session.deleteMany({ where: { user: { email: { startsWith: DETAIL_EMAIL_PREFIX } } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: DETAIL_EMAIL_PREFIX } } });
  });

  it('API-11: GET /api/tickets/:id/notes on the Requester’s own Ticket is 403 FORBIDDEN with no note content', async () => {
    const response = await request(app).get(`/api/tickets/${ownTicketId}/notes`).set('Cookie', requesterCookie);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(Array.isArray(response.body)).toBe(false);
  });

  it('API-14: an Administrator gets 403 FORBIDDEN for claim, reassign, priority and status', async () => {
    const calls = [
      request(app).post(`/api/staff/tickets/${ownTicketId}/claim`),
      request(app).post(`/api/staff/tickets/${ownTicketId}/reassign`).send({ newOwnerId: 1 }),
      request(app).patch(`/api/staff/tickets/${ownTicketId}/priority`).send({ itPriority: 'HIGH' }),
      request(app).patch(`/api/staff/tickets/${ownTicketId}/status`).send({ status: 'CANCELLED' }),
    ];
    for (const call of calls) {
      const response = await call.set('Cookie', administratorCookie);
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    }
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ownTicketId } });
    expect(ticket).toMatchObject({ ticketOwnerId: null, currentStatus: 'NEW', itPriority: 'LOW' });
  });
});

// API-13 - AC-22, BR-20: User Management is Administrator-only. IT Staff get 403 with no user data.
describe('User Management role authorization (API-13)', () => {
  const USERS_STAFF_EMAIL = 'lab3-authz-users-test-staff@toktickit.dev';
  let staffCookie: string;

  beforeAll(async () => {
    const passwordHash = await hashPassword(PASSWORD);
    const staff = await prisma.user.create({
      data: { name: 'Authz Users Staff', email: USERS_STAFF_EMAIL, role: 'IT_STAFF', passwordHash, mustChangePassword: false },
    });
    staffCookie = `sid=${(await createSession(staff.id)).token}`;
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { user: { email: USERS_STAFF_EMAIL } } });
    await prisma.user.deleteMany({ where: { email: USERS_STAFF_EMAIL } });
  });

  it('GET /api/users as IT Staff returns 403 FORBIDDEN with no user data', async () => {
    const response = await request(app).get('/api/users').set('Cookie', staffCookie);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(Array.isArray(response.body)).toBe(false);
  });
});
