import express from 'express';
import multer from 'multer';
import { prisma } from './prisma';
import { formatTicketNumber, validateTicketText } from './ticket-helpers';
import { parseTicketListQuery } from './ticket-list-helpers';
import { MAX_ATTACHMENT_BYTES, attachmentFilePath, deleteAttachmentFile, generateStoredFilename, saveAttachmentFile } from './attachment-storage';
import { validateAttachmentUpload } from './attachment-validation';

const app = express();
app.use(express.json());

// BR-15/BR-27: multer's own limit is a memory backstop only, set above the real 5 MB rule so an
// oversized-and-wrong-type file still reaches the handler and gets the documented check order -
// type before size - rather than a generic multer rejection before either runs.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_ATTACHMENT_BYTES * 2 } });

const ATTACHMENT_METADATA_SELECT = {
  id: true,
  ticketId: true,
  originalFilename: true,
  mimeType: true,
  sizeBytes: true,
  uploadedAt: true,
  isActive: true,
  removedAt: true,
  removalReason: true,
} as const;

function parseRequesterId(value: string | undefined): number | null {
  const requesterId = Number(value);
  if (!value || !Number.isInteger(requesterId) || requesterId < 1) return null;
  return requesterId;
}

app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        service: 'TokTickIT API',
    });
});

app.get('/api/categories', async (req, res) => {
    try {
        const categories = await prisma.category.findMany({
            where: { isActive: true },
            orderBy: { id: 'asc' },
            select: { id: true, name: true },
        });
        res.status(200).json(categories);
    } catch (error) {
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to retrieve categories' } });
    }
});

app.get('/api/requesters', async (req, res) => {
    try {
        const requesters = await prisma.requester.findMany({
            where: { isActive: true },
            orderBy: { id: 'asc' },
            select: { id: true, name: true },
        });
        res.status(200).json(requesters);
    } catch (error) {
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to retrieve requesters' } });
    }
});

app.get('/api/related-systems', async (req, res) => {
    try {
        const relatedSystems = await prisma.relatedSystem.findMany({
            where: { isActive: true },
            orderBy: { id: 'asc' },
            select: { id: true, name: true },
        });
        res.status(200).json(relatedSystems);
    } catch (error) {
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to retrieve related systems' } });
    }
});

const REQUESTED_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'];

