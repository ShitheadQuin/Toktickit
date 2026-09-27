import { Router, type Request, type Response } from 'express';
import { prisma } from '../prisma';
import { requireAuth, requirePasswordChanged, requireRole } from '../middleware';
import { ATTACHMENT_METADATA_SELECT, attachmentFilePath } from '../attachment-storage';
import { CURRENT_STATUSES, REQUESTED_PRIORITIES, type CurrentStatusValue, type RequestedPriorityValue } from '../ticket-list-helpers';
import { checkTransition } from '../status-transitions';
import { evaluateResolutionGate } from '../resolution-gate';

// api-spec.md 3 (Lab 4) and Lab 3 api-spec.md 4: Staff Ticket Detail and its actions, mounted at
// /api/staff. The Queue itself (GET /api/staff/tickets) stays in app.ts. Lab 4 opens every route to
// Administrators as well as IT Staff (specification.md 11, superseding Lab 3's "Administrator
// performs no Ticket actions"). A Requester still gets 403 before any Ticket is looked up.
const router = Router();
const staffOnly = [requireAuth, requirePasswordChanged, requireRole('IT_STAFF', 'ADMINISTRATOR')];

const TICKET_NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'Ticket not found' } };
const STALE_UPDATE = {
  error: { code: 'STALE_UPDATE', message: 'This Ticket changed while you were working on it. Reload to see the latest version.' },
};

// The words staff see for each status (Lab 3 ui-spec.md 9), so an error shown as-is never exposes
// enum codes.
const STATUS_LABEL: Record<string, string> = {
  NEW: 'New',
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  WAITING_FOR_REQUESTER: 'Waiting for Requester',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  REOPENED: 'Reopened',
  CANCELLED: 'Cancelled',
};

const errorCode = (error: unknown) => (error as { code?: string } | null)?.code;

// A write that loses the version race (count 0) or a serializable conflict (P2034) is the same
// thing to the user: someone else changed the Ticket first.
class StaleUpdate extends Error {}

function parseId(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const id = Number(raw);
  return Number.isInteger(id) && id >= 1 ? id : null;
}

function fieldError(res: Response, field: string, message: string) {
  return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message, fields: [{ field, message }] } });
}

// BR-19: every workflow write names the version it was based on. Responds and returns null when
// missing or not a whole number.
function readExpectedVersion(req: Request, res: Response): number | null {
  const value = req.body?.expectedVersion;
  if (!Number.isInteger(value) || value < 0) {
    fieldError(res, 'expectedVersion', 'expectedVersion is required.');
    return null;
  }
  return value as number;
}

// The one Staff Ticket Detail shape: returned by the detail GET and by every action, so the client
// re-renders from the response. Carries the version to send back (BR-19) and the resolution gate,
// so the screen can explain a blocked Resolved without a second request (api-spec.md 3).
async function loadStaffTicket(id: number) {
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: {
      id: true,
      ticketNumber: true,
      ticketDate: true,
      createdAt: true,
      updatedAt: true,
      version: true,
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
      actions: { select: { status: true } },
    },
  });
  if (!ticket) return null;
  // api-spec.md calls the field `owner`, same as the Queue; the schema's relation is `ticketOwner`.
  const { ticketOwner, actions, ...rest } = ticket;
  return { ...rest, owner: ticketOwner, gate: evaluateResolutionGate(actions.map((a) => a.status)) };
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
    const ticket =
      id === null ? null : await prisma.ticket.findUnique({ where: { id }, select: { ticketOwnerId: true, currentStatus: true, version: true } });
    if (id === null || !ticket) return res.status(404).json(TICKET_NOT_FOUND);

    const expectedVersion = readExpectedVersion(req, res);
    if (expectedVersion === null) return;
    if (ticket.version !== expectedVersion) return res.status(409).json(STALE_UPDATE);
    if (ticket.ticketOwnerId !== null) {
      return res.status(409).json({ error: { code: 'ALREADY_ASSIGNED', message: 'This Ticket already has an owner' } });
    }
    if (ticket.currentStatus !== 'NEW') {
      return res.status(409).json({ error: { code: 'INVALID_TRANSITION', message: 'Only a New Ticket can be claimed' } });
    }

    // Written only if the Ticket is still unassigned, New and at the version just checked, so of two
    // simultaneous claims exactly one updates a row. Claiming opens the Ticket, so it is a status
    // change and writes a history row in the same transaction (BR-18).
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.ticket.updateMany({
        where: { id, ticketOwnerId: null, currentStatus: 'NEW', version: expectedVersion },
        data: { ticketOwnerId: req.user!.id, currentStatus: 'OPEN', version: { increment: 1 } },
      });
      if (claimed.count === 0) throw new StaleUpdate();
      await tx.ticketStatusHistory.create({ data: { ticketId: id, fromStatus: 'NEW', toStatus: 'OPEN', changedById: req.user!.id } });
    });

    res.status(200).json(await loadStaffTicket(id));
  } catch (error) {
    if (error instanceof StaleUpdate) return res.status(409).json(STALE_UPDATE);
    console.error('POST /api/staff/tickets/:id/claim failed:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to claim ticket' } });
  }
});

