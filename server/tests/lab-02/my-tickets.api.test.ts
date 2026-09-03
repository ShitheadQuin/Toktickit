import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/prisma';

// Every fixture Ticket carries this marker in its Summary, so each assertion can be scoped to
// this run's own data with ?search=. The suite then gives the same answer whatever else is in
// the database, and the afterAll below removes everything it created - important because the
// Part 7 empty-state and pagination screenshots depend on the real ticket counts staying stable.
const MARK = 'ZQ7X';

// Year 2099 keeps these Ticket Numbers out of the way of the real ticket_number_seq values.
const A_NUMBERS = [
  'TKT-2099-900001',
  'TKT-2099-900002',
  'TKT-2099-900003',
  'TKT-2099-900004',
  'TKT-2099-900005',
  'TKT-2099-900006',
  'TKT-2099-900007',
];
const B_NUMBERS = ['TKT-2099-900101', 'TKT-2099-900102'];

describe('GET /api/tickets', () => {
  let requesterAId: number;
  let requesterBId: number;
  let inactiveRequesterId: number;
  let categoryOneId: number;
  let categoryTwoId: number;
  let relatedSystemId: number;
  let emptyRequesterId: number;

  const listAs = (requesterId: number | string, query = '') =>
    request(app).get(`/api/tickets${query}`).set('X-Requester-Id', String(requesterId));

  beforeAll(async () => {
    const [requesterA, requesterB] = await prisma.requester.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
      take: 2,
    });
    const inactive = await prisma.requester.findFirst({ where: { isActive: false } });
    const [categoryOne, categoryTwo] = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
      take: 2,
    });
    const relatedSystem = await prisma.relatedSystem.findFirst({ where: { isActive: true } });

    requesterAId = requesterA.id;
    requesterBId = requesterB.id;
    inactiveRequesterId = inactive!.id;
    categoryOneId = categoryOne.id;
    categoryTwoId = categoryTwo.id;
    relatedSystemId = relatedSystem!.id;

    // A Requester that owns nothing, for the AC-16 empty state. Created and removed by this
    // suite so no seeded Requester has to be kept artificially clean.
    const emptyRequester = await prisma.requester.create({
      data: { name: `${MARK} Empty Fixture`, email: `${MARK.toLowerCase()}-empty@toktickit.dev`, isActive: true },
    });
    emptyRequesterId = emptyRequester.id;

    const fixtures = [
      { ticketNumber: A_NUMBERS[0], summary: `${MARK} Laptop battery drains quickly`, categoryId: categoryOneId, requestedPriority: 'LOW' as const, day: 1 },
      { ticketNumber: A_NUMBERS[1], summary: `${MARK} Wi-Fi drops in the library`, categoryId: categoryTwoId, requestedPriority: 'MEDIUM' as const, day: 2 },
      { ticketNumber: A_NUMBERS[2], summary: `${MARK} Printer jams on duplex`, categoryId: categoryOneId, requestedPriority: 'HIGH' as const, day: 3 },
      { ticketNumber: A_NUMBERS[3], summary: `${MARK} Cannot reset my password`, categoryId: categoryTwoId, requestedPriority: 'LOW' as const, day: 4 },
      { ticketNumber: A_NUMBERS[4], summary: `${MARK} VPN disconnects hourly`, categoryId: categoryOneId, requestedPriority: 'MEDIUM' as const, day: 5 },
      { ticketNumber: A_NUMBERS[5], summary: `${MARK} Portal shows a blank page`, categoryId: categoryTwoId, requestedPriority: 'HIGH' as const, day: 6 },
      { ticketNumber: A_NUMBERS[6], summary: `${MARK} Email sync stopped overnight`, categoryId: categoryOneId, requestedPriority: 'LOW' as const, day: 7 },
    ];

    for (const fixture of fixtures) {
      await prisma.ticket.create({
        data: {
          ticketNumber: fixture.ticketNumber,
          ticketDate: new Date(Date.UTC(2099, 0, fixture.day)),
          requesterId: requesterAId,
          categoryId: fixture.categoryId,
          relatedSystemId,
          summary: fixture.summary,
          description: 'Fixture Ticket created by the My Tickets API suite.',
          requestedPriority: fixture.requestedPriority,
        },
      });
    }

    for (const [index, ticketNumber] of B_NUMBERS.entries()) {
      await prisma.ticket.create({
        data: {
          ticketNumber,
          ticketDate: new Date(Date.UTC(2099, 0, 10 + index)),
          requesterId: requesterBId,
          categoryId: categoryOneId,
          relatedSystemId,
          summary: `${MARK} Requester B only ticket ${index + 1}`,
          description: 'Fixture Ticket created by the My Tickets API suite.',
          requestedPriority: 'MEDIUM',
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.ticket.deleteMany({ where: { ticketNumber: { in: [...A_NUMBERS, ...B_NUMBERS] } } });
    await prisma.requester.deleteMany({ where: { id: emptyRequesterId } });
  });

  // API-04 - AC-15, BR-08: ownership scoping
  it('returns only the calling Requester’s own Tickets', async () => {
    const asA = await listAs(requesterAId, `?search=${MARK}`);
    const asB = await listAs(requesterBId, `?search=${MARK}`);

    expect(asA.status).toBe(200);
    expect(asB.status).toBe(200);

    const aNumbers = asA.body.data.map((t: { ticketNumber: string }) => t.ticketNumber);
    const bNumbers = asB.body.data.map((t: { ticketNumber: string }) => t.ticketNumber);

    expect(aNumbers.sort()).toEqual([...A_NUMBERS].sort());
    expect(bNumbers.sort()).toEqual([...B_NUMBERS].sort());
    expect(aNumbers.some((n: string) => B_NUMBERS.includes(n))).toBe(false);
    expect(bNumbers.some((n: string) => A_NUMBERS.includes(n))).toBe(false);
  });

  it('rejects a missing or non-numeric X-Requester-Id with 400 (BR-08)', async () => {
    const missing = await request(app).get('/api/tickets');
    const malformed = await listAs('not-a-number');

    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('VALIDATION_ERROR');
    expect(malformed.status).toBe(400);
    expect(malformed.body).not.toHaveProperty('data');
  });

  it('rejects an unknown or inactive Requester with 404 REQUESTER_NOT_FOUND (BR-06, BR-20)', async () => {
    const unknown = await listAs(999999);
    const inactive = await listAs(inactiveRequesterId);

    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('REQUESTER_NOT_FOUND');
    expect(inactive.status).toBe(404);
    expect(inactive.body.error.code).toBe('REQUESTER_NOT_FOUND');
  });

  it('returns the documented list-item shape, with Category as a named object', async () => {
    const response = await listAs(requesterAId, `?search=${MARK} Printer`);
    const [ticket] = response.body.data;

    expect(ticket).toMatchObject({
      ticketNumber: 'TKT-2099-900003',
      summary: `${MARK} Printer jams on duplex`,
      requestedPriority: 'HIGH',
      currentStatus: 'NEW',
      category: { id: categoryOneId, name: expect.any(String) },
    });
    expect(typeof ticket.ticketDate).toBe('string');
    expect(typeof ticket.updatedAt).toBe('string');
    // api-spec.md 4: the list item is narrower than Ticket Detail on purpose.
    expect(ticket).not.toHaveProperty('description');
  });

  // API-05 - AC-18, AC-19, AC-20: search, filter, sort, pagination
  it('searches Summary and Ticket Number, case-insensitively and partially (BR-09)', async () => {
    const bySummary = await listAs(requesterAId, `?search=${MARK} Printer`);
    const byLowercase = await listAs(requesterAId, `?search=${MARK.toLowerCase()} printer`);
    const byTicketNumber = await listAs(requesterAId, '?search=2099-900003');

    expect(bySummary.body.totalItems).toBe(1);
    expect(bySummary.body.data[0].ticketNumber).toBe('TKT-2099-900003');
    expect(byLowercase.body.totalItems).toBe(1);
    expect(byLowercase.body.data[0].ticketNumber).toBe('TKT-2099-900003');
    expect(byTicketNumber.body.totalItems).toBe(1);
    expect(byTicketNumber.body.data[0].ticketNumber).toBe('TKT-2099-900003');
  });

  it('filters by Category, and combines the filter with the search term', async () => {
    const response = await listAs(requesterAId, `?search=${MARK}&category=${categoryOneId}`);

    expect(response.body.totalItems).toBe(4);
    expect(response.body.data.every((t: { category: { id: number } }) => t.category.id === categoryOneId)).toBe(true);
  });

  it('filters by Requested Priority', async () => {
    const response = await listAs(requesterAId, `?search=${MARK}&requestedPriority=HIGH`);

    expect(response.body.totalItems).toBe(2);
    expect(response.body.data.map((t: { ticketNumber: string }) => t.ticketNumber).sort()).toEqual([
      'TKT-2099-900003',
      'TKT-2099-900006',
    ]);
  });

  it('defaults to Ticket Date descending and sorts ascending on request (BR-10)', async () => {
    const byDefault = await listAs(requesterAId, `?search=${MARK}`);
    const ascending = await listAs(requesterAId, `?search=${MARK}&sort=ticketDate&order=asc`);

    expect(byDefault.body.data[0].ticketNumber).toBe('TKT-2099-900007');
    expect(byDefault.body.data.at(-1).ticketNumber).toBe('TKT-2099-900001');
    expect(ascending.body.data[0].ticketNumber).toBe('TKT-2099-900001');
    expect(ascending.body.data.at(-1).ticketNumber).toBe('TKT-2099-900007');
  });

  it('sorts by Ticket Number and by Requested Priority', async () => {
    const byNumber = await listAs(requesterAId, `?search=${MARK}&sort=ticketNumber&order=asc`);
    const byPriority = await listAs(requesterAId, `?search=${MARK}&sort=requestedPriority&order=desc`);

    expect(byNumber.body.data[0].ticketNumber).toBe('TKT-2099-900001');
    // The enum is declared LOW, MEDIUM, HIGH, so descending puts HIGH first.
    expect(byPriority.body.data[0].requestedPriority).toBe('HIGH');
    expect(byPriority.body.data.at(-1).requestedPriority).toBe('LOW');
  });

  it('paginates with stable, non-overlapping pages', async () => {
    const pageOne = await listAs(requesterAId, `?search=${MARK}&pageSize=5&page=1`);
    const pageTwo = await listAs(requesterAId, `?search=${MARK}&pageSize=5&page=2`);

    expect(pageOne.body).toMatchObject({ page: 1, pageSize: 5, totalItems: 7, totalPages: 2 });
    expect(pageOne.body.data).toHaveLength(5);
    expect(pageTwo.body).toMatchObject({ page: 2, pageSize: 5, totalItems: 7, totalPages: 2 });
    expect(pageTwo.body.data).toHaveLength(2);

    const pageOneNumbers = pageOne.body.data.map((t: { ticketNumber: string }) => t.ticketNumber);
    const pageTwoNumbers = pageTwo.body.data.map((t: { ticketNumber: string }) => t.ticketNumber);
    expect(pageOneNumbers.some((n: string) => pageTwoNumbers.includes(n))).toBe(false);
  });

  it('returns an empty page rather than an error past the last page', async () => {
    const response = await listAs(requesterAId, `?search=${MARK}&pageSize=5&page=9`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.totalItems).toBe(7);
  });

  // API-06 - BR-10, api-spec.md 4: invalid parameters degrade, they do not error
  it('replaces an invalid sort, order, page and pageSize with their defaults', async () => {
    const response = await listAs(
      requesterAId,
      `?search=${MARK}&sort=summary&order=sideways&page=abc&pageSize=999`,
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ page: 1, pageSize: 10, totalItems: 7 });
    // Fell back to the BR-10 default of Ticket Date descending.
    expect(response.body.data[0].ticketNumber).toBe('TKT-2099-900007');
  });

  it('treats a malformed filter as matching nothing, never as absent', async () => {
    const badStatus = await listAs(requesterAId, `?search=${MARK}&currentStatus=CLOSED`);
    const badCategory = await listAs(requesterAId, `?search=${MARK}&category=abc`);

    expect(badStatus.status).toBe(200);
    expect(badStatus.body.totalItems).toBe(0);
    expect(badCategory.status).toBe(200);
    expect(badCategory.body.totalItems).toBe(0);
  });

  // API-07 - AC-16, AC-17: empty and no-results are both 200 with an empty page
  it('returns an empty page for a Requester who owns no Tickets (AC-16)', async () => {
    const response = await listAs(emptyRequesterId);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.totalItems).toBe(0);
    expect(response.body.totalPages).toBe(0);
  });

  it('returns an empty page for a search that matches nothing (AC-17)', async () => {
    const response = await listAs(requesterAId, '?search=zzzz-no-such-ticket-anywhere');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.totalItems).toBe(0);
  });

  // BR-28 - Last Updated is sortable and reflects the most recently touched Ticket
  it('sorts by updatedAt, putting the most recently changed Ticket first', async () => {
    await prisma.ticket.update({
      where: { ticketNumber: 'TKT-2099-900002' },
      data: { requestedPriority: 'MEDIUM' },
    });

    const response = await listAs(requesterAId, `?search=${MARK}&sort=updatedAt&order=desc`);

    expect(response.body.data[0].ticketNumber).toBe('TKT-2099-900002');
  });
});
