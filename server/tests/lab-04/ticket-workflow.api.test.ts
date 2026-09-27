import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/prisma';
import { hashPassword } from '../../src/auth/password-hash';
import { createSession } from '../../src/auth/session';

// Ticket workflow - api-spec.md 1 and 3, specification.md BR-13 to BR-19.
// Self-contained fixture users and Tickets; every Ticket is created by the test that uses it.
const EMAIL_PREFIX = 'lab4-workflow-test-';
const NUMBER_PREFIX = 'TKT-2099-942';

type Role = 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR';
type Status = 'NEW' | 'OPEN' | 'IN_PROGRESS' | 'WAITING_FOR_REQUESTER' | 'RESOLVED' | 'CLOSED' | 'REOPENED' | 'CANCELLED';
type ActionStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

describe('Ticket workflow API', () => {
  const ids = { owner: 0, other: 0, requester: 0, otherRequester: 0, admin: 0 };
  const cookies = { owner: '', other: '', requester: '', otherRequester: '', admin: '' };
  let categoryId: number;
  let relatedSystemId: number;
  let ticketCounter = 0;

  const as = (cookie: string) => ({
    get: (url: string) => request(app).get(url).set('Cookie', cookie),
    post: (url: string, body?: object) => request(app).post(url).set('Cookie', cookie).send(body ?? {}),
    patch: (url: string, body: object) => request(app).patch(url).set('Cookie', cookie).send(body),
    delete: (url: string) => request(app).delete(url).set('Cookie', cookie),
  });

  async function makeTicket(over: { status?: Status; ownerId?: number | null; requesterId?: number; actions?: ActionStatus[] } = {}) {
    ticketCounter++;
    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: `${NUMBER_PREFIX}${String(ticketCounter).padStart(3, '0')}`,
        requesterId: over.requesterId ?? ids.requester,
        categoryId,
        relatedSystemId,
        summary: `Workflow fixture ${ticketCounter}`,
        description: 'Fixture Ticket created by the Ticket workflow API suite.',
        requestedPriority: 'MEDIUM',
        itPriority: 'MEDIUM',
        currentStatus: over.status ?? 'IN_PROGRESS',
        ticketOwnerId: over.ownerId === undefined ? ids.owner : over.ownerId,
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
    });
    for (const [i, status] of (over.actions ?? []).entries()) {
      await prisma.actionTaken.create({
        data: {
          ticketId: ticket.id,
          actionAt: new Date(Date.now() - (10 - i) * 60 * 60 * 1000),
          description: `Fixture action ${i + 1}`,
          result: status === 'COMPLETED' || status === 'CANCELLED' ? 'Fixture result' : null,
          status,
          performedById: ids.owner,
          assigneeId: ids.owner,
        },
      });
    }
    return ticket;
  }

  const reload = (id: number) => prisma.ticket.findUniqueOrThrow({ where: { id } });
  const setStatus = (cookie: string, id: number, status: Status, expectedVersion: number) =>
    as(cookie).patch(`/api/staff/tickets/${id}/status`, { status, expectedVersion });

  beforeAll(async () => {
    const passwordHash = await hashPassword('FixturePass1');
    const make = (key: string, name: string, role: Role) =>
      prisma.user.create({
        data: { name, email: `${EMAIL_PREFIX}${key}@toktickit.dev`, role, isActive: true, passwordHash, mustChangePassword: false },
      });
    const owner = await make('owner', 'Workflow Owner Staff', 'IT_STAFF');
    const other = await make('other', 'Workflow Other Staff', 'IT_STAFF');
    const requester = await make('requester', 'Workflow Requester', 'REQUESTER');
    const otherRequester = await make('other-requester', 'Workflow Other Requester', 'REQUESTER');
    const admin = await make('admin', 'Workflow Administrator', 'ADMINISTRATOR');
    Object.assign(ids, { owner: owner.id, other: other.id, requester: requester.id, otherRequester: otherRequester.id, admin: admin.id });
    for (const [key, user] of Object.entries({ owner, other, requester, otherRequester, admin })) {
      cookies[key as keyof typeof cookies] = `sid=${(await createSession(user.id)).token}`;
    }
    categoryId = (await prisma.category.findFirstOrThrow({ where: { isActive: true } })).id;
    relatedSystemId = (await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })).id;
  });

  afterAll(async () => {
    const tickets = { ticket: { ticketNumber: { startsWith: NUMBER_PREFIX } } };
    await prisma.actionTaken.deleteMany({ where: tickets });
    await prisma.ticketStatusHistory.deleteMany({ where: tickets });
    await prisma.publicComment.deleteMany({ where: tickets });
    await prisma.internalNote.deleteMany({ where: tickets });
    await prisma.ticket.deleteMany({ where: { ticketNumber: { startsWith: NUMBER_PREFIX } } });
    await prisma.session.deleteMany({ where: { user: { email: { startsWith: EMAIL_PREFIX } } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });
  });

  describe('Stale updates (API-12, AC-13, BR-19)', () => {
    it('refuses a stale claim, reassign, IT Priority or status change and changes nothing', async () => {
      const unassigned = await makeTicket({ status: 'NEW', ownerId: null });
      const owned = await makeTicket({ status: 'OPEN' });
      const attempts = [
        as(cookies.other).post(`/api/staff/tickets/${unassigned.id}/claim`, { expectedVersion: 5 }),
        as(cookies.other).post(`/api/staff/tickets/${owned.id}/reassign`, { newOwnerId: ids.other, expectedVersion: 5 }),
        as(cookies.owner).patch(`/api/staff/tickets/${owned.id}/priority`, { itPriority: 'HIGH', expectedVersion: 5 }),
        setStatus(cookies.owner, owned.id, 'IN_PROGRESS', 5),
      ];
      for (const response of await Promise.all(attempts)) {
        expect(response.status).toBe(409);
        expect(response.body.error.code).toBe('STALE_UPDATE');
      }
      expect(await reload(unassigned.id)).toMatchObject({ ticketOwnerId: null, currentStatus: 'NEW', version: 0 });
      expect(await reload(owned.id)).toMatchObject({ ticketOwnerId: ids.owner, currentStatus: 'OPEN', itPriority: 'MEDIUM', version: 0 });
    });

    it('requires expectedVersion on every Ticket write', async () => {
      const owned = await makeTicket({ status: 'OPEN' });
      const unassigned = await makeTicket({ status: 'NEW', ownerId: null });
      const attempts = [
        as(cookies.other).post(`/api/staff/tickets/${unassigned.id}/claim`),
        as(cookies.other).post(`/api/staff/tickets/${owned.id}/reassign`, { newOwnerId: ids.other }),
        as(cookies.owner).patch(`/api/staff/tickets/${owned.id}/priority`, { itPriority: 'HIGH' }),
        as(cookies.owner).patch(`/api/staff/tickets/${owned.id}/status`, { status: 'IN_PROGRESS' }),
      ];
      for (const response of await Promise.all(attempts)) {
        expect(response.status).toBe(400);
        expect(response.body.error.fields.map((f: { field: string }) => f.field)).toContain('expectedVersion');
      }
    });

    it('raises the version by one on each successful write and returns it', async () => {
      const ticket = await makeTicket({ status: 'NEW', ownerId: null });
      const claimed = await as(cookies.owner).post(`/api/staff/tickets/${ticket.id}/claim`, { expectedVersion: 0 });
      expect(claimed.status).toBe(200);
      expect(claimed.body.version).toBe(1);
      const prioritised = await as(cookies.owner).patch(`/api/staff/tickets/${ticket.id}/priority`, { itPriority: 'HIGH', expectedVersion: 1 });
      expect(prioritised.body.version).toBe(2);
      const started = await setStatus(cookies.owner, ticket.id, 'IN_PROGRESS', 2);
      expect(started.body).toMatchObject({ currentStatus: 'IN_PROGRESS', version: 3 });
      const detail = await as(cookies.other).get(`/api/staff/tickets/${ticket.id}`);
      expect(detail.body.version).toBe(3);
    });

    it('tells a non-owner they are not the owner before telling them the Ticket changed (PR #66 review)', async () => {
      const owned = await makeTicket({ status: 'OPEN' });
      const response = await setStatus(cookies.other, owned.id, 'IN_PROGRESS', 7);
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('NOT_TICKET_OWNER');
    });
  });

  describe('Resolution gate (API-13, AC-14, BR-16)', () => {
    for (const [label, actions, completed, open] of [
      ['no Actions', [], 0, 0],
      ['a Completed and a Planned Action', ['COMPLETED', 'PLANNED'], 1, 1],
      ['a Completed and an In Progress Action', ['COMPLETED', 'IN_PROGRESS'], 1, 1],
      ['only Cancelled Actions', ['CANCELLED'], 0, 0],
    ] as const) {
      it(`refuses Resolved with ${label}, even straight to the API`, async () => {
        const ticket = await makeTicket({ actions: [...actions] });
        const response = await setStatus(cookies.owner, ticket.id, 'RESOLVED', 0);
        expect(response.status).toBe(409);
        expect(response.body.error.code).toBe('RESOLUTION_GATE_NOT_MET');
        expect(response.body.error.details).toEqual({ completed, open });
        expect(await reload(ticket.id)).toMatchObject({ currentStatus: 'IN_PROGRESS', version: 0 });
      });
    }

    it('reports the gate on Ticket Detail so the screen can explain it', async () => {
      const ticket = await makeTicket({ actions: ['COMPLETED', 'PLANNED'] });
      const detail = await as(cookies.owner).get(`/api/staff/tickets/${ticket.id}`);
      expect(detail.body.gate).toEqual({ completed: 1, open: 1, met: false });
    });
  });

  describe('Resolving when the gate is met (API-14, AC-15, BR-18)', () => {
    it('resolves the Ticket, raises the version, and records one history row', async () => {
      const ticket = await makeTicket({ status: 'WAITING_FOR_REQUESTER', actions: ['COMPLETED', 'COMPLETED', 'CANCELLED'] });
      const response = await setStatus(cookies.owner, ticket.id, 'RESOLVED', 0);
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ currentStatus: 'RESOLVED', version: 1, gate: { completed: 2, open: 0, met: true } });

      const history = await prisma.ticketStatusHistory.findMany({ where: { ticketId: ticket.id } });
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({ fromStatus: 'WAITING_FOR_REQUESTER', toStatus: 'RESOLVED', changedById: ids.owner });
    });
  });

  describe('Administrator performs IT Staff behaviour (API-15, AC-16, BR-13)', () => {
    it('lets an Administrator use the queue, claim, set IT Priority, change status, post a note and comment, and add an Action', async () => {
      expect((await as(cookies.admin).get('/api/staff/tickets')).status).toBe(200);

      const ticket = await makeTicket({ status: 'NEW', ownerId: null });
      const claimed = await as(cookies.admin).post(`/api/staff/tickets/${ticket.id}/claim`, { expectedVersion: 0 });
      expect(claimed.status).toBe(200);
      expect(claimed.body.owner.id).toBe(ids.admin);

      expect((await as(cookies.admin).patch(`/api/staff/tickets/${ticket.id}/priority`, { itPriority: 'HIGH', expectedVersion: 1 })).status).toBe(200);
      expect((await setStatus(cookies.admin, ticket.id, 'IN_PROGRESS', 2)).status).toBe(200);
      expect((await as(cookies.admin).post(`/api/tickets/${ticket.id}/notes`, { body: 'Admin note' })).status).toBe(201);
      expect((await as(cookies.admin).post(`/api/tickets/${ticket.id}/comments`, { body: 'Admin comment' })).status).toBe(201);
      expect((await as(cookies.admin).post(`/api/staff/tickets/${ticket.id}/actions`, { description: 'Admin action' })).status).toBe(201);
    });

    it('lets IT Staff reassign a Ticket to an Administrator, and lists Administrators as assignable', async () => {
      const ticket = await makeTicket({ status: 'OPEN' });
      const reassigned = await as(cookies.owner).post(`/api/staff/tickets/${ticket.id}/reassign`, { newOwnerId: ids.admin, expectedVersion: 0 });
      expect(reassigned.status).toBe(200);
      expect(reassigned.body.owner.id).toBe(ids.admin);

      const assignable = await as(cookies.owner).get('/api/staff/assignable-users');
      expect(assignable.body).toEqual(expect.arrayContaining([
        { id: ids.admin, name: 'Workflow Administrator', role: 'ADMINISTRATOR' },
        { id: ids.owner, name: 'Workflow Owner Staff', role: 'IT_STAFF' },
      ]));
    });

    it('still refuses a Requester on every staff route', async () => {
      const ticket = await makeTicket();
      expect((await as(cookies.requester).get('/api/staff/tickets')).status).toBe(403);
      expect((await setStatus(cookies.requester, ticket.id, 'RESOLVED', 0)).status).toBe(403);
    });
  });

  describe('Transitions outside the matrix (API-16, AC-17, BR-15)', () => {
    for (const [from, to] of [['NEW', 'RESOLVED'], ['OPEN', 'CLOSED'], ['CLOSED', 'IN_PROGRESS'], ['CANCELLED', 'OPEN'], ['REOPENED', 'RESOLVED']] as const) {
      it(`refuses ${from} -> ${to}`, async () => {
        const ticket = await makeTicket({ status: from });
        const response = await setStatus(cookies.owner, ticket.id, to, 0);
        expect(response.status).toBe(409);
        expect(response.body.error.code).toBe('INVALID_TRANSITION');
      });
    }
  });

  describe('Status history (API-17, AC-18, BR-18)', () => {
    it('records every change in order, shows it to staff and the owning Requester only, and has no write route', async () => {
      const ticket = await makeTicket({ status: 'NEW', ownerId: null });
      await as(cookies.owner).post(`/api/staff/tickets/${ticket.id}/claim`, { expectedVersion: 0 });
      await setStatus(cookies.owner, ticket.id, 'IN_PROGRESS', 1);
      await setStatus(cookies.owner, ticket.id, 'WAITING_FOR_REQUESTER', 2);

      const staffView = await as(cookies.other).get(`/api/tickets/${ticket.id}/history`);
      expect(staffView.status).toBe(200);
      expect(staffView.body.map((h: { fromStatus: string; toStatus: string }) => `${h.fromStatus}>${h.toStatus}`)).toEqual([
        'NEW>OPEN',
        'OPEN>IN_PROGRESS',
        'IN_PROGRESS>WAITING_FOR_REQUESTER',
      ]);
      expect(staffView.body[0].changedBy).toEqual({ id: ids.owner, name: 'Workflow Owner Staff' });

      expect((await as(cookies.requester).get(`/api/tickets/${ticket.id}/history`)).status).toBe(200);
      expect((await as(cookies.otherRequester).get(`/api/tickets/${ticket.id}/history`)).status).toBe(404);

      const rowId = staffView.body[0].id;
      expect((await as(cookies.admin).patch(`/api/tickets/${ticket.id}/history/${rowId}`, { toStatus: 'CLOSED' })).status).toBe(404);
      expect((await as(cookies.admin).delete(`/api/tickets/${ticket.id}/history/${rowId}`)).status).toBe(404);
      expect(await prisma.ticketStatusHistory.count({ where: { ticketId: ticket.id } })).toBe(3);
    });
  });

  describe('Requester resolution signal stays advisory (API-18, AC-19, BR-17)', () => {
    it('records the signal without changing the status or the version', async () => {
      const ticket = await makeTicket({ status: 'IN_PROGRESS' });
      const response = await as(cookies.requester).post(`/api/tickets/${ticket.id}/resolution-signal`);
      expect(response.status).toBe(200);
      const after = await reload(ticket.id);
      expect(after.currentStatus).toBe('IN_PROGRESS');
      expect(after.version).toBe(0);
      expect(after.requesterConfirmedAt).not.toBeNull();
    });
  });

  describe('Two changes at once (API-19, AC-13, BR-19)', () => {
    it('lets exactly one of two same-version status changes through', async () => {
      const ticket = await makeTicket({ status: 'IN_PROGRESS' });
      const results = await Promise.all([
        setStatus(cookies.owner, ticket.id, 'WAITING_FOR_REQUESTER', 0),
        setStatus(cookies.owner, ticket.id, 'WAITING_FOR_REQUESTER', 0),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(results.find((r) => r.status === 409)!.body.error.code).toBe('STALE_UPDATE');
      expect(await prisma.ticketStatusHistory.count({ where: { ticketId: ticket.id } })).toBe(1);
    });
  });

  describe('Action writes re-check the Ticket inside the write (PR #67 review, BR-10)', () => {
    it('refuses an Action when the Ticket is closed between the check and the write', async () => {
      const { writeActionIfTicketOpen } = await import('../../src/routes/actions');
      const ticket = await makeTicket({ status: 'RESOLVED' });
      // The route read "Resolved" (open for Actions); the Ticket is then closed before the write runs.
      await prisma.ticket.update({ where: { id: ticket.id }, data: { currentStatus: 'CLOSED' } });
      const written = await writeActionIfTicketOpen(ticket.id, (tx) =>
        tx.actionTaken.create({
          data: { ticketId: ticket.id, actionAt: new Date(), description: 'Late action', performedById: ids.owner, assigneeId: ids.owner },
        }),
      );
      expect(written).toBeNull();
      expect(await prisma.actionTaken.count({ where: { ticketId: ticket.id } })).toBe(0);
    });
  });
});
