import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, requirePasswordChanged, requireRole } from '../middleware';
import { ATTACHMENT_METADATA_SELECT, attachmentFilePath } from '../attachment-storage';
import { CURRENT_STATUSES, REQUESTED_PRIORITIES, type CurrentStatusValue, type RequestedPriorityValue } from '../ticket-list-helpers';
import { checkTransition } from '../status-transitions';

// api-spec.md 4: IT Staff Ticket Detail and its actions, mounted at /api/staff. The Queue itself
// (GET /api/staff/tickets) stays in app.ts. Every route is IT Staff only - Requester and
// Administrator get 403 before any Ticket is looked up (specification.md 11).
const router = Router();
const staffOnly = [requireAuth, requirePasswordChanged, requireRole('IT_STAFF')];

const TICKET_NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'Ticket not found' } };

// Express types a route parameter loosely (string | string[] | undefined); anything that isn't a
// single whole number of at least 1 is treated as a Ticket that doesn't exist.
function parseId(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const id = Number(raw);
  return Number.isInteger(id) && id >= 1 ? id : null;
}

// The one Staff Ticket Detail shape: returned by the detail GET and by every action, so the client
// re-renders from the response instead of refetching. Comments and Internal Notes are never
// embedded (api-spec.md 4) - they have their own endpoints.
async function loadStaffTicket(id: number) {
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: {
      id: true,
      ticketNumber: true,
      ticketDate: true,
      createdAt: true,
      updatedAt: true,
      summary: true,
      description: true,
      requestedPriority: true,
      itPriority: true,
      currentStatus: true,
      requesterConfirmedAt: true,
      requester: { select: { id: true, name: true, email: true } },
      ticketOwner: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
      relatedSystem: { select: { id: true, name: true } },
      attachments: { orderBy: { uploadedAt: 'asc' }, select: ATTACHMENT_METADATA_SELECT },
    },
  });
  if (!ticket) return null;
  // api-spec.md 4 calls the field `owner`, same as the Queue; the schema's relation is `ticketOwner`.
  const { ticketOwner, ...rest } = ticket;
  return { ...rest, owner: ticketOwner };
}

router.get('/tickets/:id', ...staffOnly, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const ticket = id === null ? null : await loadStaffTicket(id);
    if (!ticket) return res.status(404).json(TICKET_NOT_FOUND);
    res.status(200).json(ticket);
  } catch (error) {
    console.error('GET /api/staff/tickets/:id failed:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to retrieve ticket' } });
  }
});

router.post('/tickets/:id/claim', ...staffOnly, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (id === null || !(await prisma.ticket.findUnique({ where: { id }, select: { id: true } }))) {
      return res.status(404).json(TICKET_NOT_FOUND);
    }

    // specification.md 11: atomic - the owner and status are written only if the Ticket is still
    // unassigned and New at that moment, so of two simultaneous claims exactly one updates a row.
    const claimed = await prisma.ticket.updateMany({
      where: { id, ticketOwnerId: null, currentStatus: 'NEW' },
      data: { ticketOwnerId: req.user!.id, currentStatus: 'OPEN' },
    });

    if (claimed.count === 0) {
      const current = await prisma.ticket.findUnique({ where: { id }, select: { ticketOwnerId: true } });
      if (current?.ticketOwnerId !== null) {
        return res.status(409).json({ error: { code: 'ALREADY_ASSIGNED', message: 'This Ticket already has an owner' } });
      }
      return res.status(409).json({ error: { code: 'INVALID_TRANSITION', message: 'Only a New Ticket can be claimed' } });
    }

    res.status(200).json(await loadStaffTicket(id));
  } catch (error) {
    console.error('POST /api/staff/tickets/:id/claim failed:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to claim ticket' } });
  }
});

router.post('/tickets/:id/reassign', ...staffOnly, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (id === null || !(await prisma.ticket.findUnique({ where: { id }, select: { id: true } }))) {
      return res.status(404).json(TICKET_NOT_FOUND);
    }

    // BR-13: the new owner must be an active IT Staff member - not an Administrator, even though
    // the schema would allow one (specification.md 11).
    const { newOwnerId } = req.body ?? {};
    const newOwner = Number.isInteger(newOwnerId)
      ? await prisma.user.findUnique({ where: { id: newOwnerId }, select: { role: true, isActive: true } })
      : null;
    if (!newOwner || newOwner.role !== 'IT_STAFF' || !newOwner.isActive) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'newOwnerId must be an active IT Staff member',
          fields: [{ field: 'newOwnerId', message: 'newOwnerId must be an active IT Staff member' }],
        },
      });
    }

    await prisma.ticket.update({ where: { id }, data: { ticketOwnerId: newOwnerId } });
    res.status(200).json(await loadStaffTicket(id));
  } catch (error) {
    console.error('POST /api/staff/tickets/:id/reassign failed:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to reassign ticket' } });
  }
});

