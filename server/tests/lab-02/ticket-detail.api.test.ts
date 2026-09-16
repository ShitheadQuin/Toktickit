import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/prisma';
import { makeRequesterFixture, sessionCookieFor } from './auth-fixtures';

// Marker keeps this suite's fixture rows identifiable and safe to delete, without disturbing
// whatever else is in the database (same convention as my-tickets.api.test.ts).
const MARK = 'ZQ8D';
const TICKET_NUMBER = 'TKT-2099-900201';
const EMAIL_PREFIX = 'lab2-ticket-detail-test-';

describe('GET /api/tickets/:id', () => {
  let requesterACookie: string;
  let requesterBCookie: string;
  let categoryId: number;
  let relatedSystemId: number;
  let ticketId: number;

  const getAs = (cookie: string, id: number | string) => request(app).get(`/api/tickets/${id}`).set('Cookie', cookie);

  beforeAll(async () => {
    const requesterA = await makeRequesterFixture(`${EMAIL_PREFIX}a@toktickit.dev`);
    const requesterB = await makeRequesterFixture(`${EMAIL_PREFIX}b@toktickit.dev`);
    requesterACookie = await sessionCookieFor(requesterA.id);
    requesterBCookie = await sessionCookieFor(requesterB.id);

    const category = await prisma.category.findFirst({ where: { isActive: true } });
    const relatedSystem = await prisma.relatedSystem.findFirst({ where: { isActive: true } });
    categoryId = category!.id;
    relatedSystemId = relatedSystem!.id;

    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: TICKET_NUMBER,
        requesterId: requesterA.id,
        categoryId,
        relatedSystemId,
        summary: `${MARK} Laptop battery drains quickly`,
        description: 'Fixture Ticket created by the Ticket Detail API suite.',
        requestedPriority: 'MEDIUM',
        itPriority: 'MEDIUM',
      },
    });
    ticketId = ticket.id;
  });

  afterAll(async () => {
    await prisma.ticket.deleteMany({ where: { ticketNumber: TICKET_NUMBER } });
    await prisma.session.deleteMany({ where: { user: { email: { startsWith: EMAIL_PREFIX } } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });
  });

  // API-08 - AC-21: full detail, including attachments, for an owned Ticket
  it('returns the full Ticket detail, including attachments, for the owning Requester', async () => {
    const response = await getAs(requesterACookie, ticketId);

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

  // API-09 - AC-09, BR-12 (Lab 3 supersedes Lab 2's 403 - see PR for Issue #36): a Ticket that
  // exists but belongs to someone else is now indistinguishable from a nonexistent one.
  it('rejects another Requester’s Ticket with 404, indistinguishable from a nonexistent one (BR-12)', async () => {
    const response = await getAs(requesterBCookie, ticketId);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(response.body).not.toHaveProperty('summary');
    expect(response.body).not.toHaveProperty('data');
  });

  // API-10 - BR-22: a nonexistent id
  it('returns 404 for a nonexistent Ticket id', async () => {
    const response = await getAs(requesterACookie, 999999999);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('rejects the request with 401 when there is no session', async () => {
    const response = await request(app).get(`/api/tickets/${ticketId}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns 404 for a non-numeric Ticket id rather than throwing', async () => {
    const response = await getAs(requesterACookie, 'not-a-number');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});