router.post('/tickets/:id/reassign', ...staffOnly, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const ticket = id === null ? null : await prisma.ticket.findUnique({ where: { id }, select: { version: true } });
    if (id === null || !ticket) return res.status(404).json(TICKET_NOT_FOUND);

    // BR-13: the new owner must be an active IT Staff member or Administrator.
    const { newOwnerId } = req.body ?? {};
    const newOwner = Number.isInteger(newOwnerId)
      ? await prisma.user.findUnique({ where: { id: newOwnerId }, select: { role: true, isActive: true } })
      : null;
    if (!newOwner || newOwner.role === 'REQUESTER' || !newOwner.isActive) {
      return fieldError(res, 'newOwnerId', 'newOwnerId must be an active IT Staff member or Administrator');
    }
    const expectedVersion = readExpectedVersion(req, res);
    if (expectedVersion === null) return;
    if (ticket.version !== expectedVersion) return res.status(409).json(STALE_UPDATE);

    const written = await prisma.ticket.updateMany({
      where: { id, version: expectedVersion },
      data: { ticketOwnerId: newOwnerId, version: { increment: 1 } },
    });
    if (written.count === 0) return res.status(409).json(STALE_UPDATE);
    res.status(200).json(await loadStaffTicket(id));
  } catch (error) {
    console.error('POST /api/staff/tickets/:id/reassign failed:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to reassign ticket' } });
  }
});

router.patch('/tickets/:id/priority', ...staffOnly, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const ticket = id === null ? null : await prisma.ticket.findUnique({ where: { id }, select: { version: true } });
    if (id === null || !ticket) return res.status(404).json(TICKET_NOT_FOUND);

    // Lab 3 BR-15: any staff member, owner or not. Requested Priority is never touched.
    const { itPriority } = req.body ?? {};
    if (!REQUESTED_PRIORITIES.includes(itPriority as RequestedPriorityValue)) {
      return fieldError(res, 'itPriority', 'itPriority must be LOW, MEDIUM, or HIGH');
    }
    const expectedVersion = readExpectedVersion(req, res);
    if (expectedVersion === null) return;
    if (ticket.version !== expectedVersion) return res.status(409).json(STALE_UPDATE);

    const written = await prisma.ticket.updateMany({
      where: { id, version: expectedVersion },
      data: { itPriority, version: { increment: 1 } },
    });
    if (written.count === 0) return res.status(409).json(STALE_UPDATE);
    res.status(200).json(await loadStaffTicket(id));
  } catch (error) {
    console.error('PATCH /api/staff/tickets/:id/priority failed:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to update IT Priority' } });
  }
});

class GateNotMet extends Error {
  constructor(readonly counts: { completed: number; open: number }) {
    super('gate');
  }
}

