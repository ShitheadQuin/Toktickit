// specification.md BR-16: a Ticket may move to Resolved only with at least one Completed Action and
// no Action still Planned or In Progress. Cancelled Actions are ignored, so a withdrawn Action never
// blocks resolution. Pure, so UNIT-03 needs no database; the route counts inside its transaction.
export type GateResult = { completed: number; open: number; met: boolean };

export function evaluateResolutionGate(actionStatuses: string[]): GateResult {
  const completed = actionStatuses.filter((s) => s === 'COMPLETED').length;
  const open = actionStatuses.filter((s) => s === 'PLANNED' || s === 'IN_PROGRESS').length;
  return { completed, open, met: completed >= 1 && open === 0 };
}
