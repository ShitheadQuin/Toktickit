import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/prisma';
import { hashPassword } from '../../src/auth/password-hash';
import { createSession } from '../../src/auth/session';

// Actions Taken API - api-spec.md 2, specification.md BR-01 to BR-12 and BR-20.
// Self-contained fixture users and Tickets, never the seeded accounts. Every Ticket is created by
// the test that uses it, so no test depends on another's state.
const EMAIL_PREFIX = 'lab4-actions-test-';
const NUMBER_PREFIX = 'TKT-2099-941';

type Role = 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR';
type Status = 'NEW' | 'OPEN' | 'IN_PROGRESS' | 'WAITING_FOR_REQUESTER' | 'RESOLVED' | 'CLOSED' | 'REOPENED' | 'CANCELLED';

describe('Actions Taken API', () => {
  const ids = { owner: 0, other: 0, inactive: 0, requester: 0, otherRequester: 0, admin: 0 };
  const cookies = { owner: '', other: '', requester: '', otherRequester: '', admin: '' };
  let categoryId: number;
  let relatedSystemId: number;
  let ticketCounter = 0;

  const as = (cookie: string) => ({
    get: (url: string) => request(app).get(url).set('Cookie', cookie),
    post: (url: string, body?: object) => request(app).post(url).set('Cookie', cookie).send(body ?? {}),
    patch: (url: string, body: object) => request(app).patch(url).set('Cookie', cookie).send(body),
  });

  async function makeTicket(over: { status?: Status; ownerId?: number | null; requesterId?: number } = {}) {
    ticketCounter++;
    return prisma.ticket.create({
      data: {
        ticketNumber: `${NUMBER_PREFIX}${String(ticketCounter).padStart(3, '0')}`,
        requesterId: over.requesterId ?? ids.requester,
        categoryId,
        relatedSystemId,
        summary: `Actions fixture ${ticketCounter}`,
        description: 'Fixture Ticket created by the Actions Taken API suite.',
        requestedPriority: 'MEDIUM',
        itPriority: 'MEDIUM',
        currentStatus: over.status ?? 'IN_PROGRESS',
        ticketOwnerId: over.ownerId === undefined ? ids.owner : over.ownerId,
        // Fixed in the past so any Action time from "now" backwards is after the Ticket (BR-06).
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
    });
  }

  const validAction = (over: Record<string, unknown> = {}) => ({
    actionAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    description: 'Checked the laptop charger',
    ...over,
  });

  const createAction = (cookie: string, ticketId: number, over: Record<string, unknown> = {}) =>
    as(cookie).post(`/api/staff/tickets/${ticketId}/actions`, validAction(over));

  beforeAll(async () => {
    const passwordHash = await hashPassword('FixturePass1');
    const make = (key: string, name: string, role: Role, isActive = true) =>
      prisma.user.create({
        data: { name, email: `${EMAIL_PREFIX}${key}@toktickit.dev`, role, isActive, passwordHash, mustChangePassword: false },
      });

    const owner = await make('owner', 'Actions Owner Staff', 'IT_STAFF');
    const other = await make('other', 'Actions Other Staff', 'IT_STAFF');
    const inactive = await make('inactive', 'Actions Inactive Staff', 'IT_STAFF', false);
    const requester = await make('requester', 'Actions Requester', 'REQUESTER');
    const otherRequester = await make('other-requester', 'Actions Other Requester', 'REQUESTER');
    const admin = await make('admin', 'Actions Administrator', 'ADMINISTRATOR');

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
    await prisma.actionTaken.deleteMany({ where: tickets });
    await prisma.ticketStatusHistory.deleteMany({ where: tickets });
    await prisma.ticket.deleteMany({ where: { ticketNumber: { startsWith: NUMBER_PREFIX } } });
    await prisma.session.deleteMany({ where: { user: { email: { startsWith: EMAIL_PREFIX } } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });
  });

  describe('GET /api/tickets/:id/actions (API-01, AC-05, BR-03)', () => {
    it('gives the owning Requester, IT Staff and Administrator the full list, and another Requester a 404', async () => {
      const ticket = await makeTicket();
      expect((await createAction(cookies.owner, ticket.id)).status).toBe(201);

      for (const cookie of [cookies.requester, cookies.other, cookies.admin]) {
        const response = await as(cookie).get(`/api/tickets/${ticket.id}/actions`);
        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(1);
        expect(response.body[0].description).toBe('Checked the laptop charger');
      }

      const stranger = await as(cookies.otherRequester).get(`/api/tickets/${ticket.id}/actions`);
      expect(stranger.status).toBe(404);
      expect(stranger.body.error.code).toBe('NOT_FOUND');
    });

    it('returns an empty list for a Ticket with no Actions, and 404 for a missing Ticket', async () => {
      const ticket = await makeTicket();
      const empty = await as(cookies.owner).get(`/api/tickets/${ticket.id}/actions`);
      expect(empty.status).toBe(200);
      expect(empty.body).toEqual([]);

      expect((await as(cookies.owner).get('/api/tickets/999999999/actions')).status).toBe(404);
    });

    it('requires a session', async () => {
      const ticket = await makeTicket();
      expect((await request(app).get(`/api/tickets/${ticket.id}/actions`)).status).toBe(401);
    });
  });

  describe('Requester writes (API-02, AC-04, BR-03)', () => {
    it('refuses a Requester creating or updating an Action on their own Ticket, and writes nothing', async () => {
      const ticket = await makeTicket();
      const created = await createAction(cookies.owner, ticket.id);

      const post = await createAction(cookies.requester, ticket.id, { description: 'Requester sneaks an action in' });
      expect(post.status).toBe(403);
      expect(post.body.error.code).toBe('FORBIDDEN');

      const patch = await as(cookies.requester).patch(`/api/staff/actions/${created.body.id}`, {
        expectedVersion: created.body.version,
        description: 'Changed by the Requester',
      });
      expect(patch.status).toBe(403);

      const rows = await prisma.actionTaken.findMany({ where: { ticketId: ticket.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.description).toBe('Checked the laptop charger');
    });
  });

  describe('POST /api/staff/tickets/:id/actions', () => {
    // API-03: the labsheet's own example row (§10)
    it('creates a valid Action Taken under the correct Ticket and actor (API-03, AC-01)', async () => {
      const ticket = await makeTicket();
      const response = await createAction(cookies.owner, ticket.id, {
        status: 'IN_PROGRESS',
        assigneeId: ids.other,
        attachmentNotes: 'See charger.jpg in Attachments',
      });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        ticketId: ticket.id,
        description: 'Checked the laptop charger',
        status: 'IN_PROGRESS',
        result: null,
        followUpRequired: false,
        followUpNote: null,
        attachmentNotes: 'See charger.jpg in Attachments',
        performedBy: { id: ids.owner, name: 'Actions Owner Staff' },
        assignee: { id: ids.other, name: 'Actions Other Staff' },
        version: 0,
      });

      const row = await prisma.actionTaken.findUniqueOrThrow({ where: { id: response.body.id } });
      expect(row.ticketId).toBe(ticket.id);
      expect(row.performedById).toBe(ids.owner);
      expect(row.assigneeId).toBe(ids.other);
    });

    it('defaults the status to Planned and the assignee to the creator', async () => {
      const ticket = await makeTicket();
      const response = await createAction(cookies.other, ticket.id);
      expect(response.status).toBe(201);
      expect(response.body.status).toBe('PLANNED');
      expect(response.body.assignee.id).toBe(ids.other);
    });

    it('moves the Ticket\'s Last Updated, since the Requester can see Actions (BR-12)', async () => {
      const ticket = await makeTicket();
      await createAction(cookies.owner, ticket.id);
      const after = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
      expect(after.updatedAt.getTime()).toBeGreaterThan(ticket.updatedAt.getTime());
    });

    it('returns 404 for a missing Ticket', async () => {
      expect((await createAction(cookies.owner, 999999999)).status).toBe(404);
    });
  });

  describe('Assignee rules (API-04, AC-06, BR-05)', () => {
    it('rejects an inactive IT Staff assignee', async () => {
      const ticket = await makeTicket();
      const response = await createAction(cookies.owner, ticket.id, { assigneeId: ids.inactive });
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('ASSIGNEE_INACTIVE');
      expect(response.body.error.fields[0].field).toBe('assigneeId');
    });

    it('rejects a Requester or an unknown user as assignee', async () => {
      const ticket = await makeTicket();
      for (const assigneeId of [ids.requester, 999999999]) {
        const response = await createAction(cookies.owner, ticket.id, { assigneeId });
        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe('ASSIGNEE_INVALID');
      }
    });

    it('accepts an Administrator as assignee', async () => {
      const ticket = await makeTicket();
      const response = await createAction(cookies.owner, ticket.id, { assigneeId: ids.admin });
      expect(response.status).toBe(201);
      expect(response.body.assignee.id).toBe(ids.admin);
    });

    it('rejects an inactive assignee on update too', async () => {
      const ticket = await makeTicket();
      const created = await createAction(cookies.owner, ticket.id);
      const response = await as(cookies.owner).patch(`/api/staff/actions/${created.body.id}`, {
        expectedVersion: created.body.version,
        assigneeId: ids.inactive,
      });
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('ASSIGNEE_INACTIVE');
    });
  });

  describe('Validation (API-05, AC-07)', () => {
    it('names every failing field and writes nothing', async () => {
      const ticket = await makeTicket();
      const response = await createAction(cookies.owner, ticket.id, {
        description: '   ',
        status: 'COMPLETED',
        followUpRequired: true,
        actionAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      });
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.fields.map((f: { field: string }) => f.field).sort()).toEqual(
        ['actionAt', 'description', 'followUpNote', 'result'].sort(),
      );
      expect(await prisma.actionTaken.count({ where: { ticketId: ticket.id } })).toBe(0);
    });

    it('refuses to create an Action that is already Cancelled', async () => {
      const ticket = await makeTicket();
      const response = await createAction(cookies.owner, ticket.id, { status: 'CANCELLED' });
      expect(response.status).toBe(400);
      expect(response.body.error.fields[0].field).toBe('status');
    });

    it('stores HTML-like text as plain text', async () => {
      const ticket = await makeTicket();
      const response = await createAction(cookies.owner, ticket.id, { description: '<script>alert(1)</script>' });
      expect(response.status).toBe(201);
      expect(response.body.description).toBe('<script>alert(1)</script>');
    });
  });

  describe('Action status changes (API-06, AC-08, BR-09)', () => {
    it('follows Planned -> In Progress -> Completed, then locks the Action', async () => {
      const ticket = await makeTicket();
      const created = await createAction(cookies.owner, ticket.id);
      const url = `/api/staff/actions/${created.body.id}`;

      const started = await as(cookies.owner).patch(url, { expectedVersion: 0, status: 'IN_PROGRESS' });
      expect(started.status).toBe(200);
      expect(started.body.status).toBe('IN_PROGRESS');

      const done = await as(cookies.other).patch(url, { expectedVersion: 1, status: 'COMPLETED', result: 'Charger replaced' });
      expect(done.status).toBe(200);
      expect(done.body).toMatchObject({ status: 'COMPLETED', result: 'Charger replaced', version: 2 });

      const locked = await as(cookies.owner).patch(url, { expectedVersion: 2, description: 'Edited after completion' });
      expect(locked.status).toBe(409);
      expect(locked.body.error.code).toBe('ACTION_LOCKED');
    });

    it('locks a Cancelled Action', async () => {
      const ticket = await makeTicket();
      const created = await createAction(cookies.owner, ticket.id);
      const url = `/api/staff/actions/${created.body.id}`;

      expect((await as(cookies.owner).patch(url, { expectedVersion: 0, status: 'CANCELLED' })).status).toBe(200);
      const locked = await as(cookies.owner).patch(url, { expectedVersion: 1, status: 'PLANNED' });
      expect(locked.status).toBe(409);
      expect(locked.body.error.code).toBe('ACTION_LOCKED');
    });

    it('refuses to move an In Progress Action back to Planned', async () => {
      const ticket = await makeTicket();
      const created = await createAction(cookies.owner, ticket.id, { status: 'IN_PROGRESS' });
      const response = await as(cookies.owner).patch(`/api/staff/actions/${created.body.id}`, { expectedVersion: 0, status: 'PLANNED' });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('INVALID_TRANSITION');
    });

    it('requires a result before completing, checked against the stored values', async () => {
      const ticket = await makeTicket();
      const created = await createAction(cookies.owner, ticket.id);
      const response = await as(cookies.owner).patch(`/api/staff/actions/${created.body.id}`, { expectedVersion: 0, status: 'COMPLETED' });
      expect(response.status).toBe(400);
      expect(response.body.error.fields[0].field).toBe('result');
    });

    it('returns 404 for a missing Action', async () => {
      expect((await as(cookies.owner).patch('/api/staff/actions/999999999', { expectedVersion: 0 })).status).toBe(404);
    });
  });

  describe('Several staff members on one Ticket (API-07, AC-09, BR-02)', () => {
    it('saves each Action with its own Performed By, ordered by Action Date/Time then id', async () => {
      const ticket = await makeTicket({ ownerId: ids.owner });
      const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000).toISOString();

      await createAction(cookies.other, ticket.id, { description: 'Second in time', actionAt: hoursAgo(2) });
      await createAction(cookies.admin, ticket.id, { description: 'First in time', actionAt: hoursAgo(3) });
      await createAction(cookies.other, ticket.id, { description: 'Third in time', actionAt: hoursAgo(1) });

      const list = await as(cookies.owner).get(`/api/tickets/${ticket.id}/actions`);
      expect(list.body.map((a: { description: string }) => a.description)).toEqual(['First in time', 'Second in time', 'Third in time']);
      expect(list.body.map((a: { performedBy: { id: number } }) => a.performedBy.id)).toEqual([ids.admin, ids.other, ids.other]);

      const unchanged = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
      expect(unchanged.ticketOwnerId).toBe(ids.owner);
    });
  });

  describe('Closed and Cancelled Tickets (API-08, AC-10, BR-10)', () => {
    it('refuses to create or update an Action once the Ticket is Closed or Cancelled', async () => {
      for (const status of ['CLOSED', 'CANCELLED'] as const) {
        const ticket = await makeTicket();
        const created = await createAction(cookies.owner, ticket.id);
        await prisma.ticket.update({ where: { id: ticket.id }, data: { currentStatus: status } });

        const post = await createAction(cookies.owner, ticket.id);
        expect(post.status).toBe(409);
        expect(post.body.error.code).toBe('TICKET_CLOSED');

        const patch = await as(cookies.owner).patch(`/api/staff/actions/${created.body.id}`, { expectedVersion: 0, description: 'Late edit' });
        expect(patch.status).toBe(409);
        expect(patch.body.error.code).toBe('TICKET_CLOSED');
      }
    });
  });

  describe('Repeated create (API-09, AC-11, BR-20)', () => {
    it('treats a second request with the same clientRequestId as the same Action', async () => {
      const ticket = await makeTicket();
      const clientRequestId = `retry-${Date.now()}`;

      const first = await createAction(cookies.owner, ticket.id, { clientRequestId });
      const repeat = await createAction(cookies.owner, ticket.id, { clientRequestId });
      const fresh = await createAction(cookies.owner, ticket.id, { clientRequestId: `${clientRequestId}-b` });

      expect(first.status).toBe(201);
      expect(repeat.status).toBe(200);
      expect(repeat.body.id).toBe(first.body.id);
      expect(fresh.status).toBe(201);
      expect(await prisma.actionTaken.count({ where: { ticketId: ticket.id } })).toBe(2);
    });

    it('creates one Action when the same request arrives twice at once', async () => {
      const ticket = await makeTicket();
      const clientRequestId = `race-${Date.now()}`;
      const results = await Promise.all([
        createAction(cookies.owner, ticket.id, { clientRequestId }),
        createAction(cookies.owner, ticket.id, { clientRequestId }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 201]);
      expect(await prisma.actionTaken.count({ where: { ticketId: ticket.id } })).toBe(1);
    });
  });

  describe('Stale update (API-10, AC-12, BR-19)', () => {
    it('refuses an update based on an old version and leaves the Action unchanged', async () => {
      const ticket = await makeTicket();
      const created = await createAction(cookies.owner, ticket.id);
      const url = `/api/staff/actions/${created.body.id}`;

      const first = await as(cookies.owner).patch(url, { expectedVersion: 0, description: 'First edit' });
      expect(first.status).toBe(200);
      expect(first.body.version).toBe(1);

      const stale = await as(cookies.other).patch(url, { expectedVersion: 0, description: 'Stale edit' });
      expect(stale.status).toBe(409);
      expect(stale.body.error.code).toBe('STALE_UPDATE');

      const row = await prisma.actionTaken.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(row.description).toBe('First edit');
      expect(row.version).toBe(1);
    });

    it('requires expectedVersion', async () => {
      const ticket = await makeTicket();
      const created = await createAction(cookies.owner, ticket.id);
      const response = await as(cookies.owner).patch(`/api/staff/actions/${created.body.id}`, { description: 'No version' });
      expect(response.status).toBe(400);
      expect(response.body.error.fields[0].field).toBe('expectedVersion');
    });
  });

  describe('Performed By is never taken from the client (API-11, AC-01, BR-04)', () => {
    it('ignores a performedById in the body on create and on update', async () => {
      const ticket = await makeTicket();
      const created = await createAction(cookies.owner, ticket.id, { performedById: ids.other, version: 7, ticketId: 1 });
      expect(created.status).toBe(201);
      expect(created.body.performedBy.id).toBe(ids.owner);
      expect(created.body.version).toBe(0);
      expect(created.body.ticketId).toBe(ticket.id);

      const updated = await as(cookies.other).patch(`/api/staff/actions/${created.body.id}`, {
        expectedVersion: 0,
        performedById: ids.other,
        description: 'Edited by another staff member',
      });
      expect(updated.status).toBe(200);
      expect(updated.body.performedBy.id).toBe(ids.owner);
    });
  });
});
