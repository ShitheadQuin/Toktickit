import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/prisma';
import { hashPassword } from '../../src/auth/password-hash';
import { createSession } from '../../src/auth/session';
import { deleteAttachmentFile, saveAttachmentFile } from '../../src/attachment-storage';

// Staff Ticket Detail and its actions - api-spec.md 3 (resolution signal) and 4.
// Self-contained fixture users and Tickets, never the seeded accounts. Every Ticket is created
// fresh by the test that uses it, so no test depends on another's state.
const EMAIL_PREFIX = 'lab3-staff-detail-test-';
const NUMBER_PREFIX = 'TKT-2099-938';

type Role = 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR';
type Status = 'NEW' | 'OPEN' | 'IN_PROGRESS' | 'WAITING_FOR_REQUESTER' | 'RESOLVED' | 'CLOSED' | 'REOPENED' | 'CANCELLED';

describe('Staff Ticket Detail API', () => {
  const ids = { owner: 0, other: 0, inactive: 0, requester: 0, otherRequester: 0, admin: 0 };
  const cookies = { owner: '', other: '', requester: '', otherRequester: '', admin: '' };
  let categoryId: number;
  let relatedSystemId: number;
  let ticketCounter = 0;
  const storedFilenames: string[] = [];

  const as = (cookie: string) => ({
    get: (url: string) => request(app).get(url).set('Cookie', cookie),
    post: (url: string, body?: object) => request(app).post(url).set('Cookie', cookie).send(body ?? {}),
    patch: (url: string, body: object) => request(app).patch(url).set('Cookie', cookie).send(body),
  });

  async function makeTicket(over: { status?: Status; ownerId?: number | null; requesterId?: number; requesterConfirmedAt?: Date } = {}) {
    ticketCounter++;
    return prisma.ticket.create({
      data: {
        ticketNumber: `${NUMBER_PREFIX}${String(ticketCounter).padStart(3, '0')}`,
        requesterId: over.requesterId ?? ids.requester,
        categoryId,
        relatedSystemId,
        summary: `Staff detail fixture ${ticketCounter}`,
        description: 'Fixture Ticket created by the Staff Ticket Detail API suite.',
        requestedPriority: 'MEDIUM',
        itPriority: 'MEDIUM',
        currentStatus: over.status ?? 'NEW',
        ticketOwnerId: over.ownerId ?? null,
        // exactOptionalPropertyTypes: omit the key entirely when the caller did not set it, rather
        // than passing an explicit undefined, which Prisma's create input does not accept.
        ...(over.requesterConfirmedAt ? { requesterConfirmedAt: over.requesterConfirmedAt } : {}),
      },
    });
  }

  const reload = (id: number) => prisma.ticket.findUniqueOrThrow({ where: { id } });

  beforeAll(async () => {
    const passwordHash = await hashPassword('FixturePass1');
    const make = (key: string, name: string, role: Role, isActive = true) =>
      prisma.user.create({
        data: { name, email: `${EMAIL_PREFIX}${key}@toktickit.dev`, role, isActive, passwordHash, mustChangePassword: false },
      });

    const owner = await make('owner', 'Detail Owner Staff', 'IT_STAFF');
    const other = await make('other', 'Detail Other Staff', 'IT_STAFF');
    const inactive = await make('inactive', 'Detail Inactive Staff', 'IT_STAFF', false);
    const requester = await make('requester', 'Detail Requester', 'REQUESTER');
    const otherRequester = await make('other-requester', 'Detail Other Requester', 'REQUESTER');
    const admin = await make('admin', 'Detail Administrator', 'ADMINISTRATOR');

    Object.assign(ids, { owner: owner.id, other: other.id, inactive: inactive.id, requester: requester.id, otherRequester: otherRequester.id, admin: admin.id });
    cookies.owner = `sid=${(await createSession(owner.id)).token}`;
    cookies.other = `sid=${(await createSession(other.id)).token}`;
    cookies.requester = `sid=${(await createSession(requester.id)).token}`;
    cookies.otherRequester = `sid=${(await createSession(otherRequester.id)).token}`;
    cookies.admin = `sid=${(await createSession(admin.id)).token}`;

    categoryId = (await prisma.category.findFirstOrThrow({ where: { isActive: true } })).id;
    relatedSystemId = (await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })).id;
  });

  afterAll(async () => {
    const tickets = { ticket: { ticketNumber: { startsWith: NUMBER_PREFIX } } };
    await prisma.attachment.deleteMany({ where: tickets });
    await prisma.publicComment.deleteMany({ where: tickets });
    await prisma.internalNote.deleteMany({ where: tickets });
    await prisma.ticket.deleteMany({ where: { ticketNumber: { startsWith: NUMBER_PREFIX } } });
    for (const storedFilename of storedFilenames) await deleteAttachmentFile(storedFilename);
    await prisma.session.deleteMany({ where: { user: { email: { startsWith: EMAIL_PREFIX } } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });
  });

  describe('GET /api/staff/tickets/:id (API-44, FR-11)', () => {
    it('returns the full Ticket with requester, owner and attachments, and no comments or notes', async () => {
      const ticket = await makeTicket({ status: 'OPEN', ownerId: ids.owner });

      const response = await as(cookies.other).get(`/api/staff/tickets/${ticket.id}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        requestedPriority: 'MEDIUM',
        itPriority: 'MEDIUM',
        currentStatus: 'OPEN',
        requesterConfirmedAt: null,
        requester: { id: ids.requester, name: 'Detail Requester', email: `${EMAIL_PREFIX}requester@toktickit.dev` },
        owner: { id: ids.owner, name: 'Detail Owner Staff' },
        attachments: [],
      });
      expect(response.body.category).toMatchObject({ id: categoryId });
      // api-spec.md 4: Comments and Internal Notes are fetched separately, never embedded here.
      for (const key of Object.keys(response.body)) {
        expect(key).not.toMatch(/comment|note/i);
      }
    });

    it('returns 404 for a Ticket that does not exist, or a non-numeric id', async () => {
      expect((await as(cookies.owner).get('/api/staff/tickets/99999999')).status).toBe(404);
      expect((await as(cookies.owner).get('/api/staff/tickets/abc')).status).toBe(404);
    });

    it('returns 403 to a Requester, even for their own Ticket', async () => {
      const ticket = await makeTicket();
      expect((await as(cookies.requester).get(`/api/staff/tickets/${ticket.id}`)).status).toBe(403);
    });
  });

  describe('POST /api/staff/tickets/:id/claim (API-19, API-20, API-43)', () => {
    it('API-19: claiming an unassigned New Ticket makes the caller the owner and opens it', async () => {
      const ticket = await makeTicket();

      const response = await as(cookies.owner).post(`/api/staff/tickets/${ticket.id}/claim`);

      expect(response.status).toBe(200);
      expect(await reload(ticket.id)).toMatchObject({ ticketOwnerId: ids.owner, currentStatus: 'OPEN' });
    });

    it('API-20: claiming an already-assigned Ticket is 409 ALREADY_ASSIGNED and changes nothing', async () => {
      const ticket = await makeTicket({ ownerId: ids.owner });

      const response = await as(cookies.other).post(`/api/staff/tickets/${ticket.id}/claim`);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('ALREADY_ASSIGNED');
      expect(await reload(ticket.id)).toMatchObject({ ticketOwnerId: ids.owner, currentStatus: 'NEW' });
    });

    it('claiming an unassigned Ticket that is no longer New is 409 INVALID_TRANSITION', async () => {
      const ticket = await makeTicket({ status: 'REOPENED' });

      const response = await as(cookies.owner).post(`/api/staff/tickets/${ticket.id}/claim`);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('INVALID_TRANSITION');
    });

    it('API-43: two simultaneous claims give exactly one success, and the winner is the owner', async () => {
      const ticket = await makeTicket();

      const [first, second] = await Promise.all([
        as(cookies.owner).post(`/api/staff/tickets/${ticket.id}/claim`),
        as(cookies.other).post(`/api/staff/tickets/${ticket.id}/claim`),
      ]);

      expect([first.status, second.status].sort()).toEqual([200, 409]);
      const loser = first.status === 409 ? first : second;
      expect(loser.body.error.code).toBe('ALREADY_ASSIGNED');
      const winnerId = first.status === 200 ? ids.owner : ids.other;
      expect((await reload(ticket.id)).ticketOwnerId).toBe(winnerId);
    });

    it('returns 404 for a Ticket that does not exist', async () => {
      expect((await as(cookies.owner).post('/api/staff/tickets/99999999/claim')).status).toBe(404);
    });
  });

  describe('POST /api/staff/tickets/:id/reassign (API-21)', () => {
    it('API-21: reassigns to another active IT Staff member without changing status', async () => {
      const ticket = await makeTicket({ status: 'IN_PROGRESS', ownerId: ids.owner });

      const response = await as(cookies.owner).post(`/api/staff/tickets/${ticket.id}/reassign`, { newOwnerId: ids.other });

      expect(response.status).toBe(200);
      expect(await reload(ticket.id)).toMatchObject({ ticketOwnerId: ids.other, currentStatus: 'IN_PROGRESS' });
    });

    it('can assign an unassigned Ticket at any status, including to the caller', async () => {
      const ticket = await makeTicket({ status: 'REOPENED' });

      const response = await as(cookies.owner).post(`/api/staff/tickets/${ticket.id}/reassign`, { newOwnerId: ids.owner });

      expect(response.status).toBe(200);
      expect(await reload(ticket.id)).toMatchObject({ ticketOwnerId: ids.owner, currentStatus: 'REOPENED' });
    });

    it('rejects an inactive IT Staff member, a non-IT-Staff user, or a missing id with 400', async () => {
      const ticket = await makeTicket({ ownerId: ids.owner });

      for (const body of [{ newOwnerId: ids.inactive }, { newOwnerId: ids.requester }, { newOwnerId: ids.admin }, {}, { newOwnerId: 'abc' }]) {
        const response = await as(cookies.owner).post(`/api/staff/tickets/${ticket.id}/reassign`, body);
        expect(response.status, JSON.stringify(body)).toBe(400);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      }
      expect((await reload(ticket.id)).ticketOwnerId).toBe(ids.owner);
    });
  });

  describe('PATCH /api/staff/tickets/:id/priority (API-25)', () => {
    it('API-25: an IT Staff member who does not own the Ticket can set IT Priority; Requested Priority stays', async () => {
      const ticket = await makeTicket({ status: 'OPEN', ownerId: ids.owner });

      const response = await as(cookies.other).patch(`/api/staff/tickets/${ticket.id}/priority`, { itPriority: 'HIGH' });

      expect(response.status).toBe(200);
      expect(await reload(ticket.id)).toMatchObject({ itPriority: 'HIGH', requestedPriority: 'MEDIUM' });
    });

    it('rejects a value that is not LOW, MEDIUM or HIGH with 400', async () => {
      const ticket = await makeTicket();

      const response = await as(cookies.owner).patch(`/api/staff/tickets/${ticket.id}/priority`, { itPriority: 'URGENT' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PATCH /api/staff/tickets/:id/status (API-22, API-23, API-24)', () => {
    const setStatus = (cookie: string, id: number, status: string) =>
      as(cookie).patch(`/api/staff/tickets/${id}/status`, { status });

    it('API-23: the owner can make a permitted transition', async () => {
      const ticket = await makeTicket({ status: 'OPEN', ownerId: ids.owner });

      const response = await setStatus(cookies.owner, ticket.id, 'IN_PROGRESS');

      expect(response.status).toBe(200);
      expect((await reload(ticket.id)).currentStatus).toBe('IN_PROGRESS');
    });

    it('the owner can move Reopened to In Progress, and a reassigned New Ticket to Open (Issue #38 matrix fixes)', async () => {
      const reopened = await makeTicket({ status: 'REOPENED', ownerId: ids.owner });
      expect((await setStatus(cookies.owner, reopened.id, 'IN_PROGRESS')).status).toBe(200);

      const reassignedNew = await makeTicket({ status: 'NEW', ownerId: ids.owner });
      expect((await setStatus(cookies.owner, reassignedNew.id, 'OPEN')).status).toBe(200);
      expect((await reload(reassignedNew.id)).currentStatus).toBe('OPEN');
    });

    it('API-22: a non-owner making an ownership-required transition gets 403 NOT_TICKET_OWNER', async () => {
      const owned = await makeTicket({ status: 'OPEN', ownerId: ids.owner });
      const unowned = await makeTicket({ status: 'OPEN' });

      for (const ticket of [owned, unowned]) {
        const response = await setStatus(cookies.other, ticket.id, 'IN_PROGRESS');
        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe('NOT_TICKET_OWNER');
        expect((await reload(ticket.id)).currentStatus).toBe('OPEN');
      }
    });

    it('any IT Staff member can Cancel a New Ticket or Reopen a Resolved one without owning it (BR-14)', async () => {
      const toCancel = await makeTicket({ status: 'NEW', ownerId: ids.owner });
      expect((await setStatus(cookies.other, toCancel.id, 'CANCELLED')).status).toBe(200);

      const toReopen = await makeTicket({ status: 'RESOLVED', ownerId: ids.owner });
      expect((await setStatus(cookies.other, toReopen.id, 'REOPENED')).status).toBe(200);
      expect((await reload(toReopen.id)).currentStatus).toBe('REOPENED');
    });

    it('API-24: a transition not in the matrix is 409 INVALID_TRANSITION, even for the owner', async () => {
      const ticket = await makeTicket({ status: 'OPEN', ownerId: ids.owner });

      const response = await setStatus(cookies.owner, ticket.id, 'CLOSED');

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('INVALID_TRANSITION');
      // Staff Ticket Detail polish: the message is shown to IT Staff as-is, so it uses status names, not enum codes.
      expect(response.body.error.message).toBe('This Ticket is Open and cannot move to Closed.');
      expect((await reload(ticket.id)).currentStatus).toBe('OPEN');
    });

    it('a status value that is not one of the 8 is 400 VALIDATION_ERROR', async () => {
      const ticket = await makeTicket({ status: 'OPEN', ownerId: ids.owner });

      const response = await setStatus(cookies.owner, ticket.id, 'DONE');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/staff/assignable-users (API-39)', () => {
    it('lists active IT Staff only, as id and name, and excludes inactive staff and other roles', async () => {
      const response = await as(cookies.owner).get('/api/staff/assignable-users');

      expect(response.status).toBe(200);
      const listedIds = response.body.map((user: { id: number }) => user.id);
      expect(listedIds).toEqual(expect.arrayContaining([ids.owner, ids.other]));
      for (const excluded of [ids.inactive, ids.requester, ids.admin]) {
        expect(listedIds).not.toContain(excluded);
      }
      for (const user of response.body) {
        expect(Object.keys(user).sort()).toEqual(['id', 'name']);
      }
    });

    it('is 403 for a Requester and for an Administrator', async () => {
      expect((await as(cookies.requester).get('/api/staff/assignable-users')).status).toBe(403);
      expect((await as(cookies.admin).get('/api/staff/assignable-users')).status).toBe(403);
    });
  });

  describe('GET /api/staff/attachments/:id/download (API-40)', () => {
    it('serves an active Attachment to IT Staff, 404s a removed one, and is 403 for a Requester', async () => {
      const ticket = await makeTicket();
      const fileBytes = Buffer.from('staff download fixture bytes');
      const activeName = `lab3-staff-detail-${Date.now()}-active.pdf`;
      const removedName = `lab3-staff-detail-${Date.now()}-removed.pdf`;
      storedFilenames.push(activeName, removedName);
      await saveAttachmentFile(activeName, fileBytes);
      await saveAttachmentFile(removedName, fileBytes);

      const base = { ticketId: ticket.id, originalFilename: 'report.pdf', mimeType: 'application/pdf', sizeBytes: fileBytes.length };
      const active = await prisma.attachment.create({ data: { ...base, storedFilename: activeName } });
      const removed = await prisma.attachment.create({
        data: { ...base, storedFilename: removedName, isActive: false, removedAt: new Date(), removalReason: 'Fixture removal' },
      });

      const served = await as(cookies.other).get(`/api/staff/attachments/${active.id}/download`).buffer(true).parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });
      expect(served.status).toBe(200);
      expect(served.headers['content-type']).toContain('application/pdf');
      expect(Buffer.compare(served.body as Buffer, fileBytes)).toBe(0);

      expect((await as(cookies.other).get(`/api/staff/attachments/${removed.id}/download`)).status).toBe(404);
      expect((await as(cookies.other).get('/api/staff/attachments/99999999/download')).status).toBe(404);
      expect((await as(cookies.requester).get(`/api/staff/attachments/${active.id}/download`)).status).toBe(403);
    });
  });

  describe('POST /api/tickets/:id/resolution-signal (API-26, API-42)', () => {
    const signal = (cookie: string, id: number) => as(cookie).post(`/api/tickets/${id}/resolution-signal`);

    it('API-26: the owning Requester records the signal without changing status, and IT Staff can see it', async () => {
      const ticket = await makeTicket({ status: 'IN_PROGRESS', ownerId: ids.owner });

      const response = await signal(cookies.requester, ticket.id);

      expect(response.status).toBe(200);
      expect(response.body.currentStatus).toBe('IN_PROGRESS');
      expect(response.body.requesterConfirmedAt).not.toBeNull();

      const staffView = await as(cookies.owner).get(`/api/staff/tickets/${ticket.id}`);
      expect(staffView.body.requesterConfirmedAt).toBe(response.body.requesterConfirmedAt);
      expect(staffView.body.currentStatus).toBe('IN_PROGRESS');
    });

    it('API-42: a repeat keeps the first time', async () => {
      const firstTime = new Date(Date.UTC(2099, 0, 1));
      const ticket = await makeTicket({ status: 'WAITING_FOR_REQUESTER', ownerId: ids.owner, requesterConfirmedAt: firstTime });

      const response = await signal(cookies.requester, ticket.id);

      expect(response.status).toBe(200);
      expect((await reload(ticket.id)).requesterConfirmedAt?.toISOString()).toBe(firstTime.toISOString());
    });

    it('API-42: a Closed or Cancelled Ticket is 409 TICKET_CLOSED', async () => {
      for (const status of ['CLOSED', 'CANCELLED'] as const) {
        const ticket = await makeTicket({ status, ownerId: ids.owner });
        const response = await signal(cookies.requester, ticket.id);
        expect(response.status, status).toBe(409);
        expect(response.body.error.code).toBe('TICKET_CLOSED');
        expect((await reload(ticket.id)).requesterConfirmedAt).toBeNull();
      }
    });

    it('is 404 for another Requester’s Ticket and 403 for IT Staff', async () => {
      const ticket = await makeTicket({ status: 'OPEN', ownerId: ids.owner });

      expect((await signal(cookies.otherRequester, ticket.id)).status).toBe(404);
      expect((await signal(cookies.owner, ticket.id)).status).toBe(403);
    });
  });
});
