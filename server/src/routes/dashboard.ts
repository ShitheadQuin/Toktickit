import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, requirePasswordChanged, requireRole } from '../middleware';
import { CURRENT_STATUSES } from '../ticket-list-helpers';
import { ACTIVE_STATUSES, RECENT_LIMIT, recentlyResolvedSince, requesterMetricLinks, staffMetricLinks } from '../dashboard-queries';

// api-spec.md 5: the two dashboards, mounted at /api/dashboard. Every figure is counted from the
// database at request time (BR-23) and returned with the link to the list it counted, so the client
// never builds filter strings itself. Concise data only, never whole Ticket collections (labsheet 6.2).
const router = Router();
const signedIn = [requireAuth, requirePasswordChanged];

const TICKET_SUMMARY = { id: true, ticketNumber: true, summary: true, currentStatus: true, updatedAt: true } as const;
const NEWEST_FIRST = [{ updatedAt: 'desc' as const }, { id: 'desc' as const }];
const DESCRIPTION_PREVIEW = 120;

// BR-22: only the signed-in Requester's Tickets. No user id is read from the request.
router.get('/requester', ...signedIn, requireRole('REQUESTER'), async (req, res) => {
  try {
    const mine = { requesterId: req.user!.id };
    const [myOpen, waitingForMe, resolved, closed, recentTickets, recentlyResolved] = await Promise.all([
      prisma.ticket.count({ where: { ...mine, currentStatus: { in: ACTIVE_STATUSES } } }),
      prisma.ticket.count({ where: { ...mine, currentStatus: 'WAITING_FOR_REQUESTER' } }),
      prisma.ticket.count({ where: { ...mine, currentStatus: 'RESOLVED' } }),
      prisma.ticket.count({ where: { ...mine, currentStatus: 'CLOSED' } }),
      prisma.ticket.findMany({ where: mine, orderBy: NEWEST_FIRST, take: RECENT_LIMIT, select: TICKET_SUMMARY }),
      prisma.ticket.findMany({
        where: { ...mine, currentStatus: 'RESOLVED', updatedAt: { gte: recentlyResolvedSince(new Date()) } },
        orderBy: NEWEST_FIRST,
        take: RECENT_LIMIT,
        select: TICKET_SUMMARY,
      }),
    ]);
    res.status(200).json({
      generatedAt: new Date().toISOString(),
      metrics: [
        { key: 'myOpen', label: 'My Open Tickets', count: myOpen, link: requesterMetricLinks.myOpen },
        { key: 'waitingForMe', label: 'Waiting for Me', count: waitingForMe, link: requesterMetricLinks.waitingForMe },
        { key: 'resolved', label: 'Resolved', count: resolved, link: requesterMetricLinks.resolved },
        { key: 'closed', label: 'Closed', count: closed, link: requesterMetricLinks.closed },
      ],
      recentTickets,
      recentlyResolved,
    });
  } catch (error) {
    console.error('GET /api/dashboard/requester failed:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to load the dashboard' } });
  }
});

// IT Staff and Administrators; an Administrator also gets the user account counts (labsheet 4.6).
router.get('/staff', ...signedIn, requireRole('IT_STAFF', 'ADMINISTRATOR'), async (req, res) => {
  try {
    const me = req.user!.id;
    const active = { currentStatus: { in: ACTIVE_STATUSES } };
    const openActions = { assigneeId: me, status: { in: ['PLANNED' as const, 'IN_PROGRESS' as const] } };
    const links = staffMetricLinks(me);

    const [unassigned, myTickets, statusGroups, priorityGroups, myOpenActionCount, myOpenActions, recentTickets] = await Promise.all([
      prisma.ticket.count({ where: { ...active, ticketOwnerId: null } }),
      prisma.ticket.count({ where: { ...active, ticketOwnerId: me } }),
      prisma.ticket.groupBy({ by: ['currentStatus'], _count: { _all: true } }),
      prisma.ticket.groupBy({ by: ['itPriority'], where: active, _count: { _all: true } }),
      prisma.actionTaken.count({ where: openActions }),
      prisma.actionTaken.findMany({
        where: openActions,
        orderBy: [{ actionAt: 'asc' }, { id: 'asc' }],
        take: RECENT_LIMIT,
        select: { id: true, ticketId: true, description: true, status: true, actionAt: true, ticket: { select: { ticketNumber: true } } },
      }),
      prisma.ticket.findMany({ orderBy: NEWEST_FIRST, take: RECENT_LIMIT, select: TICKET_SUMMARY }),
    ]);

    // Every status and priority is listed, zeros included (BR-25).
    const countFor = <K extends string>(groups: { _count: { _all: number } }[], key: K, value: string) =>
      (groups as unknown as (Record<K, string> & { _count: { _all: number } })[]).find((g) => g[key] === value)?._count._all ?? 0;
    const highPriority = countFor(priorityGroups, 'itPriority', 'HIGH');

    const body: Record<string, unknown> = {
      generatedAt: new Date().toISOString(),
      metrics: [
        { key: 'unassigned', label: 'Unassigned', count: unassigned, link: links.unassigned },
        { key: 'myTickets', label: 'My Tickets', count: myTickets, link: links.myTickets },
        { key: 'highPriority', label: 'High IT Priority', count: highPriority, link: links.highPriority },
        { key: 'myOpenActions', label: 'My Open Actions', count: myOpenActionCount, link: links.myOpenActions },
      ],
      byStatus: CURRENT_STATUSES.map((status) => ({ status, count: countFor(statusGroups, 'currentStatus', status), link: links.status(status) })),
      byItPriority: (['HIGH', 'MEDIUM', 'LOW'] as const).map((itPriority) => ({
        itPriority,
        count: countFor(priorityGroups, 'itPriority', itPriority),
        link: links.itPriority(itPriority),
      })),
      myOpenActions: myOpenActions.map(({ ticket, description, ...action }) => ({
        ...action,
        ticketNumber: ticket.ticketNumber,
        description: description.length > DESCRIPTION_PREVIEW ? `${description.slice(0, DESCRIPTION_PREVIEW - 1)}…` : description,
      })),
      recentTickets,
    };

    if (req.user!.role === 'ADMINISTRATOR') {
      const [requester, itStaff, administrator, inactive] = await Promise.all([
        prisma.user.count({ where: { role: 'REQUESTER', isActive: true } }),
        prisma.user.count({ where: { role: 'IT_STAFF', isActive: true } }),
        prisma.user.count({ where: { role: 'ADMINISTRATOR', isActive: true } }),
        prisma.user.count({ where: { isActive: false } }),
      ]);
      body.userCounts = { requester, itStaff, administrator, inactive, link: '/users' };
    }

    res.status(200).json(body);
  } catch (error) {
    console.error('GET /api/dashboard/staff failed:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to load the dashboard' } });
  }
});

export default router;
