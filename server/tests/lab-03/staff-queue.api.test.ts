import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/prisma';
import { hashPassword } from '../../src/auth/password-hash';
import { createSession } from '../../src/auth/session';

// API-16, API-17, API-18 - GET /api/staff/tickets (api-spec.md 4).
// The Queue returns every Ticket in the database, including seeded ones and other suites'
// fixtures, so every assertion that counts or orders rows is scoped to this suite's own Tickets
// with ?search=MARK. Self-contained fixture users, never the seeded accounts.
const MARK = 'QX37';
const EMAIL_PREFIX = 'lab3-staff-queue-test-';
const DESCRIPTION_ONLY_WORD = 'QX37descriptiononly';

// Year 2099, 937xxx: out of the way of the real ticket_number_seq and the other suites' numbers.
const number = (n: number) => `TKT-2099-${String(937000 + n)}`;
const ALPHA_COUNT = 22;
const SPECIAL_ONE = number(101); // IN_PROGRESS, HIGH, owned by the calling IT Staff member
const SPECIAL_TWO = number(102); // WAITING_FOR_REQUESTER, MEDIUM, owned by the other IT Staff member
const ALL_NUMBERS = [...Array.from({ length: ALPHA_COUNT }, (_, i) => number(i + 1)), SPECIAL_ONE, SPECIAL_TWO];

type QueueRow = {
  id: number;
  ticketNumber: string;
  owner: { id: number; name: string } | null;
  currentStatus: string;
  itPriority: string;
};

