import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ACTION_STATUS_BADGE_CLASS, FOLLOW_UP_FLAG_CLASS } from '../../src/components/badge-classes';

// STYLE-01 - docs/lab-04/ui-spec.md 11. Same guard as Lab 3's STYLE-03: jsdom never loads
// theme.css, so a badge class with no rule would render uncoloured without any test noticing.
const themeCss = readFileSync(path.resolve(__dirname, '../../src/theme.css'), 'utf8');
const hasRule = (cssClass: string) => new RegExp(`\\.${cssClass}\\s*(\\{|,)`).test(themeCss);

describe('Action badge classes (STYLE-01)', () => {
  it('maps all 4 Action statuses to the class names in ui-spec.md 11', () => {
    expect(ACTION_STATUS_BADGE_CLASS).toEqual({
      PLANNED: 'tt-badge-action-planned',
      IN_PROGRESS: 'tt-badge-action-in-progress',
      COMPLETED: 'tt-badge-action-completed',
      CANCELLED: 'tt-badge-action-cancelled',
    });
    expect(FOLLOW_UP_FLAG_CLASS).toBe('tt-flag-follow-up');
  });

  it('has a theme.css rule for every Action badge class and the follow up flag', () => {
    const missing = [...Object.values(ACTION_STATUS_BADGE_CLASS), FOLLOW_UP_FLAG_CLASS].filter((cssClass) => !hasRule(cssClass));
    expect(missing).toEqual([]);
  });
});
