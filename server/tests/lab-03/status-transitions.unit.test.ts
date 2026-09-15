import { describe, it, expect } from 'vitest';
import { checkTransition } from '../../src/status-transitions';
import type { CurrentStatusValue } from '../../src/ticket-list-helpers';

// UNIT-02 - specification.md 11: the status transition matrix as a pure lookup, tested for every
// (from, to) pair with no request or database. Claiming is its own endpoint, so the claim row
// (New -> Open, no ownership) is not part of this lookup; the owner's New -> Open is.
const STATUSES: CurrentStatusValue[] = [
  'NEW',
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_REQUESTER',
  'RESOLVED',
  'CLOSED',
  'REOPENED',
  'CANCELLED',
];

// [from, to, requiresOwnership]
const PERMITTED: [CurrentStatusValue, CurrentStatusValue, boolean][] = [
  ['NEW', 'OPEN', true],
  ['OPEN', 'IN_PROGRESS', true],
  ['IN_PROGRESS', 'WAITING_FOR_REQUESTER', true],
  ['WAITING_FOR_REQUESTER', 'IN_PROGRESS', true],
  ['IN_PROGRESS', 'RESOLVED', true],
  ['WAITING_FOR_REQUESTER', 'RESOLVED', true],
  ['RESOLVED', 'CLOSED', true],
  ['RESOLVED', 'REOPENED', false],
  ['CLOSED', 'REOPENED', false],
  ['REOPENED', 'IN_PROGRESS', true],
  ['NEW', 'CANCELLED', false],
  ['OPEN', 'CANCELLED', false],
];

const isPermitted = (from: CurrentStatusValue, to: CurrentStatusValue) =>
  PERMITTED.some(([f, t]) => f === from && t === to);

describe('checkTransition (UNIT-02, specification.md 11)', () => {
  it('permits each of the 12 matrix transitions with its documented ownership rule', () => {
    for (const [from, to, requiresOwnership] of PERMITTED) {
      expect(checkTransition(from, to), `${from} -> ${to}`).toEqual({ allowed: true, requiresOwnership });
    }
  });

  it('rejects all 52 other pairs, including staying in the same status', () => {
    let rejected = 0;
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        if (isPermitted(from, to)) continue;
        expect(checkTransition(from, to), `${from} -> ${to}`).toEqual({ allowed: false });
        rejected++;
      }
    }
    expect(rejected).toBe(52);
  });

  it('lets a Reopened Ticket move forward again (Issue #38 matrix fix)', () => {
    expect(checkTransition('REOPENED', 'IN_PROGRESS')).toEqual({ allowed: true, requiresOwnership: true });
  });

  it('leaves Cancelled with no way out', () => {
    for (const to of STATUSES) {
      expect(checkTransition('CANCELLED', to)).toEqual({ allowed: false });
    }
  });
});
