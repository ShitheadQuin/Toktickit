import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/prisma';

// Every Ticket this suite creates uses this Summary, so afterAll can remove exactly the rows
// it made. Without cleanup each run leaves more rows behind, which is how the database reached
// 32 identical Tickets and made the Part 7 search, filter and sort screenshots meaningless.
const FIXTURE_SUMMARY = 'Laptop battery drains quickly';

describe('POST /api/tickets', () => {
  let suiteStartedAt: Date;
  let activeRequesterId: number;
  let inactiveRequesterId: number;
  let activeCategoryId: number;
  let activeRelatedSystemId: number;

  const validBody = () => ({
    requesterId: activeRequesterId,
    categoryId: activeCategoryId,
    relatedSystemId: activeRelatedSystemId,
    summary: FIXTURE_SUMMARY,
    description: 'Battery drops from 100% to 20% within two hours of normal use.',
    requestedPriority: 'MEDIUM',
  });

  beforeAll(async () => {
    suiteStartedAt = new Date();

    const activeRequester = await prisma.requester.findFirst({ where: { isActive: true } });
    const inactiveRequester = await prisma.requester.findFirst({ where: { isActive: false } });
    const category = await prisma.category.findFirst({ where: { isActive: true } });
    const relatedSystem = await prisma.relatedSystem.findFirst({ where: { isActive: true } });

    activeRequesterId = activeRequester!.id;
    inactiveRequesterId = inactiveRequester!.id;
    activeCategoryId = category!.id;
    activeRelatedSystemId = relatedSystem!.id;
  });

  afterAll(async () => {
    // Scoped by Summary as well as time: test files run in parallel, and a time-only filter
    // could delete another suite's fixtures out from under it mid-run.
    await prisma.ticket.deleteMany({
      where: { summary: FIXTURE_SUMMARY, createdAt: { gte: suiteStartedAt } },
    });
  });

  it('creates a Ticket owned by the given Requester, starting with status New', async () => {
    const response = await request(app).post('/api/tickets').send(validBody());

    expect(response.status).toBe(201);
    expect(response.body.requesterId).toBe(activeRequesterId);
    expect(response.body.currentStatus).toBe('NEW');
    expect(response.body.ticketNumber).toMatch(/^TKT-\d{4}-\d{6}$/);
  });

  it('generates a unique Ticket Number for each Ticket', async () => {
    const first = await request(app).post('/api/tickets').send(validBody());
    const second = await request(app).post('/api/tickets').send(validBody());

    expect(first.body.ticketNumber).not.toBe(second.body.ticketNumber);
  });

  it('rejects a missing summary with a field-level message and no Ticket created', async () => {
    const response = await request(app)
      .post('/api/tickets')
      .send({ ...validBody(), summary: '' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.fields).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'summary' })]),
    );
  });

  it('reports every failing field at once, not just the first', async () => {
    const response = await request(app)
      .post('/api/tickets')
      .send({ ...validBody(), summary: '', description: 'x', requestedPriority: 'URGENT' });

    expect(response.status).toBe(400);
    const failingFields = response.body.error.fields.map((f: { field: string }) => f.field);
    expect(failingFields).toEqual(
      expect.arrayContaining(['summary', 'description', 'requestedPriority']),
    );
  });

  it('rejects an unknown requesterId with 404 REQUESTER_NOT_FOUND', async () => {
    const response = await request(app)
      .post('/api/tickets')
      .send({ ...validBody(), requesterId: 999999 });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('REQUESTER_NOT_FOUND');
  });

  it('rejects an inactive Requester with 404 REQUESTER_NOT_FOUND', async () => {
    const response = await request(app)
      .post('/api/tickets')
      .send({ ...validBody(), requesterId: inactiveRequesterId });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('REQUESTER_NOT_FOUND');
  });

  it('never accepts a client-supplied ticketNumber, ticketDate or currentStatus', async () => {
    const response = await request(app)
      .post('/api/tickets')
      .send({
        ...validBody(),
        ticketNumber: 'TKT-0000-000000',
        ticketDate: '2000-01-01T00:00:00Z',
        currentStatus: 'CLOSED',
      });

    expect(response.status).toBe(201);
    // BR-01/FR-05: the Ticket Number comes from the database sequence, never the request body.
    expect(response.body.ticketNumber).not.toBe('TKT-0000-000000');
    // BR-04: Ticket Date is server-generated at creation. Asserting the year is not 2000 proves
    // the supplied value was discarded, without depending on clock agreement between processes.
    expect(new Date(response.body.ticketDate).getUTCFullYear()).not.toBe(2000);
    // BR-02: a new Ticket always begins at New, whatever status the client asks for.
    expect(response.body.currentStatus).toBe('NEW');
  });
});

describe('GET /api/related-systems', () => {
  it('returns only the active seeded Related Systems', async () => {
    const response = await request(app).get('/api/related-systems');

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(6);
    response.body.forEach((relatedSystem: { id: number; name: string }) => {
      expect(typeof relatedSystem.id).toBe('number');
      expect(typeof relatedSystem.name).toBe('string');
    });
  });
});
