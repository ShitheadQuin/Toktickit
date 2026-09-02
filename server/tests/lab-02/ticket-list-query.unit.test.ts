import { describe, it, expect } from 'vitest';
import { parseTicketListQuery } from '../../src/ticket-list-helpers';

describe('parseTicketListQuery (UNIT-04, api-spec.md 4)', () => {
  it('applies every documented default when no parameters are given', () => {
    const query = parseTicketListQuery({});

    expect(query.sort).toBe('ticketDate');
    expect(query.order).toBe('desc');
    expect(query.page).toBe(1);
    expect(query.pageSize).toBe(10);
    expect(query.matchesNothing).toBe(false);
    expect(query.search).toBeUndefined();
    expect(query.categoryId).toBeUndefined();
    expect(query.relatedSystemId).toBeUndefined();
    expect(query.currentStatus).toBeUndefined();
    expect(query.requestedPriority).toBeUndefined();
  });

  it('passes through every permitted sort value, including updatedAt (BR-28)', () => {
    for (const sort of ['ticketDate', 'ticketNumber', 'requestedPriority', 'currentStatus', 'updatedAt']) {
      expect(parseTicketListQuery({ sort }).sort).toBe(sort);
    }
  });

  it('replaces an unrecognized sort or order with its default', () => {
    expect(parseTicketListQuery({ sort: 'summary' }).sort).toBe('ticketDate');
    expect(parseTicketListQuery({ sort: '' }).sort).toBe('ticketDate');
    expect(parseTicketListQuery({ order: 'sideways' }).order).toBe('desc');
    expect(parseTicketListQuery({ order: 'ASC' }).order).toBe('asc');
  });

  it('replaces a non-numeric, zero, negative or fractional page with 1', () => {
    expect(parseTicketListQuery({ page: 'two' }).page).toBe(1);
    expect(parseTicketListQuery({ page: '0' }).page).toBe(1);
    expect(parseTicketListQuery({ page: '-3' }).page).toBe(1);
    expect(parseTicketListQuery({ page: '2.5' }).page).toBe(1);
    expect(parseTicketListQuery({ page: '4' }).page).toBe(4);
  });

  it('accepts only the three permitted page sizes and defaults the rest to 10', () => {
    expect(parseTicketListQuery({ pageSize: '5' }).pageSize).toBe(5);
    expect(parseTicketListQuery({ pageSize: '10' }).pageSize).toBe(10);
    expect(parseTicketListQuery({ pageSize: '20' }).pageSize).toBe(20);
    expect(parseTicketListQuery({ pageSize: '7' }).pageSize).toBe(10);
    expect(parseTicketListQuery({ pageSize: '1000' }).pageSize).toBe(10);
    expect(parseTicketListQuery({ pageSize: 'all' }).pageSize).toBe(10);
  });

  it('trims the search term and treats a blank one as absent', () => {
    expect(parseTicketListQuery({ search: '  laptop  ' }).search).toBe('laptop');
    expect(parseTicketListQuery({ search: '   ' }).search).toBeUndefined();
    expect(parseTicketListQuery({ search: '' }).search).toBeUndefined();
  });

  it('accepts numeric category and relatedSystem ids', () => {
    const query = parseTicketListQuery({ category: '2', relatedSystem: '3' });

    expect(query.categoryId).toBe(2);
    expect(query.relatedSystemId).toBe(3);
    expect(query.matchesNothing).toBe(false);
  });

  it('accepts currentStatus and requestedPriority values that exist in the enums', () => {
    const query = parseTicketListQuery({ currentStatus: 'NEW', requestedPriority: 'HIGH' });

    expect(query.currentStatus).toBe('NEW');
    expect(query.requestedPriority).toBe('HIGH');
    expect(query.matchesNothing).toBe(false);
  });

  it('flags a malformed filter as matching nothing rather than dropping it', () => {
    // api-spec.md 4: a filter value no Ticket can carry yields zero results. Dropping it would
    // widen the result set instead of narrowing it, showing more than the Requester asked for.
    expect(parseTicketListQuery({ category: 'abc' }).matchesNothing).toBe(true);
    expect(parseTicketListQuery({ relatedSystem: '12x' }).matchesNothing).toBe(true);
    expect(parseTicketListQuery({ currentStatus: 'CLOSED' }).matchesNothing).toBe(true);
    expect(parseTicketListQuery({ requestedPriority: 'URGENT' }).matchesNothing).toBe(true);
  });

  it('treats a blank filter as absent, not as matching nothing', () => {
    // A filter <select> whose "All" option has value="" sends `category=` on every reset.
    // Reading that as an impossible filter would blank the screen whenever a filter is cleared.
    const query = parseTicketListQuery({ category: '', relatedSystem: '', currentStatus: '', requestedPriority: '' });

    expect(query.matchesNothing).toBe(false);
    expect(query.categoryId).toBeUndefined();
    expect(query.relatedSystemId).toBeUndefined();
    expect(query.currentStatus).toBeUndefined();
    expect(query.requestedPriority).toBeUndefined();
  });

  it('still applies presentation defaults on a query whose filter matches nothing', () => {
    const query = parseTicketListQuery({ currentStatus: 'CLOSED', sort: 'nonsense', page: 'x' });

    expect(query.matchesNothing).toBe(true);
    expect(query.sort).toBe('ticketDate');
    expect(query.page).toBe(1);
  });

  it('uses the first value when Express parses a repeated parameter into an array', () => {
    // ?page=2&page=9 arrives as ['2', '9']; the helper must not stringify the array into NaN.
    expect(parseTicketListQuery({ page: ['2', '9'] }).page).toBe(2);
    expect(parseTicketListQuery({ sort: ['updatedAt', 'ticketNumber'] }).sort).toBe('updatedAt');
  });
});