describe('GET /api/staff/tickets', () => {
  let staffCookie: string;
  let callerId: number;
  let otherStaffId: number;

  const queue = (query = '') => request(app).get(`/api/staff/tickets${query}`).set('Cookie', staffCookie);
  const numbersOf = (body: { data: QueueRow[] }) => body.data.map((row) => row.ticketNumber);

  beforeAll(async () => {
    const passwordHash = await hashPassword('FixturePass1');
    const makeUser = (key: string, name: string, role: 'REQUESTER' | 'IT_STAFF') =>
      prisma.user.create({
        data: { name, email: `${EMAIL_PREFIX}${key}@toktickit.dev`, role, passwordHash, mustChangePassword: false },
      });

    const caller = await makeUser('caller', 'Queue Caller Staff', 'IT_STAFF');
    const otherStaff = await makeUser('other-staff', 'Queue Other Staff', 'IT_STAFF');
    const alpha = await makeUser('alpha', 'Queue Fixture Alpha', 'REQUESTER');
    const bravo = await makeUser('bravo', 'Queue Fixture Bravo', 'REQUESTER');

    callerId = caller.id;
    otherStaffId = otherStaff.id;
    staffCookie = `sid=${(await createSession(caller.id)).token}`;

    const category = await prisma.category.findFirst({ where: { isActive: true } });
    const relatedSystem = await prisma.relatedSystem.findFirst({ where: { isActive: true } });
    const base = { categoryId: category!.id, relatedSystemId: relatedSystem!.id, requestedPriority: 'LOW' as const };

    // 22 unassigned NEW/LOW Tickets, one minute apart - except the last two, which share a
    // createdAt so the id tie-breaker decides their order. Created one at a time, in order, so
    // ids ascend with the index.
    for (let i = 1; i <= ALPHA_COUNT; i++) {
      await prisma.ticket.create({
        data: {
          ...base,
          ticketNumber: number(i),
          requesterId: alpha.id,
          summary: `${MARK} Alpha ticket ${i}`,
          description: 'Fixture Ticket created by the Staff Queue API suite.',
          itPriority: 'LOW',
          createdAt: new Date(Date.UTC(2099, 0, 1, 0, Math.min(i, ALPHA_COUNT - 1))),
        },
      });
    }

    await prisma.ticket.create({
      data: {
        ...base,
        ticketNumber: SPECIAL_ONE,
        requesterId: alpha.id,
        summary: `${MARK} Printer jams on duplex`,
        description: `Only this description contains ${DESCRIPTION_ONLY_WORD}.`,
        currentStatus: 'IN_PROGRESS',
        itPriority: 'HIGH',
        ticketOwnerId: caller.id,
        createdAt: new Date(Date.UTC(2099, 0, 1, 1, 0)),
      },
    });

    await prisma.ticket.create({
      data: {
        ...base,
        ticketNumber: SPECIAL_TWO,
        requesterId: bravo.id,
        summary: `${MARK} VPN disconnects hourly`,
        description: 'Fixture Ticket created by the Staff Queue API suite.',
        currentStatus: 'WAITING_FOR_REQUESTER',
        itPriority: 'MEDIUM',
        ticketOwnerId: otherStaff.id,
        createdAt: new Date(Date.UTC(2099, 0, 1, 1, 1)),
      },
    });
  });

  afterAll(async () => {
    await prisma.ticket.deleteMany({ where: { ticketNumber: { in: ALL_NUMBERS } } });
    await prisma.session.deleteMany({ where: { user: { email: { startsWith: EMAIL_PREFIX } } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });
  });

  describe('API-16 - AC-10: search, filters, sort and pagination', () => {
    it('returns the first 20 matches with accurate pagination metadata, and the rest on page 2', async () => {
      const first = await queue(`?search=${MARK}`);
      expect(first.status).toBe(200);
      expect(first.body).toMatchObject({ page: 1, pageSize: 20, totalCount: 24, totalPages: 2 });
      expect(first.body.data).toHaveLength(20);

      const second = await queue(`?search=${MARK}&page=2`);
      expect(second.body).toMatchObject({ page: 2, pageSize: 20, totalCount: 24, totalPages: 2 });
      expect(second.body.data).toHaveLength(4);
    });

    it('orders by createdAt ascending by default, breaking a createdAt tie by id', async () => {
      const first = await queue(`?search=${MARK}`);
      expect(numbersOf(first.body)).toEqual(Array.from({ length: 20 }, (_, i) => number(i + 1)));

      // Alpha 21 and 22 share a createdAt; id ascending keeps 21 before 22 on every request.
      const second = await queue(`?search=${MARK}&page=2`);
      expect(numbersOf(second.body)).toEqual([number(21), number(22), SPECIAL_ONE, SPECIAL_TWO]);
    });

    it('searches ticket number partially and case-insensitively', async () => {
      const response = await queue(`?search=${number(7).toLowerCase()}`);
      expect(numbersOf(response.body)).toEqual([number(7)]);
    });

    it('searches description text', async () => {
      const response = await queue(`?search=${DESCRIPTION_ONLY_WORD}`);
      expect(numbersOf(response.body)).toEqual([SPECIAL_ONE]);
    });

    it('searches requester name and requester email', async () => {
      const byName = await queue('?search=queue%20fixture%20bravo');
      expect(numbersOf(byName.body)).toEqual([SPECIAL_TWO]);

      const byEmail = await queue(`?search=${EMAIL_PREFIX}bravo`);
      expect(numbersOf(byEmail.body)).toEqual([SPECIAL_TWO]);
    });

    it('filters by status and by IT Priority', async () => {
      const byStatus = await queue(`?search=${MARK}&status=IN_PROGRESS`);
      expect(numbersOf(byStatus.body)).toEqual([SPECIAL_ONE]);

      const byPriority = await queue(`?search=${MARK}&itPriority=MEDIUM`);
      expect(numbersOf(byPriority.body)).toEqual([SPECIAL_TWO]);
    });

    it('filters to unassigned Tickets, or to one owner by user id', async () => {
      const unassigned = await queue(`?search=${MARK}&owner=unassigned`);
      expect(unassigned.body.totalCount).toBe(ALPHA_COUNT);
      expect(unassigned.body.data.every((row: QueueRow) => row.owner === null)).toBe(true);

      const mine = await queue(`?search=${MARK}&owner=${callerId}`);
      expect(numbersOf(mine.body)).toEqual([SPECIAL_ONE]);

      const other = await queue(`?search=${MARK}&owner=${otherStaffId}`);
      expect(numbersOf(other.body)).toEqual([SPECIAL_TWO]);
    });

    it('sorts by IT Priority (HIGH first when descending) and by status in workflow order', async () => {
      const byPriority = await queue(`?search=${MARK}&sort=itPriority&order=desc`);
      expect(numbersOf(byPriority.body).slice(0, 2)).toEqual([SPECIAL_ONE, SPECIAL_TWO]);

      // Ascending status follows the enum's workflow order: NEW, then IN_PROGRESS, then
      // WAITING_FOR_REQUESTER - so the two special Tickets end the last page.
      const byStatus = await queue(`?search=${MARK}&sort=status&order=asc&page=2`);
      expect(numbersOf(byStatus.body).slice(-2)).toEqual([SPECIAL_ONE, SPECIAL_TWO]);
    });
  });

  describe('API-17 - api-spec.md 4: invalid parameters degrade instead of erroring', () => {
    it('falls back to the default sort, order and page for unrecognized values', async () => {
      const defaults = await queue(`?search=${MARK}`);
      const invalid = await queue(`?search=${MARK}&sort=summary&order=sideways&page=abc`);

      expect(invalid.status).toBe(200);
      expect(invalid.body).toMatchObject({ page: 1, pageSize: 20, totalCount: 24 });
      expect(numbersOf(invalid.body)).toEqual(numbersOf(defaults.body));

      const pageZero = await queue(`?search=${MARK}&page=0`);
      expect(pageZero.body.page).toBe(1);
    });

    it('returns zero results, not an error, for a status, IT Priority or owner no Ticket can have', async () => {
      for (const filter of ['status=DONE', 'itPriority=URGENT', 'owner=abc']) {
        const response = await queue(`?search=${MARK}&${filter}`);
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ data: [], totalCount: 0, totalPages: 0 });
      }
    });
  });

  describe('API-18 - specification.md 11: exactly the documented Queue fields', () => {
    it('returns only the pagination fields at the top level', async () => {
      const response = await queue(`?search=${MARK}`);
      expect(Object.keys(response.body).sort()).toEqual(['data', 'page', 'pageSize', 'totalCount', 'totalPages']);
    });

    it('returns each row with the 7 columns plus id, and nothing else', async () => {
      const response = await queue(`?search=${SPECIAL_ONE}`);
      const [row] = response.body.data;

      expect(Object.keys(row).sort()).toEqual([
        'createdAt',
        'currentStatus',
        'id',
        'itPriority',
        'owner',
        'requester',
        'summary',
        'ticketNumber',
      ]);
      // Requested Priority, description and requester email are deliberately left out.
      expect(Object.keys(row.requester).sort()).toEqual(['id', 'name']);
      expect(row.requester.name).toBe('Queue Fixture Alpha');
      expect(row.owner).toEqual({ id: callerId, name: 'Queue Caller Staff' });
      expect(row).toMatchObject({ currentStatus: 'IN_PROGRESS', itPriority: 'HIGH' });
    });

    it('returns owner as null for an unassigned Ticket', async () => {
      const response = await queue(`?search=${number(1)}`);
      expect(response.body.data[0].owner).toBeNull();
    });
  });
});
