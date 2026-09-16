import { describe, it, expect } from 'vitest';
import { parseStaffQueueQuery } from '../../src/staff-queue-helpers';

// UNIT-03 - api-spec.md 4: the Queue's query normalization, tested with no request or database.
// Invalid sort/order/page fall back to their defaults; a filter value no Ticket can hold yields
// zero results (matchesNothing) rather than being dropped, which would widen the results instead.
describe('parseStaffQueueQuery (UNIT-03, api-spec.md 4)', () => {
  it('applies every documented default when no parameters are given', () => {
    const query = parseStaffQueueQuery({});

    expect(query.sort).toBe('createdAt');
    expect(query.order).toBe('asc');
    expect(query.page).toBe(1);
    expect(query.pageSize).toBe(20);
    expect(query.matchesNothing).toBe(false);
    expect(query.search).toBeUndefined();
    expect(query.status).toBeUndefined();
    expect(query.itPriority).toBeUndefined();
    expect(query.owner).toBeUndefined();
  });

  it('passes through each of the three permitted sort values', () => {
    for (const sort of ['createdAt', 'itPriority', 'status']) {
      expect(parseStaffQueueQuery({ sort }).sort).toBe(sort);
    }
  });

  it('replaces an unrecognized sort or order with its default', () => {
    expect(parseStaffQueueQuery({ sort: 'summary' }).sort).toBe('createdAt');
    expect(parseStaffQueueQuery({ sort: '' }).sort).toBe('createdAt');
    expect(parseStaffQueueQuery({ order: 'sideways' }).order).toBe('asc');
    expect(parseStaffQueueQuery({ order: 'DESC' }).order).toBe('desc');
  });

  it('replaces a page that is not a whole number of at least 1 with page 1', () => {
    for (const page of ['0', '-2', '2.5', 'two', '']) {
      expect(parseStaffQueueQuery({ page }).page).toBe(1);
    }
    expect(parseStaffQueueQuery({ page: '3' }).page).toBe(3);
  });

  it('keeps the page size fixed at 20 even when a pageSize is sent (api-spec.md 9)', () => {
    expect(parseStaffQueueQuery({ pageSize: '5' }).pageSize).toBe(20);
  });

  it('trims the search term and treats a blank one as no search', () => {
    expect(parseStaffQueueQuery({ search: '  laptop  ' }).search).toBe('laptop');
    expect(parseStaffQueueQuery({ search: '   ' }).search).toBeUndefined();
  });

  it('accepts any of the 8 statuses and flags an unknown one as matching nothing', () => {
    expect(parseStaffQueueQuery({ status: 'WAITING_FOR_REQUESTER' }).status).toBe('WAITING_FOR_REQUESTER');
    expect(parseStaffQueueQuery({ status: '' }).matchesNothing).toBe(false);

    const unknown = parseStaffQueueQuery({ status: 'DONE' });
    expect(unknown.status).toBeUndefined();
    expect(unknown.matchesNothing).toBe(true);
  });

  it('accepts LOW/MEDIUM/HIGH as IT Priority and flags anything else as matching nothing', () => {
    expect(parseStaffQueueQuery({ itPriority: 'HIGH' }).itPriority).toBe('HIGH');
    expect(parseStaffQueueQuery({ itPriority: 'URGENT' }).matchesNothing).toBe(true);
  });

  it('reads owner as "unassigned" or a user id, and flags anything else as matching nothing', () => {
    expect(parseStaffQueueQuery({ owner: 'unassigned' }).owner).toBe('unassigned');
    expect(parseStaffQueueQuery({ owner: '12' }).owner).toBe(12);
    expect(parseStaffQueueQuery({ owner: '' }).owner).toBeUndefined();

    for (const owner of ['me', '0', '-4', 'abc']) {
      const query = parseStaffQueueQuery({ owner });
      expect(query.owner).toBeUndefined();
      expect(query.matchesNothing).toBe(true);
    }
  });

  it('takes the first value when a parameter is repeated', () => {
    expect(parseStaffQueueQuery({ page: ['2', '9'] }).page).toBe(2);
    expect(parseStaffQueueQuery({ sort: ['status', 'createdAt'] }).sort).toBe('status');
  });
});
