import express from 'express';
import multer from 'multer';
import cookieParser from 'cookie-parser';
import { prisma } from './prisma';
import { formatTicketNumber, validateTicketText } from './ticket-helpers';
import { parseTicketListQuery } from './ticket-list-helpers';
import { parseStaffQueueQuery } from './staff-queue-helpers';
import { ATTACHMENT_METADATA_SELECT, MAX_ATTACHMENT_BYTES, attachmentFilePath, deleteAttachmentFile, generateStoredFilename, saveAttachmentFile } from './attachment-storage';
import { validateAttachmentUpload } from './attachment-validation';
import { requireAuth, requirePasswordChanged, requireRole } from './middleware';
import authRouter from './routes/auth';
import staffTicketsRouter from './routes/staff-tickets';
import ticketConversationRouter from './routes/ticket-conversation';
import usersRouter from './routes/users';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRouter);
app.use('/api/staff', staffTicketsRouter);
app.use('/api/tickets', ticketConversationRouter);
app.use('/api/users', usersRouter);

// BR-15/BR-27: multer's own limit is a memory backstop only, set above the real 5 MB rule so an
// oversized-and-wrong-type file still reaches the handler and gets the documented check order -
// type before size - rather than a generic multer rejection before either runs.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_ATTACHMENT_BYTES * 2 } });

// api-spec.md 3: Requester-scoped, restricted to role REQUESTER - IT Staff/Administrator get
// their own Ticket Detail in #38 instead (403 here, per the authorization matrix in §7).
const requireRequester = [requireAuth, requirePasswordChanged, requireRole('REQUESTER')];

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

