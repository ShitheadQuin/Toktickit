import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/prisma';
import { hashPassword } from '../../src/auth/password-hash';
import { createSession } from '../../src/auth/session';

// Staff dashboard - api-spec.md 5, specification.md BR-21 to BR-26. Every figure is compared with
// the same question asked of the database directly (AC-21), and every link is followed to the list
// it opens, whose total must equal the figure (AC-24, BR-23).
const EMAIL_PREFIX = 'lab4-staff-dash-test-';
const NUMBER_PREFIX = 'TKT-2099-944';
const ACTIVE = ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'REOPENED'] as const;
const STATUSES = ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CLOSED', 'REOPENED', 'CANCELLED'] as const;

describe('Staff dashboard API', () => {
  const ids = { staff: 0, idle: 0, admin: 0, requester: 0 };
  const cookies = { staff: '', idle: '', admin: '', requester: '' };

  beforeAll(async () => {
    const passwordHash = await hashPassword('FixturePass1');
    const make = (key: string, name: string, role: 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR') =>
      prisma.user.create({ data: { name, email: `${EMAIL_PREFIX}${key}@toktickit.dev`, role, passwordHash, mustChangePassword: false } });
    const users = {
      staff: await make('staff', 'Dash Busy Staff', 'IT_STAFF'),
      idle: await make('idle', 'Dash Idle Staff', 'IT_STAFF'),
      admin: await make('admin', 'Dash Staff Admin', 'ADMINISTRATOR'),
      requester: await make('requester', 'Dash Staff Requester', 'REQUESTER'),
    };
    for (const [key, user] of Object.entries(users)) {
      ids[key as keyof typeof ids] = user.id;
      cookies[key as keyof typeof cookies] = `sid=${(await createSession(user.id)).token}`;
    }
    const categoryId = (await prisma.category.findFirstOrThrow({ where: { isActive: true } })).id;
    const relatedSystemId = (await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })).id;
    const fixtures: { status: (typeof STATUSES)[number]; owner: number | null; itPriority: 'LOW' | 'MEDIUM' | 'HIGH' }[] = [
      { status: 'OPEN', owner: ids.staff, itPriority: 'HIGH' },
      { status: 'IN_PROGRESS', owner: ids.staff, itPriority: 'MEDIUM' },
      { status: 'RESOLVED', owner: ids.staff, itPriority: 'HIGH' },
      { status: 'NEW', owner: null, itPriority: 'LOW' },
    ];
    for (const [i, f] of fixtures.entries()) {
      const ticket = await prisma.ticket.create({
        data: {
          ticketNumber: `${NUMBER_PREFIX}${String(i + 1).padStart(3, '0')}`,
          requesterId: ids.requester,
          categoryId,
          relatedSystemId,
          summary: `Staff dashboard fixture ${i + 1}`,
          description: 'Fixture Ticket created by the Staff dashboard suite.',
          requestedPriority: 'MEDIUM',
          itPriority: f.itPriority,
          currentStatus: f.status,
          ticketOwnerId: f.owner,
          createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        },
      });
      if (i === 1) {
        for (const status of ['PLANNED', 'IN_PROGRESS', 'COMPLETED'] as const) {
          await prisma.actionTaken.create({
            data: {
              ticketId: ticket.id,
              actionAt: new Date(Date.now() - 60 * 60 * 1000),
              description: `Busy staff action ${status} `.repeat(10),
              result: status === 'COMPLETED' ? 'Done' : null,
              status,
              performedById: ids.staff,
              assigneeId: ids.staff,
            },
          });
        }
      }
    }
  });

  afterAll(async () => {
    const tickets = { ticket: { ticketNumber: { startsWith: NUMBER_PREFIX } } };
    await prisma.actionTaken.deleteMany({ where: tickets });
    await prisma.ticket.deleteMany({ where: { ticketNumber: { startsWith: NUMBER_PREFIX } } });
    await prisma.session.deleteMany({ where: { user: { email: { startsWith: EMAIL_PREFIX } } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });
  });

  const get = (cookie: string) => request(app).get('/api/dashboard/staff').set('Cookie', cookie);
  const metric = (body: { metrics: { key: string; count: number; link: string | null }[] }, key: string) => body.metrics.find((m) => m.key === key)!;

  describe('Every figure equals the database (API-23, AC-21, BR-23, BR-26)', () => {
    it('matches the same queries run directly through Prisma', async () => {
      const response = await get(cookies.staff);
      expect(response.status).toBe(200);
      const body = response.body;

      expect(metric(body, 'unassigned').count).toBe(await prisma.ticket.count({ where: { ticketOwnerId: null, currentStatus: { in: [...ACTIVE] } } }));
      expect(metric(body, 'myTickets').count).toBe(await prisma.ticket.count({ where: { ticketOwnerId: ids.staff, currentStatus: { in: [...ACTIVE] } } }));
      expect(metric(body, 'myTickets').count).toBe(2);
      expect(metric(body, 'highPriority').count).toBe(await prisma.ticket.count({ where: { itPriority: 'HIGH', currentStatus: { in: [...ACTIVE] } } }));
      expect(metric(body, 'myOpenActions').count).toBe(2);
      expect(metric(body, 'myOpenActions').link).toBeNull();

      expect(body.byStatus.map((s: { status: string }) => s.status)).toEqual([...STATUSES]);
      for (const row of body.byStatus) {
        expect(row.count).toBe(await prisma.ticket.count({ where: { currentStatus: row.status } }));
      }
      expect(body.byItPriority.map((p: { itPriority: string }) => p.itPriority)).toEqual(['HIGH', 'MEDIUM', 'LOW']);
      for (const row of body.byItPriority) {
        expect(row.count).toBe(await prisma.ticket.count({ where: { itPriority: row.itPriority, currentStatus: { in: [...ACTIVE] } } }));
      }

      const recent = await prisma.ticket.findMany({ orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: 5, select: { id: true } });
      expect(body.recentTickets.map((t: { id: number }) => t.id)).toEqual(recent.map((t) => t.id));

      expect(body.myOpenActions).toHaveLength(2);
      for (const action of body.myOpenActions) {
        expect(['PLANNED', 'IN_PROGRESS']).toContain(action.status);
        expect(action.description.length).toBeLessThanOrEqual(120);
        expect(action.ticketNumber).toMatch(new RegExp(`^${NUMBER_PREFIX}`));
      }
    });
  });

  describe('User counts only for Administrators (API-24, AC-22)', () => {
    it('omits user counts for IT Staff and gives correct ones to an Administrator', async () => {
      expect((await get(cookies.staff)).body.userCounts).toBeUndefined();
      const admin = await get(cookies.admin);
      expect(admin.status).toBe(200);
      expect(admin.body.userCounts).toEqual({
        requester: await prisma.user.count({ where: { role: 'REQUESTER', isActive: true } }),
        itStaff: await prisma.user.count({ where: { role: 'IT_STAFF', isActive: true } }),
        administrator: await prisma.user.count({ where: { role: 'ADMINISTRATOR', isActive: true } }),
        inactive: await prisma.user.count({ where: { isActive: false } }),
        link: '/users',
      });
    });
  });

  describe('Each link opens a list whose total equals the figure (API-25, AC-24, BR-23)', () => {
    it('agrees for every Staff card, status row and IT Priority row', async () => {
      const body = (await get(cookies.staff)).body;
      const links = [
        ...body.metrics.filter((m: { link: string | null }) => m.link),
        ...body.byStatus,
        ...body.byItPriority,
      ] as { count: number; link: string }[];
      expect(links.length).toBe(3 + 8 + 3);
      for (const { count, link } of links) {
        const query = link.split('?')[1];
        const list = await request(app).get(`/api/staff/tickets?${query}`).set('Cookie', cookies.staff);
        expect(list.status, link).toBe(200);
        expect(list.body.totalCount, link).toBe(count);
      }
    });

    it('agrees for every Requester card', async () => {
      const body = (await request(app).get('/api/dashboard/requester').set('Cookie', cookies.requester)).body;
      for (const { count, link } of body.metrics as { count: number; link: string }[]) {
        const list = await request(app).get(`/api/tickets?${link.split('?')[1]}`).set('Cookie', cookies.requester);
        expect(list.status, link).toBe(200);
        expect(list.body.totalItems, link).toBe(count);
      }
    });

    it('combines statusGroup=active with a status that is not active as no results', async () => {
      const list = await request(app).get('/api/staff/tickets?statusGroup=active&status=CLOSED').set('Cookie', cookies.staff);
      expect(list.body.totalCount).toBe(0);
    });
  });

  describe('Zero figures (API-26, AC-23, BR-25)', () => {
    it('gives a staff member who owns nothing zeros, with every status and priority row present', async () => {
      const body = (await get(cookies.idle)).body;
      expect(metric(body, 'myTickets').count).toBe(0);
      expect(metric(body, 'myOpenActions').count).toBe(0);
      expect(body.myOpenActions).toEqual([]);
      expect(body.byStatus).toHaveLength(8);
      expect(body.byItPriority).toHaveLength(3);
    });
  });
});
