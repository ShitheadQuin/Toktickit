import { describe, it, expect } from 'vitest';
import { formatTicketNumber } from '../../src/ticket-helpers';

describe('formatTicketNumber (UNIT-01, BR-01/FR-05)', () => {
  it('formats a sequence number as TKT-<year>-<6 digits>', () => {
    expect(formatTicketNumber(2026, 42)).toBe('TKT-2026-000042');
  });

  it('pads a single-digit sequence to six digits', () => {
    expect(formatTicketNumber(2026, 1)).toBe('TKT-2026-000001');
  });

  it('accepts the bigint the database sequence returns', () => {
    expect(formatTicketNumber(2026, 42n)).toBe('TKT-2026-000042');
  });

  it('uses the year it is given rather than the current year', () => {
    expect(formatTicketNumber(2027, 1)).toBe('TKT-2027-000001');
  });

  it('grows past six digits instead of truncating', () => {
    expect(formatTicketNumber(2026, 1234567)).toBe('TKT-2026-1234567');
  });
});
