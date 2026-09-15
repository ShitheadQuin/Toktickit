import { Router, type Request, type Response } from 'express';
import { prisma } from '../prisma';
import { requireAuth, requirePasswordChanged, requireRole } from '../middleware';

// api-spec.md 5: Public Comments and Internal Notes, mounted at /api/tickets. Two tables, so a
// query for comments can never return a note (specification.md 11). Both are append-only - there
// is deliberately no PATCH or DELETE here (BR-17).
const router = Router();
const signedIn = [requireAuth, requirePasswordChanged];

// BR-16
const MAX_BODY_LENGTH = 2000;

const TICKET_NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'Ticket not found' } };

const ENTRY_SELECT = {
  id: true,
  ticketId: true,
  authorId: true,
  body: true,
  createdAt: true,
  author: { select: { id: true, name: true, role: true } },
} as const;

// A Requester reaches only their own Ticket - someone else's is the same 404 as a missing one
// (BR-12). IT Staff and Administrator reach any Ticket. Responds and returns null when not found.
async function findTicketFor(req: Request, res: Response): Promise<number | null> {
  const id = Number(req.params.id);
  const ticket =
    Number.isInteger(id) && id >= 1
      ? await prisma.ticket.findUnique({ where: { id }, select: { id: true, requesterId: true } })
      : null;
  if (!ticket || (req.user!.role === 'REQUESTER' && ticket.requesterId !== req.user!.id)) {
    res.status(404).json(TICKET_NOT_FOUND);
    return null;
  }
  return ticket.id;
}

// BR-16: empty or whitespace-only is rejected, and so is anything over 2,000 characters. The text
// is stored as sent apart from trimming, and never interpreted as markup anywhere.
function readBody(req: Request, res: Response): string | null {
  const raw = req.body?.body;
  const text = typeof raw === 'string' ? raw.trim() : '';
  const problem = !text ? 'body is required' : text.length > MAX_BODY_LENGTH ? 'body must be 2,000 characters or fewer' : null;
  if (problem) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: problem, fields: [{ field: 'body', message: problem }] } });
    return null;
  }
  return text;
}

router.get('/:id/comments', ...signedIn, requireRole('REQUESTER', 'IT_STAFF', 'ADMINISTRATOR'), async (req, res) => {
  try {
    const ticketId = await findTicketFor(req, res);
    if (ticketId === null) return;
    const comments = await prisma.publicComment.findMany({
      where: { ticketId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: ENTRY_SELECT,
    });
    res.status(200).json(comments);
  } catch (error) {
    console.error('GET /api/tickets/:id/comments failed:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to retrieve comments' } });
  }
});

// Administrator reads comments but never posts them (specification.md 11).
router.post('/:id/comments', ...signedIn, requireRole('REQUESTER', 'IT_STAFF'), async (req, res) => {
  try {
    const ticketId = await findTicketFor(req, res);
    if (ticketId === null) return;
    const body = readBody(req, res);
    if (body === null) return;

    // A Public Comment is a visible change to the Ticket, so it moves Last Updated.
    const [comment] = await prisma.$transaction([
      prisma.publicComment.create({ data: { ticketId, authorId: req.user!.id, body }, select: ENTRY_SELECT }),
      prisma.ticket.update({ where: { id: ticketId }, data: { updatedAt: new Date() } }),
    ]);
    res.status(201).json(comment);
  } catch (error) {
    console.error('POST /api/tickets/:id/comments failed:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to post comment' } });
  }
});

// A Requester is refused as a role (403) before any Ticket is looked up - even their own - so the
// response says nothing about whether notes exist (BR-04, AC-04).
router.get('/:id/notes', ...signedIn, requireRole('IT_STAFF', 'ADMINISTRATOR'), async (req, res) => {
  try {
    const ticketId = await findTicketFor(req, res);
    if (ticketId === null) return;
    const notes = await prisma.internalNote.findMany({
      where: { ticketId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: ENTRY_SELECT,
    });
    res.status(200).json(notes);
  } catch (error) {
    console.error('GET /api/tickets/:id/notes failed:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to retrieve notes' } });
  }
});

router.post('/:id/notes', ...signedIn, requireRole('IT_STAFF'), async (req, res) => {
  try {
    const ticketId = await findTicketFor(req, res);
    if (ticketId === null) return;
    const body = readBody(req, res);
    if (body === null) return;

    // specification.md 11, BR-26: deliberately does not touch the Ticket, so the Requester's Last
    // Updated never moves because of private activity.
    const note = await prisma.internalNote.create({ data: { ticketId, authorId: req.user!.id, body }, select: ENTRY_SELECT });
    res.status(201).json(note);
  } catch (error) {
    console.error('POST /api/tickets/:id/notes failed:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to post note' } });
  }
});

export default router;