app.post('/api/tickets', ...requireRequester, async (req, res) => {
  try {
    // BR-03/api-spec.md 3: ownership comes from the session, never the request body - any
    // requesterId the client sends is ignored.
    const requesterId = req.user!.id;
    const { categoryId, relatedSystemId, summary, description, requestedPriority } = req.body;

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

    // noUncheckedIndexedAccess: indexing the raw result gives `| undefined`, so the sequence read
    // is checked rather than assumed. A missing row here means the sequence is gone, which should
    // fail loudly instead of producing a Ticket Number built from `undefined`.
    const sequenceRows = await prisma.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('ticket_number_seq') AS nextval`;
    const nextval = sequenceRows[0]?.nextval;
    if (nextval === undefined) throw new Error('ticket_number_seq returned no value');
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
        // labsheet §4.5: IT Priority starts as a copy of Requested Priority
        itPriority: requestedPriority,
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

app.get('/api/tickets', ...requireRequester, async (req, res) => {
  try {
    const requesterId = req.user!.id;
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

app.get('/api/tickets/:id', ...requireRequester, async (req, res) => {
  try {
    const requesterId = req.user!.id;

    const ticketId = Number(req.params.id);
    if (!Number.isInteger(ticketId) || ticketId < 1) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ticket not found' } });
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
        requesterConfirmedAt: true,
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

    // BR-12 (Lab 3, supersedes Lab 2's 403): missing and belongs-to-someone-else are now
    // identical - a Requester cannot tell a nonexistent Ticket from one they don't own.
    if (!ticket || ticket.requesterId !== requesterId) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ticket not found' } });
    }

    const { requesterId: _ownerId, ...body } = ticket;
    res.status(200).json(body);
  } catch (error) {
    console.error('GET /api/tickets/:id failed:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to retrieve ticket' } });
  }
});

// api-spec.md 3, BR-05: the Requester records that the problem appears resolved. Never changes
// status - only IT Staff formally resolve.
app.post('/api/tickets/:id/resolution-signal', ...requireRequester, async (req, res) => {
  try {
    const requesterId = req.user!.id;
    const ticketId = Number(req.params.id);
    if (!Number.isInteger(ticketId) || ticketId < 1) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ticket not found' } });
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { requesterId: true, currentStatus: true, requesterConfirmedAt: true },
    });
    // BR-12: someone else's Ticket is the same 404 as a missing one.
    if (!ticket || ticket.requesterId !== requesterId) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ticket not found' } });
    }
    if (ticket.currentStatus === 'CLOSED' || ticket.currentStatus === 'CANCELLED') {
      return res.status(409).json({ error: { code: 'TICKET_CLOSED', message: 'This Ticket is already closed' } });
    }

    const select = { id: true, ticketNumber: true, currentStatus: true, requesterConfirmedAt: true, updatedAt: true } as const;
    // specification.md 11: a repeat keeps the first time - the signal records when the Requester
    // first saw the problem as fixed.
    const updated = ticket.requesterConfirmedAt
      ? await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId }, select })
      : await prisma.ticket.update({ where: { id: ticketId }, data: { requesterConfirmedAt: new Date() }, select });

    res.status(200).json(updated);
  } catch (error) {
    console.error('POST /api/tickets/:id/resolution-signal failed:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to record resolution signal' } });
  }
});

app.post('/api/tickets/:id/attachments', ...requireRequester, upload.single('file'), async (req, res) => {
  try {
    const requesterId = req.user!.id;

    const ticketId = Number(req.params.id);
    if (!Number.isInteger(ticketId) || ticketId < 1) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ticket not found' } });
    }

    // api-spec.md 5/BR-12: existence and ownership are settled before the file is examined, and
    // both a missing and an unowned Ticket return the same 404.
    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket || ticket.requesterId !== requesterId) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ticket not found' } });
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

app.get('/api/attachments/:id', ...requireRequester, async (req, res) => {
  try {
    const requesterId = req.user!.id;

    const attachmentId = Number(req.params.id);
    if (!Number.isInteger(attachmentId) || attachmentId < 1) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Attachment not found' } });
    }

    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
      select: { ...ATTACHMENT_METADATA_SELECT, ticket: { select: { requesterId: true } } },
    });

    // BR-12/BR-16: missing and belongs-to-someone-else are identical (404); removed attachments
    // still return their metadata here - only download hides them.
    if (!attachment || attachment.ticket.requesterId !== requesterId) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Attachment not found' } });
    }

    const { ticket: _ticket, ...body } = attachment;
    res.status(200).json(body);
  } catch (error) {
    console.error('GET /api/attachments/:id failed:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to retrieve attachment' } });
  }
});

app.get('/api/attachments/:id/download', ...requireRequester, async (req, res) => {
  try {
    // api-spec.md 3: the sid cookie travels automatically on a plain <a href> navigation, so the
    // Lab 2 requesterId query-parameter workaround is gone.
    const requesterId = req.user!.id;

    const attachmentId = Number(req.params.id);
    if (!Number.isInteger(attachmentId) || attachmentId < 1) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Attachment not found' } });
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
    // be told apart from one that never existed. BR-12 folds "belongs to someone else" into the
    // same 404.
    if (!attachment || !attachment.isActive || attachment.ticket.requesterId !== requesterId) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Attachment not found' } });
    }

    res.status(200).download(attachmentFilePath(attachment.storedFilename), attachment.originalFilename, {
      headers: { 'Content-Type': attachment.mimeType },
    });
  } catch (error) {
    console.error('GET /api/attachments/:id/download failed:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to download attachment' } });
  }
});

app.delete('/api/attachments/:id', ...requireRequester, async (req, res) => {
  try {
    const requesterId = req.user!.id;

    const attachmentId = Number(req.params.id);
    if (!Number.isInteger(attachmentId) || attachmentId < 1) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Attachment not found' } });
    }

    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
      select: { id: true, ticketId: true, isActive: true, ticket: { select: { requesterId: true } } },
    });

    // api-spec.md 5/BR-12: missing, already-removed, and belongs-to-someone-else are all the same
    // 404, ahead of the reason check.
    if (!attachment || !attachment.isActive || attachment.ticket.requesterId !== requesterId) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Attachment not found' } });
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

// api-spec.md 4/7: every /api/staff/tickets* endpoint is IT Staff only. Requester and
// Administrator both get 403 - specification.md 11: Administrator performs no ticket operations.
const requireItStaff = [requireAuth, requirePasswordChanged, requireRole('IT_STAFF')];

app.get('/api/staff/tickets', ...requireItStaff, async (req, res) => {
  try {
    const query = parseStaffQueueQuery(req.query as Record<string, unknown>);

    // api-spec.md 4: a filter no Ticket can satisfy is zero results, not an error. Short-circuiting
    // avoids handing Prisma a value its enum cannot accept.
    if (query.matchesNothing) {
      return res.status(200).json({ data: [], page: query.page, pageSize: query.pageSize, totalCount: 0, totalPages: 0 });
    }

    const contains = (text: string) => ({ contains: text, mode: 'insensitive' as const });

    const where = {
      ...(query.status !== undefined ? { currentStatus: query.status } : {}),
      ...(query.itPriority !== undefined ? { itPriority: query.itPriority } : {}),
      ...(query.owner === 'unassigned'
        ? { ticketOwnerId: null }
        : query.owner !== undefined
          ? { ticketOwnerId: query.owner }
          : {}),
      // specification.md 11: ticket number, summary/description text, requester name/email -
      // partial and case-insensitive. A requester is found here rather than by a separate filter.
      ...(query.search !== undefined
        ? {
            OR: [
              { ticketNumber: contains(query.search) },
              { summary: contains(query.search) },
              { description: contains(query.search) },
              { requester: { name: contains(query.search) } },
              { requester: { email: contains(query.search) } },
            ],
          }
        : {}),
    };

    // api-spec.md 4: the chosen sort (enum columns sort in their declared order), then Ticket id
    // ascending as the tie-breaker so a Ticket can never appear on two pages.
    const sortField = query.sort === 'status' ? 'currentStatus' : query.sort;
    const orderBy = [{ [sortField]: query.order }, { id: 'asc' as const }];

    const totalCount = await prisma.ticket.count({ where });

    const rows = await prisma.ticket.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      // specification.md 11: the 7 Queue columns plus id - nothing else leaves the server.
      select: {
        id: true,
        ticketNumber: true,
        summary: true,
        currentStatus: true,
        itPriority: true,
        createdAt: true,
        requester: { select: { id: true, name: true } },
        ticketOwner: { select: { id: true, name: true } },
      },
    });

    // api-spec.md 4 calls the field `owner`; the schema's relation is `ticketOwner`.
    const data = rows.map(({ ticketOwner, ...row }) => ({ ...row, owner: ticketOwner }));

    res.status(200).json({
      data,
      page: query.page,
      pageSize: query.pageSize,
      totalCount,
      totalPages: Math.ceil(totalCount / query.pageSize),
    });
  } catch (error) {
    console.error('GET /api/staff/tickets failed:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to retrieve the ticket queue' } });
  }
});

export default app;
