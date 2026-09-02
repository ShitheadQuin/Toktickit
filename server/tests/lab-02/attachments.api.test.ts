import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/prisma';
import { UPLOAD_DIR, attachmentFilePath, deleteAttachmentFile } from '../../src/attachment-storage';

// Marker keeps this suite's fixture rows identifiable and safe to delete, without disturbing
// whatever else is in the database (same convention as the other lab-02 API suites).
const MARK = 'ZQ9A';
const TICKET_NUMBER = 'TKT-2099-900301';
const OTHER_TICKET_NUMBER = 'TKT-2099-900302';

const validImage = () => Buffer.from('fixture png bytes');

// Postgres timestamp precision plus how fast these requests run back-to-back means two
// updatedAt writes can otherwise land in the same millisecond and look like no bump happened.
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Attachment lifecycle', () => {
  let requesterAId: number;
  let requesterBId: number;
  let ticketId: number;
  let otherOwnerTicketId: number;

  const uploadAs = (requesterId: number | string, id: number | string) =>
    request(app).post(`/api/tickets/${id}/attachments`).set('X-Requester-Id', String(requesterId));

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

    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: TICKET_NUMBER,
        requesterId: requesterAId,
        categoryId: category!.id,
        relatedSystemId: relatedSystem!.id,
        summary: `${MARK} Laptop battery drains quickly`,
        description: 'Fixture Ticket created by the Attachment lifecycle suite.',
        requestedPriority: 'MEDIUM',
      },
    });
    ticketId = ticket.id;

    const otherTicket = await prisma.ticket.create({
      data: {
        ticketNumber: OTHER_TICKET_NUMBER,
        requesterId: requesterBId,
        categoryId: category!.id,
        relatedSystemId: relatedSystem!.id,
        summary: `${MARK} Requester B's own ticket`,
        description: 'Fixture Ticket created by the Attachment lifecycle suite.',
        requestedPriority: 'MEDIUM',
      },
    });
    otherOwnerTicketId = otherTicket.id;
  });

  afterAll(async () => {
    const tickets = await prisma.ticket.findMany({
      where: { ticketNumber: { in: [TICKET_NUMBER, OTHER_TICKET_NUMBER] } },
      select: { id: true },
    });
    const ids = tickets.map((t) => t.id);
    const attachments = await prisma.attachment.findMany({ where: { ticketId: { in: ids } } });
    await prisma.attachment.deleteMany({ where: { ticketId: { in: ids } } });
    await prisma.ticket.deleteMany({ where: { id: { in: ids } } });
    await Promise.allSettled(attachments.map((a) => deleteAttachmentFile(a.storedFilename)));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // API-13 - AC-22: a valid attachment upload
  it('uploads a valid attachment and marks it active (AC-22)', async () => {
    const response = await uploadAs(requesterAId, ticketId)
      .attach('file', validImage(), { filename: 'screenshot.png', contentType: 'image/png' });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      ticketId,
      originalFilename: 'screenshot.png',
      mimeType: 'image/png',
      isActive: true,
      removedAt: null,
      removalReason: null,
    });
    expect(response.body).not.toHaveProperty('storedFilename');

    const stored = await prisma.attachment.findUnique({ where: { id: response.body.id } });
    expect(stored).not.toBeNull();
    expect(existsSync(attachmentFilePath(stored!.storedFilename))).toBe(true);
  });

  // API-11 - AC-13, BR-15: disallowed type and oversized file
  it('rejects a disallowed file type with 415, creating no attachment', async () => {
    const before = await prisma.attachment.count({ where: { ticketId } });

    const response = await uploadAs(requesterAId, ticketId)
      .attach('file', Buffer.from('not an allowed type'), { filename: 'archive.zip', contentType: 'application/zip' });

    expect(response.status).toBe(415);
    expect(response.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(await prisma.attachment.count({ where: { ticketId } })).toBe(before);
  });

  it('rejects a file over 5 MB with 413, creating no attachment', async () => {
    const before = await prisma.attachment.count({ where: { ticketId } });
    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1, 'a');

    const response = await uploadAs(requesterAId, ticketId)
      .attach('file', oversized, { filename: 'big.png', contentType: 'image/png' });

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(await prisma.attachment.count({ where: { ticketId } })).toBe(before);
  });

  // API-20 - AC-29, BR-27: a file that fails both checks gets exactly one response
  it('reports only 415 for a file that is both a disallowed type and oversized (BR-27)', async () => {
    const oversizedZip = Buffer.alloc(5 * 1024 * 1024 + 1, 'a');

    const response = await uploadAs(requesterAId, ticketId)
      .attach('file', oversizedZip, { filename: 'big.zip', contentType: 'application/zip' });

    expect(response.status).toBe(415);
    expect(response.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  // API-12 - AC-14, BR-15: a 6th attachment on a Ticket already at 5 active. Uses its own
  // Ticket so it doesn't consume the shared fixture Ticket's attachment quota.
  it('rejects a 6th active attachment on the same Ticket with 409 (BR-15)', async () => {
    const category = await prisma.category.findFirst({ where: { isActive: true } });
    const relatedSystem = await prisma.relatedSystem.findFirst({ where: { isActive: true } });
    const limitTicket = await prisma.ticket.create({
      data: {
        ticketNumber: 'TKT-2099-900303',
        requesterId: requesterAId,
        categoryId: category!.id,
        relatedSystemId: relatedSystem!.id,
        summary: `${MARK} Attachment limit fixture`,
        description: 'Fixture Ticket created by the Attachment lifecycle suite.',
        requestedPriority: 'MEDIUM',
      },
    });

    for (let i = 0; i < 5; i += 1) {
      const response = await uploadAs(requesterAId, limitTicket.id)
        .attach('file', validImage(), { filename: `limit-${i}.png`, contentType: 'image/png' });
      expect(response.status).toBe(201);
    }

    const sixth = await uploadAs(requesterAId, limitTicket.id)
      .attach('file', validImage(), { filename: 'limit-6.png', contentType: 'image/png' });

    expect(sixth.status).toBe(409);
    expect(sixth.body.error.code).toBe('ATTACHMENT_LIMIT_REACHED');
    expect(await prisma.attachment.count({ where: { ticketId: limitTicket.id, isActive: true } })).toBe(5);

    const created = await prisma.attachment.findMany({ where: { ticketId: limitTicket.id } });
    await Promise.all(created.map((a) => deleteAttachmentFile(a.storedFilename)));
    await prisma.attachment.deleteMany({ where: { ticketId: limitTicket.id } });
    await prisma.ticket.delete({ where: { id: limitTicket.id } });
  });

  // API-16 - BR-18: upload/remove on a Ticket owned by someone else
  it('rejects an upload to a Ticket owned by another Requester with 403 (BR-18)', async () => {
    const response = await uploadAs(requesterAId, otherOwnerTicketId)
      .attach('file', validImage(), { filename: 'not-mine.png', contentType: 'image/png' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('returns 404 when uploading to a nonexistent Ticket', async () => {
    const response = await uploadAs(requesterAId, 999999999)
      .attach('file', validImage(), { filename: 'nowhere.png', contentType: 'image/png' });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  // API-19 - AC-28, BR-26: the database write fails after the file has already been stored
  it('deletes the stored file and leaves no Attachment row when the database write fails (BR-26)', async () => {
    const before = await prisma.attachment.count({ where: { ticketId } });
    const filesBefore = existsSync(UPLOAD_DIR) ? await readdir(UPLOAD_DIR) : [];

    const failure = vi.spyOn(prisma, '$transaction').mockRejectedValueOnce(new Error('simulated database failure'));

    const response = await uploadAs(requesterAId, ticketId)
      .attach('file', validImage(), { filename: 'will-fail.png', contentType: 'image/png' });

    expect(response.status).toBe(500);
    expect(await prisma.attachment.count({ where: { ticketId } })).toBe(before);

    const filesAfter = existsSync(UPLOAD_DIR) ? await readdir(UPLOAD_DIR) : [];
    expect(filesAfter.length).toBe(filesBefore.length);

    failure.mockRestore();
  });

  describe('soft removal and download', () => {
    let attachmentId: number;

    beforeAll(async () => {
      const response = await uploadAs(requesterAId, ticketId)
        .attach('file', validImage(), { filename: 'removable.png', contentType: 'image/png' });
      attachmentId = response.body.id;
    });

    // API-16 - BR-18: remove on someone else's attachment
    it('rejects removal of an attachment on another Requester’s Ticket with 403 (BR-18)', async () => {
      const response = await request(app)
        .delete(`/api/attachments/${attachmentId}`)
        .set('X-Requester-Id', String(requesterBId))
        .send({ reason: 'Not mine to remove' });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects removal with a missing or blank reason (BR-17)', async () => {
      const missing = await request(app)
        .delete(`/api/attachments/${attachmentId}`)
        .set('X-Requester-Id', String(requesterAId))
        .send({});
      const blank = await request(app)
        .delete(`/api/attachments/${attachmentId}`)
        .set('X-Requester-Id', String(requesterAId))
        .send({ reason: '   ' });

      expect(missing.status).toBe(400);
      expect(missing.body.error.code).toBe('VALIDATION_ERROR');
      expect(blank.status).toBe(400);
    });

    // API-14 - AC-23, BR-16, BR-17: soft removal with a reason
    it('soft-removes an owned attachment with a reason (AC-23)', async () => {
      const ticketBefore = await prisma.ticket.findUnique({ where: { id: ticketId } });

      await wait(5);
      const response = await request(app)
        .delete(`/api/attachments/${attachmentId}`)
        .set('X-Requester-Id', String(requesterAId))
        .send({ reason: 'Wrong file attached by mistake' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: attachmentId,
        isActive: false,
        removalReason: 'Wrong file attached by mistake',
      });
      expect(response.body.removedAt).not.toBeNull();

      // BR-16: the row is never deleted, just deactivated.
      const row = await prisma.attachment.findUnique({ where: { id: attachmentId } });
      expect(row).not.toBeNull();
      expect(row!.isActive).toBe(false);

      // BR-28: soft removal bumps the parent Ticket's updatedAt.
      const ticketAfter = await prisma.ticket.findUnique({ where: { id: ticketId } });
      expect(ticketAfter!.updatedAt.getTime()).toBeGreaterThan(ticketBefore!.updatedAt.getTime());
      expect(ticketAfter!.ticketDate.getTime()).toBe(ticketBefore!.ticketDate.getTime());
    });

    it('returns 404 for an already-removed attachment, even to its owner', async () => {
      const response = await request(app)
        .delete(`/api/attachments/${attachmentId}`)
        .set('X-Requester-Id', String(requesterAId))
        .send({ reason: 'Trying again' });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    // API-15 - AC-24, BR-16: a removed attachment cannot be downloaded
    it('returns 404, not 403, when downloading a removed attachment - indistinguishable from missing', async () => {
      const asOwner = await request(app).get(`/api/attachments/${attachmentId}/download?requesterId=${requesterAId}`);
      const asOther = await request(app).get(`/api/attachments/${attachmentId}/download?requesterId=${requesterBId}`);

      expect(asOwner.status).toBe(404);
      expect(asOwner.body.error.code).toBe('NOT_FOUND');
      expect(asOther.status).toBe(404);
      expect(asOther.body.error.code).toBe('NOT_FOUND');
    });

    it('still returns removed attachment metadata, unlike download (BR-16)', async () => {
      const response = await request(app)
        .get(`/api/attachments/${attachmentId}`)
        .set('X-Requester-Id', String(requesterAId));

      expect(response.status).toBe(200);
      expect(response.body.isActive).toBe(false);
    });
  });

  describe('download of an active attachment', () => {
    let activeAttachmentId: number;

    beforeAll(async () => {
      const response = await uploadAs(requesterAId, ticketId)
        .attach('file', validImage(), { filename: 'downloadable.png', contentType: 'image/png' });
      activeAttachmentId = response.body.id;
    });

    it('returns 200 with the file body for the owning Requester', async () => {
      const response = await request(app).get(
        `/api/attachments/${activeAttachmentId}/download?requesterId=${requesterAId}`,
      );

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('image/png');
    });

    it('rejects a missing or non-numeric requesterId with 400', async () => {
      const missing = await request(app).get(`/api/attachments/${activeAttachmentId}/download`);
      const malformed = await request(app).get(
        `/api/attachments/${activeAttachmentId}/download?requesterId=not-a-number`,
      );

      expect(missing.status).toBe(400);
      expect(malformed.status).toBe(400);
    });

    // API-16 - BR-18
    it('rejects download by a Requester who does not own the Ticket with 403', async () => {
      const response = await request(app).get(
        `/api/attachments/${activeAttachmentId}/download?requesterId=${requesterBId}`,
      );

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  // API-21 - BR-28: upload then soft-remove, each bumping the parent Ticket's updatedAt
  it('bumps updatedAt on both upload and removal, leaving ticketDate untouched', async () => {
    const before = await prisma.ticket.findUnique({ where: { id: ticketId } });

    await wait(5);
    const uploadResponse = await uploadAs(requesterAId, ticketId)
      .attach('file', validImage(), { filename: 'timeline.png', contentType: 'image/png' });
    const afterUpload = await prisma.ticket.findUnique({ where: { id: ticketId } });

    expect(afterUpload!.updatedAt.getTime()).toBeGreaterThan(before!.updatedAt.getTime());

    await wait(5);
    await request(app)
      .delete(`/api/attachments/${uploadResponse.body.id}`)
      .set('X-Requester-Id', String(requesterAId))
      .send({ reason: 'Cleaning up the timeline fixture' });
    const afterRemoval = await prisma.ticket.findUnique({ where: { id: ticketId } });

    expect(afterRemoval!.updatedAt.getTime()).toBeGreaterThan(afterUpload!.updatedAt.getTime());
    expect(afterRemoval!.ticketDate.getTime()).toBe(before!.ticketDate.getTime());
  });
});
