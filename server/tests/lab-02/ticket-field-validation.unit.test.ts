import { describe, it, expect } from 'vitest';
import { validateTicketText } from '../../src/ticket-helpers';

const valid = (n: number) => 'a'.repeat(n);

describe('validateTicketText (UNIT-03, BR-11)', () => {
  it('trims surrounding whitespace from both fields', () => {
    const result = validateTicketText('  Printer broken  ', '  The office printer jams.  ');
    expect(result.summary).toBe('Printer broken');
    expect(result.description).toBe('The office printer jams.');
    expect(result.errors).toEqual([]);
  });

  it('accepts summary at both boundaries (5 and 120)', () => {
    expect(validateTicketText(valid(5), valid(10)).errors).toEqual([]);
    expect(validateTicketText(valid(120), valid(10)).errors).toEqual([]);
  });

  it('rejects summary just outside the boundaries (4 and 121)', () => {
    expect(validateTicketText(valid(4), valid(10)).errors).toEqual([
      { field: 'summary', message: 'summary must be 5-120 characters' },
    ]);
    expect(validateTicketText(valid(121), valid(10)).errors).toEqual([
      { field: 'summary', message: 'summary must be 5-120 characters' },
    ]);
  });

  it('accepts description at both boundaries (10 and 2000) and rejects just outside', () => {
    expect(validateTicketText(valid(5), valid(10)).errors).toEqual([]);
    expect(validateTicketText(valid(5), valid(2000)).errors).toEqual([]);
    expect(validateTicketText(valid(5), valid(9)).errors).toEqual([
      { field: 'description', message: 'description must be 10-2000 characters' },
    ]);
    expect(validateTicketText(valid(5), valid(2001)).errors).toEqual([
      { field: 'description', message: 'description must be 10-2000 characters' },
    ]);
  });

  it('treats a whitespace-only value as empty and rejects it', () => {
    const result = validateTicketText('     ', valid(10));
    expect(result.summary).toBe('');
    expect(result.errors).toEqual([
      { field: 'summary', message: 'summary must be 5-120 characters' },
    ]);
  });

  it('rejects non-string values without throwing', () => {
    expect(() => validateTicketText(undefined, 42)).not.toThrow();
    expect(validateTicketText(undefined, 42).errors).toEqual([
      { field: 'summary', message: 'summary must be 5-120 characters' },
      { field: 'description', message: 'description must be 10-2000 characters' },
    ]);
  });

  it('returns both errors together when both fields are invalid', () => {
    const result = validateTicketText('abc', 'short');
    expect(result.errors).toHaveLength(2);
    expect(result.errors.map((e) => e.field)).toEqual(['summary', 'description']);
  });
});