router.patch('/tickets/:id/status', ...staffOnly, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const ticket =
      id === null ? null : await prisma.ticket.findUnique({ where: { id }, select: { currentStatus: true, ticketOwnerId: true, version: true } });
    if (id === null || !ticket) return res.status(404).json(TICKET_NOT_FOUND);

    const { status } = req.body ?? {};
    if (!CURRENT_STATUSES.includes(status as CurrentStatusValue)) {
      return fieldError(res, 'status', 'status must be one of the 8 Ticket statuses');
    }
    const expectedVersion = readExpectedVersion(req, res);
    if (expectedVersion === null) return;
    const to = status as CurrentStatusValue;

    // Order (api-spec.md 1): a non-owner hears "not the owner" before "the Ticket changed", so a
    // stale version never tells someone about a Ticket they could not have changed anyway (PR #66
    // review). Then the version, then the matrix, then the gate.
    const check = checkTransition(ticket.currentStatus, to);
    if (check.allowed && check.requiresOwnership && ticket.ticketOwnerId !== req.user!.id) {
      return res.status(403).json({ error: { code: 'NOT_TICKET_OWNER', message: 'Only the Ticket owner can make this change' } });
    }
    if (ticket.version !== expectedVersion) return res.status(409).json(STALE_UPDATE);
    if (!check.allowed) {
      return res.status(409).json({
        error: { code: 'INVALID_TRANSITION', message: `This Ticket is ${STATUS_LABEL[ticket.currentStatus]} and cannot move to ${STATUS_LABEL[to]}.` },
      });
    }

    // BR-16 and BR-18: the gate is counted, the status written and the history row added in one
    // serializable transaction, so an Action added at the same moment cannot slip past the gate.
    await prisma.$transaction(
      async (tx) => {
        if (to === 'RESOLVED') {
          const actions = await tx.actionTaken.findMany({ where: { ticketId: id }, select: { status: true } });
          const gate = evaluateResolutionGate(actions.map((a) => a.status));
          if (!gate.met) throw new GateNotMet({ completed: gate.completed, open: gate.open });
        }
        const written = await tx.ticket.updateMany({
          where: { id, version: expectedVersion, currentStatus: ticket.currentStatus, ...(check.requiresOwnership ? { ticketOwnerId: req.user!.id } : {}) },
          data: { currentStatus: to, version: { increment: 1 } },
        });
        if (written.count === 0) throw new StaleUpdate();
        await tx.ticketStatusHistory.create({ data: { ticketId: id, fromStatus: ticket.currentStatus, toStatus: to, changedById: req.user!.id } });
      },
      { isolationLevel: 'Serializable' },
    );

    res.status(200).json(await loadStaffTicket(id));
  } catch (error) {
    if (error instanceof GateNotMet) {
      const { completed, open } = error.counts;
      const message = open > 0 ? 'Complete or cancel the remaining Actions Taken before resolving.' : 'Add and complete at least one Action before resolving.';
      return res.status(409).json({ error: { code: 'RESOLUTION_GATE_NOT_MET', message, details: { completed, open } } });
    }
    if (error instanceof StaleUpdate || errorCode(error) === 'P2034') return res.status(409).json(STALE_UPDATE);
    console.error('PATCH /api/staff/tickets/:id/status failed:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to update status' } });
  }
});

// api-spec.md 3: the list behind the Ticket Owner and Action Assignee controls. /api/users is
// Administrator-only, so staff read active IT Staff and Administrators here, with their role.
router.get('/assignable-users', ...staffOnly, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { role: { in: ['IT_STAFF', 'ADMINISTRATOR'] }, isActive: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true, role: true },
    });
    res.status(200).json(users);
  } catch (error) {
    console.error('GET /api/staff/assignable-users failed:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to retrieve staff' } });
  }
});

// Lab 3 api-spec.md 4: Attachment continuity for staff, read-only, active files only. A missing and
// a soft-removed Attachment are the same 404.
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
