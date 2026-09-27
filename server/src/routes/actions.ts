import { Router, type Request, type Response } from 'express';
import { prisma } from '../prisma';
import { requireAuth, requirePasswordChanged, requireRole } from '../middleware';
import {
  canCreateWithStatus,
  checkActionStatusChange,
  isActionStatus,
  isLocked,
  validateActionInput,
  type ActionStatusValue,
  type FieldError,
} from '../action-rules';

// api-spec.md 2: Actions Taken, mounted at /api. Reading is open to the Ticket's Requester and to
// Staff; every write is Staff only, enforced here and never left to the client (BR-03).
const router = Router();
const signedIn = [requireAuth, requirePasswordChanged];
const staffOnly = [...signedIn, requireRole('IT_STAFF', 'ADMINISTRATOR')];

const TICKET_NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'Ticket not found' } };
const ACTION_NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'Action not found' } };
const TICKET_CLOSED = {
  error: { code: 'TICKET_CLOSED', message: 'Actions cannot be added or changed on a Closed or Cancelled Ticket.' },
};
const CLOSED_STATUSES = ['CLOSED', 'CANCELLED'];
const MAX_CLIENT_REQUEST_ID = 64;

// The one Action shape every endpoint returns (api-spec.md 2). clientRequestId stays internal.
const ACTION_SELECT = {
  id: true,
  ticketId: true,
  actionAt: true,
  description: true,
  result: true,
  status: true,
  followUpRequired: true,
  followUpNote: true,
  attachmentNotes: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  performedBy: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true } },
} as const;

const errorCode = (error: unknown) => (error as { code?: string } | null)?.code;

function parseId(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const id = Number(raw);
  return Number.isInteger(id) && id >= 1 ? id : null;
}

function validationError(res: Response, fields: FieldError[]) {
  return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: fields[0]!.message, fields } });
}

// BR-05: an active IT Staff member or Administrator. Responds and returns false when not.
async function checkAssignee(res: Response, assigneeId: unknown): Promise<boolean> {
  const user = Number.isInteger(assigneeId)
    ? await prisma.user.findUnique({ where: { id: assigneeId as number }, select: { role: true, isActive: true } })
    : null;
  if (!user || user.role === 'REQUESTER') {
    const message = 'The assignee must be an IT Staff member or Administrator.';
    res.status(400).json({ error: { code: 'ASSIGNEE_INVALID', message, fields: [{ field: 'assigneeId', message }] } });
    return false;
  }
  if (!user.isActive) {
    const message = 'This person is inactive and cannot be assigned an Action.';
    res.status(400).json({ error: { code: 'ASSIGNEE_INACTIVE', message, fields: [{ field: 'assigneeId', message }] } });
    return false;
  }
  return true;
}

// A Requester reaches only their own Ticket; someone else's is the same 404 as a missing one
// (Lab 3 BR-12, unchanged).
async function findReadableTicket(req: Request, res: Response): Promise<number | null> {
  const id = parseId(req.params.id);
  const ticket = id === null ? null : await prisma.ticket.findUnique({ where: { id }, select: { id: true, requesterId: true } });
  if (!ticket || (req.user!.role === 'REQUESTER' && ticket.requesterId !== req.user!.id)) {
    res.status(404).json(TICKET_NOT_FOUND);
    return null;
  }
  return ticket.id;
}

router.get('/tickets/:id/actions', ...signedIn, requireRole('REQUESTER', 'IT_STAFF', 'ADMINISTRATOR'), async (req, res) => {
  try {
    const ticketId = await findReadableTicket(req, res);
    if (ticketId === null) return;
    // BR-01 ordering: by when the work happened, then by entry order for equal times.
    const actions = await prisma.actionTaken.findMany({
      where: { ticketId },
      orderBy: [{ actionAt: 'asc' }, { id: 'asc' }],
      select: ACTION_SELECT,
    });
    res.status(200).json(actions);
  } catch (error) {
    console.error('GET /api/tickets/:id/actions failed:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to retrieve Actions Taken' } });
  }
});

