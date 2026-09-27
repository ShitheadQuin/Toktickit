import { describe, it, expect } from 'vitest';
import { evaluateResolutionGate } from '../../src/resolution-gate';

// UNIT-03 - AC-14, specification.md BR-16: a Ticket may be Resolved only with at least one
// Completed Action and no Action still Planned or In Progress. Cancelled Actions are ignored.
describe('Resolution gate (UNIT-03, BR-16)', () => {
  it('is not met with no Actions at all', () => {
    expect(evaluateResolutionGate([])).toEqual({ completed: 0, open: 0, met: false });
  });

  it('is not met when every Action is Cancelled', () => {
    expect(evaluateResolutionGate(['CANCELLED', 'CANCELLED'])).toEqual({ completed: 0, open: 0, met: false });
  });

  it('is not met while a Planned Action remains', () => {
    expect(evaluateResolutionGate(['COMPLETED', 'PLANNED'])).toEqual({ completed: 1, open: 1, met: false });
  });

  it('is not met while an In Progress Action remains', () => {
    expect(evaluateResolutionGate(['COMPLETED', 'IN_PROGRESS'])).toEqual({ completed: 1, open: 1, met: false });
  });

  it('is met with Completed Actions and Cancelled ones ignored', () => {
    expect(evaluateResolutionGate(['COMPLETED', 'COMPLETED', 'CANCELLED'])).toEqual({ completed: 2, open: 0, met: true });
  });
});
