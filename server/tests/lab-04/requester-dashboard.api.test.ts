import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/prisma';
import { hashPassword } from '../../src/auth/password-hash';
import { createSession } from '../../src/auth/session';

// Requester dashboard - api-spec.md 5, specification.md BR-21 to BR-26.
// Dedicated Requesters whose Tickets are all created here, so every figure is known exactly.
const EMAIL_PREFIX = 'lab4-req-dash-test-';
const NUMBER_PREFIX = 'TKT-2099-943';
type Status = 'NEW' | 'OPEN' | 'IN_PROGRESS' | 'WAITING_FOR_REQUESTER' | 'RESOLVED' | 'CLOSED' | 'REOPENED' | 'CANCELLED';

describe('Requester dashboard API', () => {
  const ids = { alice: 0, bob: 0, empty: 0, staff: 0, admin: 0 };
  const cookies = { alice: '', bob: '', empty: '', staff: '', admin: '' };
  let categoryId: number;
  let relatedSystemId: number;
  let counter = 0;

  async function makeTicket(requesterId: number, status: Status, updatedDaysAgo = 0) {
    counter++;
    const updatedAt = new Date(Date.now() - updatedDaysAgo * 24 * 60 * 60 * 1000);
    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: `${NUMBER_PREFIX}${String(counter).padStart(3, '0')}`,
        requesterId,
        categoryId,
        relatedSystemId,
        summary: `Requester dashboard fixture ${counter}`,
        description: 'Fixture Ticket created by the Requester dashboard suite.',
        requestedPriority: 'MEDIUM',
        itPriority: 'MEDIUM',
        currentStatus: status,
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      },
    });
    // @updatedAt is set on create; put it back to the time this fixture needs.
    await prisma.$executeRaw`UPDATE "Ticket" SET "updatedAt" = ${updatedAt} WHERE id = ${ticket.id}`;
    return ticket;
  }

  const metric = (body: { metrics: { key: string; count: number; link: string }[] }, key: string) => body.metrics.find((m) => m.key === key)!;

  beforeAll(async () => {
    const passwordHash = await hashPassword('FixturePass1');
    const make = (key: string, name: string, role: 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR') =>
      prisma.user.create({ data: { name, email: `${EMAIL_PREFIX}${key}@toktickit.dev`, role, passwordHash, mustChangePassword: false } });
    const users = {
      alice: await make('alice', 'Dash Alice', 'REQUESTER'),
      bob: await make('bob', 'Dash Bob', 'REQUESTER'),
      empty: await make('empty', 'Dash Empty', 'REQUESTER'),
      staff: await make('staff', 'Dash Staff', 'IT_STAFF'),
      admin: await make('admin', 'Dash Admin', 'ADMINISTRATOR'),
    };
    for (const [key, user] of Object.entries(users)) {
      ids[key as keyof typeof ids] = user.id;
      cookies[key as keyof typeof cookies] = `sid=${(await createSession(user.id)).token}`;
    }
    categoryId = (await prisma.category.findFirstOrThrow({ where: { isActive: true } })).id;
    relatedSystemId = (await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })).id;

    // Alice: 3 active (one waiting), 2 resolved (one recent, one old), 1 closed, 1 cancelled.
    await makeTicket(ids.alice, 'NEW', 3);
    await makeTicket(ids.alice, 'IN_PROGRESS', 1);
    await makeTicket(ids.alice, 'WAITING_FOR_REQUESTER', 0);
    await makeTicket(ids.alice, 'RESOLVED', 2);
    await makeTicket(ids.alice, 'RESOLVED', 20);
    await makeTicket(ids.alice, 'CLOSED', 10);
    await makeTicket(ids.alice, 'CANCELLED', 12);
    // Bob: 1 active, nothing else.
    await makeTicket(ids.bob, 'OPEN', 0);
  });

  afterAll(async () => {
    await prisma.ticket.deleteMany({ where: { ticketNumber: { startsWith: NUMBER_PREFIX } } });
    await prisma.session.deleteMany({ where: { user: { email: { startsWith: EMAIL_PREFIX } } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });
  });

  describe('Own Tickets only (API-20, AC-02, BR-22)', () => {
    it('gives each Requester the figures and recent Tickets of their own Tickets only', async () => {
      const alice = await request(app).get('/api/dashboard/requester').set('Cookie', cookies.alice);
      expect(alice.status).toBe(200);
      expect(metric(alice.body, 'myOpen')).toMatchObject({ count: 3, link: '/my-tickets?statusGroup=active' });
      expect(metric(alice.body, 'waitingForMe')).toMatchObject({ count: 1, link: '/my-tickets?currentStatus=WAITING_FOR_REQUESTER' });
      expect(metric(alice.body, 'resolved')).toMatchObject({ count: 2, link: '/my-tickets?currentStatus=RESOLVED' });
      expect(metric(alice.body, 'closed')).toMatchObject({ count: 1, link: '/my-tickets?currentStatus=CLOSED' });

      // Recent: the 5 most recently updated, newest first. Recently resolved: Resolved in the last 7 days.
      expect(alice.body.recentTickets).toHaveLength(5);
      const updated = alice.body.recentTickets.map((t: { updatedAt: string }) => new Date(t.updatedAt).getTime());
      expect([...updated].sort((a, b) => b - a)).toEqual(updated);
      expect(alice.body.recentlyResolved).toHaveLength(1);
      expect(alice.body.recentlyResolved[0].currentStatus).toBe('RESOLVED');
      for (const ticket of [...alice.body.recentTickets, ...alice.body.recentlyResolved]) {
        expect(Object.keys(ticket).sort()).toEqual(['currentStatus', 'id', 'summary', 'ticketNumber', 'updatedAt']);
      }

      const bob = await request(app).get('/api/dashboard/requester').set('Cookie', cookies.bob);
      expect(metric(bob.body, 'myOpen').count).toBe(1);
      expect(bob.body.recentTickets).toHaveLength(1);
      const aliceNumbers = new Set(alice.body.recentTickets.map((t: { ticketNumber: string }) => t.ticketNumber));
      expect(aliceNumbers.has(bob.body.recentTickets[0].ticketNumber)).toBe(false);
    });

    it('ignores any user id sent in the query', async () => {
      const response = await request(app).get(`/api/dashboard/requester?requesterId=${ids.alice}&userId=${ids.alice}`).set('Cookie', cookies.bob);
      expect(metric(response.body, 'myOpen').count).toBe(1);
    });
  });

  describe('Empty dashboard (API-21, AC-23, BR-25)', () => {
    it('shows zeros and empty lists for a Requester with no Tickets', async () => {
      const response = await request(app).get('/api/dashboard/requester').set('Cookie', cookies.empty);
      expect(response.status).toBe(200);
      expect(response.body.metrics.map((m: { count: number }) => m.count)).toEqual([0, 0, 0, 0]);
      expect(response.body.recentTickets).toEqual([]);
      expect(response.body.recentlyResolved).toEqual([]);
    });
  });

  describe('Role restrictions (API-22, AC-22)', () => {
    it('refuses the Requester dashboard to IT Staff and Administrators, and the Staff dashboard to a Requester', async () => {
      for (const cookie of [cookies.staff, cookies.admin]) {
        const response = await request(app).get('/api/dashboard/requester').set('Cookie', cookie);
        expect(response.status).toBe(403);
        expect(response.body.metrics).toBeUndefined();
      }
      const staffDashboard = await request(app).get('/api/dashboard/staff').set('Cookie', cookies.alice);
      expect(staffDashboard.status).toBe(403);
      expect(staffDashboard.body.metrics).toBeUndefined();
      expect((await request(app).get('/api/dashboard/requester')).status).toBe(401);
    });
  });
});