app.post('/api/tickets', async (req, res) => {
  try {
    const { requesterId, categoryId, relatedSystemId, summary, description, requestedPriority } = req.body;

    if (typeof requesterId !== 'number') {
        return res.status(400).json({
            error: {
                code: 'VALIDATION_ERROR',
                message: 'requesterId is required',
                fields: [{ field: 'requesterId', message: 'requesterId is required' }],
            },
        });
    }

    const requester = await prisma.requester.findUnique({ where: { id: requesterId } });
    if (!requester || !requester.isActive) {
        return res.status(404).json({
            error: { code: 'REQUESTER_NOT_FOUND', message: 'Requester not found or inactive' },
        });
    }

    const fields: { field: string; message: string }[] = [];

    if (typeof categoryId !== 'number') {
        fields.push({ field: 'categoryId', message: 'categoryId is required' });
    } else {
        const category = await prisma.category.findUnique({ where: { id: categoryId } });
        if (!category || !category.isActive) {
            fields.push({ field: 'categoryId', message: 'categoryId must reference an active category' });
        }
    }

    if (typeof relatedSystemId !== 'number') {
        fields.push({ field: 'relatedSystemId', message: 'relatedSystemId is required' });
    } else {
        const relatedSystem = await prisma.relatedSystem.findUnique({ where: { id: relatedSystemId } });
        if (!relatedSystem || !relatedSystem.isActive) {
            fields.push({ field: 'relatedSystemId', message: 'relatedSystemId must reference an active related system' });
        }
    }

    const text = validateTicketText(summary, description);
    fields.push(...text.errors);

    if (!REQUESTED_PRIORITIES.includes(requestedPriority)) {
        fields.push({ field: 'requestedPriority', message: 'requestedPriority must be LOW, MEDIUM, or HIGH' });
    }

    if (fields.length > 0) {
        return res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: 'One or more fields are invalid', fields },
        });
    }

    const [{ nextval }] = await prisma.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('ticket_number_seq') AS nextval`;
    const ticketNumber = formatTicketNumber(new Date().getFullYear(), nextval);

    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber,
        requesterId,
        categoryId,
        relatedSystemId,
        summary: text.summary,
        description: text.description,
        requestedPriority,
      },
      select: {
        id: true,
        ticketNumber: true,
        ticketDate: true,
        requesterId: true,
        categoryId: true,
        relatedSystemId: true,
        summary: true,
        description: true,
        requestedPriority: true,
        currentStatus: true,
      },
    });

    res.status(201).json(ticket);
  } catch (error) {
    console.error('POST /api/tickets failed:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to create ticket' } });
  }
});

app.get('/api/tickets', async (req, res) => {
  try {
    // api-spec.md 1: every Requester-scoped endpoint identifies the caller by header.
    const requesterId = parseRequesterId(req.header('X-Requester-Id'));
    if (requesterId === null) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'X-Requester-Id header is required' },
      });
    }

    // BR-06/BR-20: an unknown or inactive Requester is unreachable, and its Tickets with it.
    const requester = await prisma.requester.findUnique({ where: { id: requesterId } });
    if (!requester || !requester.isActive) {
      return res.status(404).json({
        error: { code: 'REQUESTER_NOT_FOUND', message: 'Requester not found or inactive' },
      });
    }

    const query = parseTicketListQuery(req.query as Record<string, unknown>);

    // api-spec.md 4: a filter no Ticket can satisfy is zero results, not an error and not a
    // dropped filter. Short-circuiting avoids handing Prisma a value its enum cannot accept.
    if (query.matchesNothing) {
      return res.status(200).json({
        data: [],
        page: query.page,
        pageSize: query.pageSize,
        totalItems: 0,
        totalPages: 0,
      });
    }

    // BR-08: ownership is the first clause of the query itself, so no code path can return
    // another Requester's Tickets.
    const where = {
      requesterId,
      ...(query.categoryId !== undefined ? { categoryId: query.categoryId } : {}),
      ...(query.relatedSystemId !== undefined ? { relatedSystemId: query.relatedSystemId } : {}),
      ...(query.currentStatus !== undefined ? { currentStatus: query.currentStatus } : {}),
      ...(query.requestedPriority !== undefined
        ? { requestedPriority: query.requestedPriority }
        : {}),
      // BR-09: Summary and Ticket Number, case-insensitive, partial.
      ...(query.search !== undefined
        ? {
            OR: [
              { summary: { contains: query.search, mode: 'insensitive' as const } },
              { ticketNumber: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    // BR-10: ticketNumber desc is the tie-breaker after the chosen sort, so pages stay stable
    // and a row cannot appear on two pages. Skipped when it IS the chosen sort - Prisma rejects
    // the same field twice in one orderBy.
    const orderBy =
      query.sort === 'ticketNumber'
        ? [{ ticketNumber: query.order }]
        : [{ [query.sort]: query.order }, { ticketNumber: 'desc' as const }];

    const totalItems = await prisma.ticket.count({ where });

    const data = await prisma.ticket.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        ticketNumber: true,
        summary: true,
        ticketDate: true,
        updatedAt: true,
        requestedPriority: true,
        currentStatus: true,
        category: { select: { id: true, name: true } },
      },
    });

    res.status(200).json({
      data,
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize),
    });
  } catch (error) {
    console.error('GET /api/tickets failed:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to retrieve tickets' } });
  }
});

app.get('/api/tickets/:id', async (req, res) => {
  try {
    // api-spec.md 1: every Requester-scoped endpoint identifies the caller by header.
    const requesterId = parseRequesterId(req.header('X-Requester-Id'));
    if (requesterId === null) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'X-Requester-Id header is required' },
      });
    }

    const ticketId = Number(req.params.id);
    if (!Number.isInteger(ticketId) || ticketId < 1) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ticket not found' } });
    }

    const requester = await prisma.requester.findUnique({ where: { id: requesterId } });
    if (!requester || !requester.isActive) {
      return res.status(404).json({
        error: { code: 'REQUESTER_NOT_FOUND', message: 'Requester not found or inactive' },
      });
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        ticketNumber: true,
        ticketDate: true,
        updatedAt: true,
        requesterId: true,
        summary: true,
        description: true,
        requestedPriority: true,
        currentStatus: true,
        category: { select: { id: true, name: true } },
        relatedSystem: { select: { id: true, name: true } },
        attachments: {
          // PR #28 review: Prisma has no default row order, so without this the list looked
          // stable in testing and would shuffle after an update.
          orderBy: { uploadedAt: 'asc' },
          select: ATTACHMENT_METADATA_SELECT,
        },
      },
    });

    if (!ticket) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ticket not found' } });
    }

    // api-spec.md 3, BR-22: an unowned Ticket is 403, never disclosed as 404 - Part 6/8 need
    // evidence that ownership was actively checked, not just that the id looked wrong.
    if (ticket.requesterId !== requesterId) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'This Ticket does not belong to you' } });
    }

    const { requesterId: _ownerId, ...body } = ticket;
    res.status(200).json(body);
  } catch (error) {
    console.error('GET /api/tickets/:id failed:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to retrieve ticket' } });
  }
});

app.post('/api/tickets/:id/attachments', upload.single('file'), async (req, res) => {
  try {
    const requesterId = parseRequesterId(req.header('X-Requester-Id'));
    if (requesterId === null) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'X-Requester-Id header is required' },
      });
    }

    const ticketId = Number(req.params.id);
    if (!Number.isInteger(ticketId) || ticketId < 1) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ticket not found' } });
    }

    const requester = await prisma.requester.findUnique({ where: { id: requesterId } });
    if (!requester || !requester.isActive) {
      return res.status(404).json({
        error: { code: 'REQUESTER_NOT_FOUND', message: 'Requester not found or inactive' },
      });
    }

    // api-spec.md 5: existence and ownership are settled before the file is examined, so a
    // rejection never reveals whether another Requester's Ticket exists.
    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ticket not found' } });
    }
    if (ticket.requesterId !== requesterId) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'This Ticket does not belong to you' } });
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'file is required', fields: [{ field: 'file', message: 'file is required' }] },
      });
    }

    // BR-27: type, then size, then the per-Ticket count - a file failing more than one check
    // returns only the first, in this order. Type/size need no query, so they are checked with
    // activeAttachmentCount: 0 first; the count is only fetched once those two already pass.
    const intrinsicError = validateAttachmentUpload({
      mimeType: file.mimetype,
      sizeBytes: file.size,
      activeAttachmentCount: 0,
    });
    if (intrinsicError) {
      return res.status(intrinsicError.status).json({ error: { code: intrinsicError.code, message: intrinsicError.message } });
    }

    const activeAttachmentCount = await prisma.attachment.count({ where: { ticketId, isActive: true } });
    const countError = validateAttachmentUpload({
      mimeType: file.mimetype,
      sizeBytes: file.size,
      activeAttachmentCount,
    });
    if (countError) {
      return res.status(countError.status).json({ error: { code: countError.code, message: countError.message } });
    }

    const storedFilename = generateStoredFilename(file.mimetype);
    await saveAttachmentFile(storedFilename, file.buffer);

    try {
      const attachment = await prisma.$transaction(async (tx) => {
        const created = await tx.attachment.create({
          data: {
            ticketId,
            originalFilename: file.originalname,
            storedFilename,
            mimeType: file.mimetype,
            sizeBytes: file.size,
          },
          select: ATTACHMENT_METADATA_SELECT,
        });
        // BR-28: an upload counts as a change to the parent Ticket.
        await tx.ticket.update({ where: { id: ticketId }, data: { updatedAt: new Date() } });
        return created;
      });

      res.status(201).json(attachment);
    } catch (dbError) {
      // BR-26: the file and its row are created together or not at all - clean up the file the
      // database never got to record.
      await deleteAttachmentFile(storedFilename);
      throw dbError;
    }
  } catch (error) {
    console.error('POST /api/tickets/:id/attachments failed:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to upload attachment' } });
  }
});

app.get('/api/attachments/:id', async (req, res) => {
  try {
    const requesterId = parseRequesterId(req.header('X-Requester-Id'));
    if (requesterId === null) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'X-Requester-Id header is required' },
      });
    }

    const attachmentId = Number(req.params.id);
    if (!Number.isInteger(attachmentId) || attachmentId < 1) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Attachment not found' } });
    }

    const requester = await prisma.requester.findUnique({ where: { id: requesterId } });
    if (!requester || !requester.isActive) {
      return res.status(404).json({
        error: { code: 'REQUESTER_NOT_FOUND', message: 'Requester not found or inactive' },
      });
    }

    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
      select: { ...ATTACHMENT_METADATA_SELECT, ticket: { select: { requesterId: true } } },
    });
    if (!attachment) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Attachment not found' } });
    }
    // BR-16: removed attachments still return their metadata here - only download hides them.
    if (attachment.ticket.requesterId !== requesterId) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'This Attachment does not belong to you' } });
    }

    const { ticket: _ticket, ...body } = attachment;
    res.status(200).json(body);
  } catch (error) {
    console.error('GET /api/attachments/:id failed:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to retrieve attachment' } });
  }
});

app.get('/api/attachments/:id/download', async (req, res) => {
  try {
    // api-spec.md 1: download is the one endpoint that takes the Requester id as a query
    // parameter, since it is used directly in an <a href> link.
    const requesterId = parseRequesterId(
      typeof req.query.requesterId === 'string' ? req.query.requesterId : undefined,
    );
    if (requesterId === null) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'requesterId query parameter is required' },
      });
    }

    const attachmentId = Number(req.params.id);
    if (!Number.isInteger(attachmentId) || attachmentId < 1) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Attachment not found' } });
    }

    const requester = await prisma.requester.findUnique({ where: { id: requesterId } });
    if (!requester || !requester.isActive) {
      return res.status(404).json({
        error: { code: 'REQUESTER_NOT_FOUND', message: 'Requester not found or inactive' },
      });
    }

    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
      select: {
        storedFilename: true,
        originalFilename: true,
        mimeType: true,
        isActive: true,
        ticket: { select: { requesterId: true } },
      },
    });

    // BR-16: missing and soft-removed are deliberately identical here - a removed file must not
    // be told apart from one that never existed.
    if (!attachment || !attachment.isActive) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Attachment not found' } });
    }
    if (attachment.ticket.requesterId !== requesterId) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'This Attachment does not belong to you' } });
    }

    res.status(200).download(attachmentFilePath(attachment.storedFilename), attachment.originalFilename, {
      headers: { 'Content-Type': attachment.mimeType },
    });
  } catch (error) {
    console.error('GET /api/attachments/:id/download failed:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to download attachment' } });
  }
});

app.delete('/api/attachments/:id', async (req, res) => {
  try {
    const requesterId = parseRequesterId(req.header('X-Requester-Id'));
    if (requesterId === null) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'X-Requester-Id header is required' },
      });
    }

    const attachmentId = Number(req.params.id);
    if (!Number.isInteger(attachmentId) || attachmentId < 1) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Attachment not found' } });
    }

    const requester = await prisma.requester.findUnique({ where: { id: requesterId } });
    if (!requester || !requester.isActive) {
      return res.status(404).json({
        error: { code: 'REQUESTER_NOT_FOUND', message: 'Requester not found or inactive' },
      });
    }

    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
      select: { id: true, ticketId: true, isActive: true, ticket: { select: { requesterId: true } } },
    });

    // api-spec.md 5: missing or already-removed are both 404 here, ahead of the ownership check -
    // an inactive attachment behaves like a missing one for this endpoint regardless of owner.
    if (!attachment || !attachment.isActive) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Attachment not found' } });
    }
    if (attachment.ticket.requesterId !== requesterId) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'This Attachment does not belong to you' } });
    }

    // BR-17: a non-empty reason is required to soft-remove.
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!reason) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'reason is required',
          fields: [{ field: 'reason', message: 'reason is required' }],
        },
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const removed = await tx.attachment.update({
        where: { id: attachmentId },
        data: { isActive: false, removedAt: new Date(), removalReason: reason },
        select: ATTACHMENT_METADATA_SELECT,
      });
      // BR-28: soft removal counts as a change to the parent Ticket, same as upload.
      await tx.ticket.update({ where: { id: attachment.ticketId }, data: { updatedAt: new Date() } });
      return removed;
    });

    res.status(200).json(updated);
  } catch (error) {
    console.error('DELETE /api/attachments/:id failed:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to remove attachment' } });
  }
});

export default app;