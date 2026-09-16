import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { STATUS_BADGE_CLASS, ROLE_BADGE_CLASS, USER_STATUS_BADGE_CLASS } from '../../src/components/badge-classes';

// STYLE-03 - docs/lab-03/ui-spec.md 9/14. PR #44 review: a badge class with no CSS rule renders
// with no color at all and no test notices, since jsdom doesn't load theme.css. This reads the
// stylesheet as text instead, so an undefined badge class fails here rather than on screen.
// __dirname, not import.meta.url: under the jsdom environment import.meta.url isn't a file: URL.
const themeCss = readFileSync(path.resolve(__dirname, '../../src/theme.css'), 'utf8');

function hasRule(cssClass: string): boolean {
  // The class followed by `{` or `,` (a grouped selector), so a `::before`-only rule or a longer
  // class name that merely starts with this one doesn't count as a definition.
  return new RegExp(`\\.${cssClass}\\s*(\\{|,)`).test(themeCss);
}

describe('Badge classes (STYLE-03)', () => {
  it('maps all 8 statuses to the class names in ui-spec.md 14', () => {
    expect(STATUS_BADGE_CLASS).toEqual({
      NEW: 'tt-badge-status-new',
      OPEN: 'tt-badge-status-open',
      IN_PROGRESS: 'tt-badge-status-in-progress',
      WAITING_FOR_REQUESTER: 'tt-badge-status-waiting',
      RESOLVED: 'tt-badge-status-resolved',
      CLOSED: 'tt-badge-status-closed',
      REOPENED: 'tt-badge-status-reopened',
      CANCELLED: 'tt-badge-status-cancelled',
    });
  });

  it('maps all 3 roles to the class names in ui-spec.md 14', () => {
    expect(ROLE_BADGE_CLASS).toEqual({
      REQUESTER: 'tt-badge-role-requester',
      IT_STAFF: 'tt-badge-role-it-staff',
      ADMINISTRATOR: 'tt-badge-role-administrator',
    });
  });

  it('maps user Active/Inactive to their badge classes (ui-spec.md 9, 14)', () => {
    expect(USER_STATUS_BADGE_CLASS).toEqual({ ACTIVE: 'tt-badge-user-active', INACTIVE: 'tt-badge-user-inactive' });
  });

  it('has a theme.css rule for every status and role badge class', () => {
    const missing = [...Object.values(STATUS_BADGE_CLASS), ...Object.values(ROLE_BADGE_CLASS), ...Object.values(USER_STATUS_BADGE_CLASS)].filter(
      (cssClass) => !hasRule(cssClass),
    );
    expect(missing).toEqual([]);
  });
});
