import { describe, it, expect } from 'vitest';
import { ACTION_STATUSES, canCreateWithStatus, checkActionStatusChange, validateActionInput } from '../../src/action-rules';

// specification.md BR-06 to BR-09. Pure rules only: no database, no request.

describe('Action status rules (UNIT-01, BR-09)', () => {
  const allowed: Record<string, string[]> = {
    PLANNED: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
    IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
    COMPLETED: [],
    CANCELLED: [],
  };

  for (const from of ACTION_STATUSES) {
    for (const to of ACTION_STATUSES) {
      if (from === to) continue;
      const expected = allowed[from]!.includes(to);
      it(`${from} -> ${to} is ${expected ? 'allowed' : 'refused'}`, () => {
        expect(checkActionStatusChange(from, to)).toBe(expected);
      });
    }
  }

  it('lets an Action be created as Planned, In Progress or Completed, never Cancelled', () => {
    expect(canCreateWithStatus('PLANNED')).toBe(true);
    expect(canCreateWithStatus('IN_PROGRESS')).toBe(true);
    expect(canCreateWithStatus('COMPLETED')).toBe(true);
    expect(canCreateWithStatus('CANCELLED')).toBe(false);
  });
});

describe('Action validator (UNIT-02, BR-06, BR-07, BR-08)', () => {
  const now = new Date('2026-10-08T10:00:00Z');
  const ticketCreatedAt = new Date('2026-10-01T00:00:00Z');
  const context = { now, ticketCreatedAt };
  const valid = {
    actionAt: '2026-10-08T09:00:00Z',
    description: 'Checked the charger',
    status: 'PLANNED',
    followUpRequired: false,
  };
  const fieldsOf = (input: Record<string, unknown>) => validateActionInput(input, context).fields.map((f) => f.field);

  it('accepts a valid Action and trims its text', () => {
    const result = validateActionInput({ ...valid, description: '  Checked the charger  ' }, context);
    expect(result.fields).toEqual([]);
    expect(result.value.description).toBe('Checked the charger');
    expect(result.value.result).toBeNull();
    expect(result.value.followUpNote).toBeNull();
    expect(result.value.attachmentNotes).toBeNull();
  });

  it('rejects a date before the Ticket was created, and accepts the creation time itself', () => {
    expect(fieldsOf({ ...valid, actionAt: '2026-09-30T23:59:59Z' })).toEqual(['actionAt']);
    expect(fieldsOf({ ...valid, actionAt: '2026-10-01T00:00:00Z' })).toEqual([]);
  });

  it('allows up to 5 minutes in the future for clock drift, and no more', () => {
    expect(fieldsOf({ ...valid, actionAt: '2026-10-08T10:05:00Z' })).toEqual([]);
    expect(fieldsOf({ ...valid, actionAt: '2026-10-08T10:05:01Z' })).toEqual(['actionAt']);
  });

  it('rejects a date that is not a date', () => {
    expect(fieldsOf({ ...valid, actionAt: 'yesterday' })).toEqual(['actionAt']);
  });

  it('requires a description of 1 to 2,000 characters', () => {
    expect(fieldsOf({ ...valid, description: '   ' })).toEqual(['description']);
    expect(fieldsOf({ ...valid, description: 'x'.repeat(2000) })).toEqual([]);
    expect(fieldsOf({ ...valid, description: 'x'.repeat(2001) })).toEqual(['description']);
  });

  it('requires a result when the Action is Completed, up to 2,000 characters', () => {
    expect(fieldsOf({ ...valid, status: 'COMPLETED' })).toEqual(['result']);
    expect(fieldsOf({ ...valid, status: 'COMPLETED', result: '  ' })).toEqual(['result']);
    expect(fieldsOf({ ...valid, status: 'COMPLETED', result: 'x'.repeat(2000) })).toEqual([]);
    expect(fieldsOf({ ...valid, result: 'x'.repeat(2001) })).toEqual(['result']);
  });

  it('requires a follow up note only when follow up is ticked', () => {
    expect(fieldsOf({ ...valid, followUpRequired: true })).toEqual(['followUpNote']);
    expect(fieldsOf({ ...valid, followUpRequired: true, followUpNote: 'x'.repeat(2001) })).toEqual(['followUpNote']);
    expect(fieldsOf({ ...valid, followUpRequired: true, followUpNote: 'Check next week' })).toEqual([]);
  });

  it('discards a follow up note when follow up is not ticked', () => {
    const result = validateActionInput({ ...valid, followUpRequired: false, followUpNote: 'stray note' }, context);
    expect(result.fields).toEqual([]);
    expect(result.value.followUpNote).toBeNull();
  });

  it('caps attachment notes at 500 characters', () => {
    expect(fieldsOf({ ...valid, attachmentNotes: 'x'.repeat(500) })).toEqual([]);
    expect(fieldsOf({ ...valid, attachmentNotes: 'x'.repeat(501) })).toEqual(['attachmentNotes']);
  });

  it('rejects an unknown status and a non-boolean follow up flag', () => {
    expect(fieldsOf({ ...valid, status: 'DONE' })).toEqual(['status']);
    expect(fieldsOf({ ...valid, followUpRequired: 'yes' })).toEqual(['followUpRequired']);
  });

  it('reports every failing field at once', () => {
    expect(fieldsOf({ actionAt: '2020-01-01T00:00:00Z', description: '', status: 'COMPLETED', followUpRequired: true })).toEqual([
      'actionAt',
      'description',
      'result',
      'followUpNote',
    ]);
  });
});
