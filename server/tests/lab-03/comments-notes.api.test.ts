import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/prisma';
import { hashPassword } from '../../src/auth/password-hash';
import { createSession } from '../../src/auth/session';

// Public Comments and Internal Notes - api-spec.md 5, BR-04, BR-16, BR-17, BR-26.
// Self-contained fixture users and Tickets, removed in afterAll.
const EMAIL_PREFIX = 'lab3-comments-notes-test-';
const NUMBER_PREFIX = 'TKT-2099-939';

// Postgres timestamp precision plus back-to-back requests: two writes can otherwise share a
// millisecond and look like no update happened (same reason as the Lab 2 attachments suite).
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Public Comments and Internal Notes API', () => {
  const cookies = { requester: '', otherRequester: '', staff: '', admin: '' };
  const ids = { requester: 0, staff: 0 };
  let categoryId: number;
  let relatedSystemId: number;
  let ticketCounter = 0;

  const as = (cookie: string) => ({
    get: (url: string) => request(app).get(url).set('Cookie', cookie),
    post: (url: string, body: object) => request(app).post(url).set('Cookie', cookie).send(body),
  });

  async function makeTicket() {
    ticketCounter++;
    return prisma.ticket.create({
      data: {
        ticketNumber: `${NUMBER_PREFIX}${String(ticketCounter).padStart(3, '0')}`,
        requesterId: ids.requester,
        categoryId,
        relatedSystemId,
        summary: `Comments and notes fixture ${ticketCounter}`,
        description: 'Fixture Ticket created by the Comments and Notes API suite.',
        requestedPriority: 'LOW',
        itPriority: 'LOW',
        currentStatus: 'OPEN',
      },
    });
  }

  beforeAll(async () => {
    const passwordHash = await hashPassword('FixturePass1');
    const make = (key: string, name: string, role: 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR') =>
      prisma.user.create({
        data: { name, email: `${EMAIL_PREFIX}${key}@toktickit.dev`, role, passwordHash, mustChangePassword: false },
      });

    const requester = await make('requester', 'Comments Requester', 'REQUESTER');
    const otherRequester = await make('other-requester', 'Comments Other Requester', 'REQUESTER');
    const staff = await make('staff', 'Comments Staff', 'IT_STAFF');
    const admin = await make('admin', 'Comments Administrator', 'ADMINISTRATOR');

    ids.requester = requester.id;
    ids.staff = staff.id;
    cookies.requester = `sid=${(await createSession(requester.id)).token}`;
    cookies.otherRequester = `sid=${(await createSession(otherRequester.id)).token}`;
    cookies.staff = `sid=${(await createSession(staff.id)).token}`;
    cookies.admin = `sid=${(await createSession(admin.id)).token}`;

    categoryId = (await prisma.category.findFirstOrThrow({ where: { isActive: true } })).id;
    relatedSystemId = (await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })).id;
  });

  afterAll(async () => {
    const tickets = { ticket: { ticketNumber: { startsWith: NUMBER_PREFIX } } };
    await prisma.publicComment.deleteMany({ where: tickets });
    await prisma.internalNote.deleteMany({ where: tickets });
    await prisma.ticket.deleteMany({ where: { ticketNumber: { startsWith: NUMBER_PREFIX } } });
    await prisma.session.deleteMany({ where: { user: { email: { startsWith: EMAIL_PREFIX } } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });
  });

  describe('API-27 - AC-15, BR-04: Public Comments', () => {
    it('a Requester and IT Staff can post, and all three roles read the same list, oldest first', async () => {
      const ticket = await makeTicket();

      const fromRequester = await as(cookies.requester).post(`/api/tickets/${ticket.id}/comments`, { body: 'The printer still jams.' });
      expect(fromRequester.status).toBe(201);
      expect(fromRequester.body).toMatchObject({
        ticketId: ticket.id,
        authorId: ids.requester,
        author: { id: ids.requester, name: 'Comments Requester', role: 'REQUESTER' },
        body: 'The printer still jams.',
      });
      expect(Object.keys(fromRequester.body).sort()).toEqual(['author', 'authorId', 'body', 'createdAt', 'id', 'ticketId']);

      await wait(20);
      const fromStaff = await as(cookies.staff).post(`/api/tickets/${ticket.id}/comments`, { body: 'Replacing the roller today.' });
      expect(fromStaff.status).toBe(201);

      for (const cookie of [cookies.requester, cookies.staff, cookies.admin]) {
        const list = await as(cookie).get(`/api/tickets/${ticket.id}/comments`);
        expect(list.status).toBe(200);
        expect(list.body.map((comment: { body: string }) => comment.body)).toEqual(['The printer still jams.', 'Replacing the roller today.']);
      }
    });

    it('another Requester gets 404 for both reading and posting, and an Administrator cannot post (403)', async () => {
      const ticket = await makeTicket();

      expect((await as(cookies.otherRequester).get(`/api/tickets/${ticket.id}/comments`)).status).toBe(404);
      expect((await as(cookies.otherRequester).post(`/api/tickets/${ticket.id}/comments`, { body: 'Not mine' })).status).toBe(404);
      expect((await as(cookies.admin).post(`/api/tickets/${ticket.id}/comments`, { body: 'Admin comment' })).status).toBe(403);
    });

    it('returns 404 for a Ticket that does not exist', async () => {
      expect((await as(cookies.staff).post('/api/tickets/99999999/comments', { body: 'Hello' })).status).toBe(404);
      expect((await as(cookies.staff).get('/api/tickets/99999999/comments')).status).toBe(404);
    });
  });

  describe('API-28 - AC-16, BR-04: Internal Notes', () => {
    it('IT Staff can post a note that IT Staff and an Administrator can read', async () => {
      const ticket = await makeTicket();

      const posted = await as(cookies.staff).post(`/api/tickets/${ticket.id}/notes`, { body: 'Roller part is in the IT store.' });
      expect(posted.status).toBe(201);
      expect(posted.body).toMatchObject({ author: { id: ids.staff, role: 'IT_STAFF' }, body: 'Roller part is in the IT store.' });

      for (const cookie of [cookies.staff, cookies.admin]) {
        const list = await as(cookie).get(`/api/tickets/${ticket.id}/notes`);
        expect(list.status).toBe(200);
        expect(list.body.map((note: { body: string }) => note.body)).toEqual(['Roller part is in the IT store.']);
      }
      // A Requester reading notes is API-11, in authorization.api.test.ts.
    });

    it('a Requester and an Administrator cannot post a note (403)', async () => {
      const ticket = await makeTicket();

      expect((await as(cookies.requester).post(`/api/tickets/${ticket.id}/notes`, { body: 'Let me in' })).status).toBe(403);
      expect((await as(cookies.admin).post(`/api/tickets/${ticket.id}/notes`, { body: 'Admin note' })).status).toBe(403);
    });
  });

  describe('API-29 - BR-16: validation', () => {
    it('rejects empty, whitespace-only and 2,001-character content for both, and accepts exactly 2,000', async () => {
      const ticket = await makeTicket();

      for (const kind of ['comments', 'notes']) {
        for (const body of ['', '   \n  ', 'x'.repeat(2001)]) {
          const response = await as(cookies.staff).post(`/api/tickets/${ticket.id}/${kind}`, { body });
          expect(response.status, `${kind} length ${body.length}`).toBe(400);
          expect(response.body.error.code).toBe('VALIDATION_ERROR');
        }
        expect((await as(cookies.staff).post(`/api/tickets/${ticket.id}/${kind}`, { body: 'x'.repeat(2000) })).status).toBe(201);
      }
    });
  });

  describe('API-30 - AC-26, BR-16: plain text', () => {
    it('stores and returns HTML-like content as the literal text sent', async () => {
      const ticket = await makeTicket();
      const script = '<script>alert(1)</script>';

      const posted = await as(cookies.requester).post(`/api/tickets/${ticket.id}/comments`, { body: script });
      expect(posted.status).toBe(201);
      expect(posted.body.body).toBe(script);

      const list = await as(cookies.staff).get(`/api/tickets/${ticket.id}/comments`);
      expect(list.body[0].body).toBe(script);
    });
  });

  describe('API-31 and API-41 - AC-27, BR-26: nothing about Internal Notes reaches the Requester', () => {
    it('API-31: the Requester’s Ticket Detail contains no note field or note text', async () => {
      const ticket = await makeTicket();
      const secret = 'QX38 private note text that must never leak';
      expect((await as(cookies.staff).post(`/api/tickets/${ticket.id}/notes`, { body: secret })).status).toBe(201);

      const detail = await as(cookies.requester).get(`/api/tickets/${ticket.id}`);

      expect(detail.status).toBe(200);
      expect(JSON.stringify(detail.body)).not.toContain(secret);
      for (const key of Object.keys(detail.body)) {
        expect(key).not.toMatch(/note/i);
      }
    });

    it('API-41: an Internal Note leaves Last Updated unchanged, and a Public Comment moves it', async () => {
      const ticket = await makeTicket();
      const updatedAt = async () => (await as(cookies.requester).get(`/api/tickets/${ticket.id}`)).body.updatedAt as string;

      const before = await updatedAt();
      await wait(20);
      expect((await as(cookies.staff).post(`/api/tickets/${ticket.id}/notes`, { body: 'Internal only' })).status).toBe(201);
      const afterNote = await updatedAt();
      expect(afterNote).toBe(before);

      await wait(20);
      expect((await as(cookies.staff).post(`/api/tickets/${ticket.id}/comments`, { body: 'Visible update' })).status).toBe(201);
      const afterComment = await updatedAt();
      expect(new Date(afterComment).getTime()).toBeGreaterThan(new Date(before).getTime());
    });
  });
});