router.post('/staff/tickets/:id/actions', ...staffOnly, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const ticket =
      id === null ? null : await prisma.ticket.findUnique({ where: { id }, select: { id: true, currentStatus: true, createdAt: true } });
    if (!ticket) return res.status(404).json(TICKET_NOT_FOUND);

    const body = (req.body ?? {}) as Record<string, unknown>;

    // BR-20: a retry of a create that already succeeded returns that Action instead of a second one.
    const clientRequestId = body.clientRequestId;
    if (clientRequestId !== undefined && clientRequestId !== null) {
      if (typeof clientRequestId !== 'string' || !clientRequestId.trim() || clientRequestId.length > MAX_CLIENT_REQUEST_ID) {
        return validationError(res, [{ field: 'clientRequestId', message: 'clientRequestId must be text of 64 characters or fewer.' }]);
      }
      const existing = await prisma.actionTaken.findUnique({
        where: { ticketId_clientRequestId: { ticketId: ticket.id, clientRequestId } },
        select: ACTION_SELECT,
      });
      if (existing) return res.status(200).json(existing);
    }

    // Only the documented fields are read; performedById, version, ticketId and id are never taken
    // from the body (BR-04).
    const { value, fields } = validateActionInput(
      {
        actionAt: body.actionAt ?? new Date(),
        description: body.description,
        result: body.result,
        status: body.status ?? 'PLANNED',
        followUpRequired: body.followUpRequired ?? false,
        followUpNote: body.followUpNote,
        attachmentNotes: body.attachmentNotes,
      },
      { now: new Date(), ticketCreatedAt: ticket.createdAt },
    );
    if (isActionStatus(body.status ?? 'PLANNED') && !canCreateWithStatus((body.status ?? 'PLANNED') as ActionStatusValue)) {
      fields.push({ field: 'status', message: 'A new Action can be Planned, In Progress or Completed.' });
    }
    if (fields.length > 0) return validationError(res, fields);

    const assigneeId = body.assigneeId ?? req.user!.id;
    if (!(await checkAssignee(res, assigneeId))) return;

    if (CLOSED_STATUSES.includes(ticket.currentStatus)) return res.status(409).json(TICKET_CLOSED);

    try {
      // BR-12: Actions are visible to the Requester, so recording one moves the Ticket's Last Updated.
      const [action] = await prisma.$transaction([
        prisma.actionTaken.create({
          data: {
            ...value,
            ticketId: ticket.id,
            performedById: req.user!.id,
            assigneeId: assigneeId as number,
            clientRequestId: typeof clientRequestId === 'string' ? clientRequestId : null,
          },
          select: ACTION_SELECT,
        }),
        prisma.ticket.update({ where: { id: ticket.id }, data: { updatedAt: new Date() } }),
      ]);
      return res.status(201).json(action);
    } catch (error) {
      // Two copies of the same request arrived together: the unique index let one through.
      if (errorCode(error) === 'P2002' && typeof clientRequestId === 'string') {
        const existing = await prisma.actionTaken.findUnique({
          where: { ticketId_clientRequestId: { ticketId: ticket.id, clientRequestId } },
          select: ACTION_SELECT,
        });
        if (existing) return res.status(200).json(existing);
      }
      throw error;
    }
  } catch (error) {
    console.error('POST /api/staff/tickets/:id/actions failed:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to save the Action' } });
  }
});

router.patch('/staff/actions/:id', ...staffOnly, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const stored =
      id === null
        ? null
        : await prisma.actionTaken.findUnique({
            where: { id },
            include: { ticket: { select: { currentStatus: true, createdAt: true } } },
          });
    if (!stored) return res.status(404).json(ACTION_NOT_FOUND);

    const body = (req.body ?? {}) as Record<string, unknown>;
    const expectedVersion = body.expectedVersion;
    if (!Number.isInteger(expectedVersion)) {
      return validationError(res, [{ field: 'expectedVersion', message: 'expectedVersion is required.' }]);
    }

    // The Action as it would be after this change: stored values, overlaid with whatever was sent.
    const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);
    const merged = {
      actionAt: has('actionAt') ? body.actionAt : stored.actionAt,
      description: has('description') ? body.description : stored.description,
      result: has('result') ? body.result : stored.result,
      status: has('status') ? body.status : stored.status,
      followUpRequired: has('followUpRequired') ? body.followUpRequired : stored.followUpRequired,
      followUpNote: has('followUpNote') ? body.followUpNote : stored.followUpNote,
      attachmentNotes: has('attachmentNotes') ? body.attachmentNotes : stored.attachmentNotes,
    };
    const { value, fields } = validateActionInput(merged, { now: new Date(), ticketCreatedAt: stored.ticket.createdAt });
    if (fields.length > 0) return validationError(res, fields);

    // Checked only when the assignee changes, so an assignee who later became inactive does not
    // block unrelated edits.
    const assigneeChanged = has('assigneeId') && body.assigneeId !== stored.assigneeId;
    if (assigneeChanged && !(await checkAssignee(res, body.assigneeId))) return;

    // BR-19: refused before any rule is judged, since the rule would be judged against an Action
    // the user has not seen.
    if (expectedVersion !== stored.version) {
      return res.status(409).json({
        error: { code: 'STALE_UPDATE', message: 'This Action changed while you were editing it. Reload to see the latest version.' },
      });
    }
    if (isLocked(stored.status)) {
      return res.status(409).json({
        error: { code: 'ACTION_LOCKED', message: `${stored.status === 'COMPLETED' ? 'Completed' : 'Cancelled'} Actions cannot be changed.` },
      });
    }
    if (value.status !== stored.status && !checkActionStatusChange(stored.status, value.status)) {
      return res.status(409).json({ error: { code: 'INVALID_TRANSITION', message: 'This Action cannot move to that status.' } });
    }
    if (CLOSED_STATUSES.includes(stored.ticket.currentStatus)) return res.status(409).json(TICKET_CLOSED);

    // The version check is part of the write, so two edits racing on one version give one success.
    const updated = await prisma.$transaction(async (tx) => {
      const written = await tx.actionTaken.updateMany({
        where: { id: stored.id, version: expectedVersion as number },
        data: {
          ...value,
          ...(assigneeChanged ? { assigneeId: body.assigneeId as number } : {}),
          version: { increment: 1 },
        },
      });
      if (written.count === 0) return null;
      await tx.ticket.update({ where: { id: stored.ticketId }, data: { updatedAt: new Date() } });
      return tx.actionTaken.findUniqueOrThrow({ where: { id: stored.id }, select: ACTION_SELECT });
    });
    if (!updated) {
      return res.status(409).json({
        error: { code: 'STALE_UPDATE', message: 'This Action changed while you were editing it. Reload to see the latest version.' },
      });
    }
    res.status(200).json(updated);
  } catch (error) {
    console.error('PATCH /api/staff/actions/:id failed:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to save the Action' } });
  }
});

export default router;
