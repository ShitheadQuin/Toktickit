import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/prisma';

// Marker keeps this suite's fixture rows identifiable and safe to delete, without disturbing
// whatever else is in the database (same convention as my-tickets.api.test.ts).
const MARK = 'ZQ8D';
const TICKET_NUMBER = 'TKT-2099-900201';

describe('GET /api/tickets/:id', () => {
  let requesterAId: number;
  let requesterBId: number;
  let categoryId: number;
  let relatedSystemId: number;
  let ticketId: number;

  const getAs = (requesterId: number | string, id: number | string) =>
    request(app).get(`/api/tickets/${id}`).set('X-Requester-Id', String(requesterId));

  beforeAll(async () => {
    const [requesterA, requesterB] = await prisma.requester.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
      take: 2,
    });
    const category = await prisma.category.findFirst({ where: { isActive: true } });
    const relatedSystem = await prisma.relatedSystem.findFirst({ where: { isActive: true } });

    requesterAId = requesterA.id;
    requesterBId = requesterB.id;
    categoryId = category!.id;
    relatedSystemId = relatedSystem!.id;

    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: TICKET_NUMBER,
        requesterId: requesterAId,
        categoryId,
        relatedSystemId,
        summary: `${MARK} Laptop battery drains quickly`,
        description: 'Fixture Ticket created by the Ticket Detail API suite.',
        requestedPriority: 'MEDIUM',
      },
    });
    ticketId = ticket.id;
  });

  afterAll(async () => {
    await prisma.ticket.deleteMany({ where: { ticketNumber: TICKET_NUMBER } });
  });

  // API-08 - AC-21: full detail, including attachments, for an owned Ticket
  it('returns the full Ticket detail, including attachments, for the owning Requester', async () => {
    const response = await getAs(requesterAId, ticketId);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: ticketId,
      ticketNumber: TICKET_NUMBER,
      summary: `${MARK} Laptop battery drains quickly`,
      description: 'Fixture Ticket created by the Ticket Detail API suite.',
      requestedPriority: 'MEDIUM',
      currentStatus: 'NEW',
      category: { id: categoryId, name: expect.any(String) },
      relatedSystem: { id: relatedSystemId, name: expect.any(String) },
    });
    expect(typeof response.body.ticketDate).toBe('string');
    expect(typeof response.body.updatedAt).toBe('string');
    expect(Array.isArray(response.body.attachments)).toBe(true);
    // BR-08: the owner's identity is never echoed back in the detail response.
    expect(response.body).not.toHaveProperty('requesterId');
  });

  // API-09 - AC-03, BR-22: a Ticket that exists but belongs to someone else
  it('rejects another Requester’s Ticket with 403 and no Ticket data (BR-22)', async () => {
    const response = await getAs(requesterBId, ticketId);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(response.body).not.toHaveProperty('summary');
    expect(response.body).not.toHaveProperty('data');
  });

  // API-10 - BR-22: a nonexistent id
  it('returns 404 for a nonexistent Ticket id', async () => {
    const response = await getAs(requesterAId, 999999999);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('rejects a missing or non-numeric X-Requester-Id with 400', async () => {
    const missing = await request(app).get(`/api/tickets/${ticketId}`);
    const malformed = await getAs('not-a-number', ticketId);

    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('VALIDATION_ERROR');
    expect(malformed.status).toBe(400);
  });

  it('rejects an unknown or inactive Requester with 404 REQUESTER_NOT_FOUND', async () => {
    const response = await getAs(999999, ticketId);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('REQUESTER_NOT_FOUND');
  });

  it('returns 404 for a non-numeric Ticket id rather than throwing', async () => {
    const response = await getAs(requesterAId, 'not-a-number');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});