router.patch('/tickets/:id/priority', ...staffOnly, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (id === null || !(await prisma.ticket.findUnique({ where: { id }, select: { id: true } }))) {
      return res.status(404).json(TICKET_NOT_FOUND);
    }

    // BR-15: any active IT Staff member, owner or not. Requested Priority is never touched.
    const { itPriority } = req.body ?? {};
    if (!REQUESTED_PRIORITIES.includes(itPriority as RequestedPriorityValue)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'itPriority must be LOW, MEDIUM, or HIGH',
          fields: [{ field: 'itPriority', message: 'itPriority must be LOW, MEDIUM, or HIGH' }],
        },
      });
    }

    await prisma.ticket.update({ where: { id }, data: { itPriority } });
    res.status(200).json(await loadStaffTicket(id));
  } catch (error) {
    console.error('PATCH /api/staff/tickets/:id/priority failed:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to update IT Priority' } });
  }
});

router.patch('/tickets/:id/status', ...staffOnly, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const ticket =
      id === null ? null : await prisma.ticket.findUnique({ where: { id }, select: { currentStatus: true, ticketOwnerId: true } });
    if (id === null || !ticket) return res.status(404).json(TICKET_NOT_FOUND);

    const { status } = req.body ?? {};
    if (!CURRENT_STATUSES.includes(status as CurrentStatusValue)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'status must be one of the 8 Ticket statuses',
          fields: [{ field: 'status', message: 'status must be one of the 8 Ticket statuses' }],
        },
      });
    }

    const check = checkTransition(ticket.currentStatus, status as CurrentStatusValue);
    if (!check.allowed) {
      return res.status(409).json({
        error: { code: 'INVALID_TRANSITION', message: `A ${ticket.currentStatus} Ticket cannot move to ${status}` },
      });
    }
    // BR-14: every transition needs the owner except Cancel and Reopen, which the matrix marks.
    if (check.requiresOwnership && ticket.ticketOwnerId !== req.user!.id) {
      return res.status(403).json({
        error: { code: 'NOT_TICKET_OWNER', message: 'Only the Ticket owner can make this change' },
      });
    }

    // Written only if the Ticket is still in the status (and, where required, with the owner) that
    // was just checked - a change landing in between turns into a conflict, not a skipped rule.
    const updated = await prisma.ticket.updateMany({
      where: { id, currentStatus: ticket.currentStatus, ...(check.requiresOwnership ? { ticketOwnerId: req.user!.id } : {}) },
      data: { currentStatus: status },
    });
    if (updated.count === 0) {
      return res.status(409).json({
        error: { code: 'INVALID_TRANSITION', message: 'This Ticket changed while you were working on it. Reload and try again.' },
      });
    }

    res.status(200).json(await loadStaffTicket(id));
  } catch (error) {
    console.error('PATCH /api/staff/tickets/:id/status failed:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to update status' } });
  }
});

// api-spec.md 4: the Ticket Owner dropdown's list. /api/users is Administrator-only, so IT Staff
// read active IT Staff here - id and name only.
router.get('/assignable-users', ...staffOnly, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { role: 'IT_STAFF', isActive: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true },
    });
    res.status(200).json(users);
  } catch (error) {
    console.error('GET /api/staff/assignable-users failed:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to retrieve IT Staff' } });
  }
});

// api-spec.md 4: Attachment continuity for IT Staff - read-only, active files only. A missing and
// a soft-removed Attachment are the same 404 (BR-16).
router.get('/attachments/:id/download', ...staffOnly, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const attachment =
      id === null
        ? null
        : await prisma.attachment.findUnique({
            where: { id },
            select: { storedFilename: true, originalFilename: true, mimeType: true, isActive: true },
          });
    if (!attachment || !attachment.isActive) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Attachment not found' } });
    }

    res.status(200).download(attachmentFilePath(attachment.storedFilename), attachment.originalFilename, {
      headers: { 'Content-Type': attachment.mimeType },
    });
  } catch (error) {
    console.error('GET /api/staff/attachments/:id/download failed:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to download attachment' } });
  }
});

export default router;
