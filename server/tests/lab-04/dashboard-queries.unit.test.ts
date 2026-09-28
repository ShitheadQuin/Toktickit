import { describe, it, expect } from 'vitest';
import { ACTIVE_STATUSES, recentlyResolvedSince, requesterMetricLinks, staffMetricLinks } from '../../src/dashboard-queries';

// UNIT-04 - AC-21, specification.md BR-21 and BR-26: the definitions every dashboard figure is
// built from, checked with no request or database.
describe('Dashboard definitions (UNIT-04, BR-21, BR-26)', () => {
  it('treats exactly New, Open, In Progress, Waiting for Requester and Reopened as active', () => {
    expect([...ACTIVE_STATUSES].sort()).toEqual(['IN_PROGRESS', 'NEW', 'OPEN', 'REOPENED', 'WAITING_FOR_REQUESTER']);
  });

  it('links each Requester figure to the My Tickets filter BR-26 names', () => {
    expect(requesterMetricLinks).toEqual({
      myOpen: '/my-tickets?statusGroup=active',
      waitingForMe: '/my-tickets?currentStatus=WAITING_FOR_REQUESTER',
      resolved: '/my-tickets?currentStatus=RESOLVED',
      closed: '/my-tickets?currentStatus=CLOSED',
    });
  });

  it('links each Staff figure to the Ticket Queue filter BR-26 names, using the viewer\'s own id', () => {
    expect(staffMetricLinks(12)).toEqual({
      unassigned: '/staff/queue?owner=unassigned&statusGroup=active',
      myTickets: '/staff/queue?owner=12&statusGroup=active',
      highPriority: '/staff/queue?itPriority=HIGH&statusGroup=active',
      myOpenActions: null,
      status: expect.any(Function),
      itPriority: expect.any(Function),
    });
    expect(staffMetricLinks(12).status('WAITING_FOR_REQUESTER')).toBe('/staff/queue?status=WAITING_FOR_REQUESTER');
    expect(staffMetricLinks(12).itPriority('LOW')).toBe('/staff/queue?itPriority=LOW&statusGroup=active');
  });

  it('counts "recently resolved" from exactly seven 24-hour days before now', () => {
    const now = new Date('2026-10-16T07:00:00Z');
    expect(recentlyResolvedSince(now).toISOString()).toBe('2026-10-09T07:00:00.000Z');
  });
});
