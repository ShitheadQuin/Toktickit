import { test, expect, type Page } from '@playwright/test';
import { REQUESTER, STAFF_A, addFixtureAction, setTicketSummary, setUpActionsFixtures, signIn, tearDownActionsFixtures } from './fixtures';

// RESP-01 (AC-27), ui-spec.md 13: both dashboards, Staff Ticket Detail with Actions Taken (list and
// form) and Requester Ticket Detail at desktop, tablet and mobile. No horizontal page scroll, metric
// cards two per row on tablet and one on mobile, and the Actions table becomes cards below 992 px.
// The graded screenshots of these screens come from seeded data (docs/lab-04/tests.md, RESP-01);
// this spec is the check that runs on every build.

const VIEWPORTS = {
  desktop: { width: 1280, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 812 },
} as const;

const CARDS_PER_ROW = { desktop: 4, tablet: 2, mobile: 1 } as const;

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1); // sub-pixel rounding only
}

// Labsheet 7, "avoid clipped content": a single line field or a select whose text is wider than the
// box cuts the words off. Each one's text is measured in its own font against its inner width.
async function clippedFields(page: Page) {
  return page.locator('main input[type=text], main select').evaluateAll((fields) =>
    fields.flatMap((field) => {
      const el = field as HTMLInputElement | HTMLSelectElement;
      if (!el.offsetParent) return [];
      const text = el instanceof HTMLSelectElement ? (el.selectedOptions[0]?.text ?? '') : el.value;
      const style = getComputedStyle(el);
      const context = document.createElement('canvas').getContext('2d')!;
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const room = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      return context.measureText(text).width > room + 1 ? [`#${el.id || el.name}: "${text}"`] : [];
    }),
  );
}

// A long summary (the limit is 120 characters) so the read only Summary is a real test.
const LONG_SUMMARY = 'E2E-01 laptop will not charge with the supplied adapter or the spare one from the library desk';

// Cards sharing the first card's top edge are on its row.
async function cardsInFirstRow(page: Page) {
  const tops = await page.locator('.tt-metric-grid > *').evaluateAll((cards) => cards.map((c) => Math.round(c.getBoundingClientRect().top)));
  return tops.filter((top) => top === tops[0]).length;
}

test.describe('Lab 4 screens at three widths (RESP-01)', () => {
  let ticketId: number;

  test.beforeAll(async () => {
    ticketId = await setUpActionsFixtures();
    await addFixtureAction(ticketId, 'Checked the adapter with a meter', 'COMPLETED');
    await addFixtureAction(ticketId, 'Order a replacement adapter', 'PLANNED');
    await setTicketSummary(LONG_SUMMARY);
  });

  test.afterAll(async () => {
    await tearDownActionsFixtures();
  });

  for (const [name, size] of Object.entries(VIEWPORTS) as [keyof typeof VIEWPORTS, (typeof VIEWPORTS)[keyof typeof VIEWPORTS]][]) {
    test.describe(name, () => {
      test.use({ viewport: size });

      test(`IT Staff dashboard and Actions Taken at ${name}`, async ({ page }) => {
        await signIn(page, STAFF_A.email, '/dashboard');
        await page.locator('.tt-metric-count').first().waitFor();
        await assertNoHorizontalOverflow(page);
        expect(await cardsInFirstRow(page)).toBe(CARDS_PER_ROW[name]);

        await page.goto(`/staff/tickets/${ticketId}`);
        await page.locator('.tt-actions-table tbody tr').first().waitFor();
        await assertNoHorizontalOverflow(page);
        // Table from 992 px, stacked cards (no column headings) below it.
        await expect(page.locator('.tt-actions-table thead')).toBeVisible({ visible: name === 'desktop' });
        expect(await clippedFields(page)).toEqual([]);

        await page.getByRole('button', { name: 'Add Action' }).click();
        await page.getByRole('form', { name: 'Add Action' }).waitFor();
        await assertNoHorizontalOverflow(page);
      });

      test(`Requester dashboard and Ticket Detail at ${name}`, async ({ page }) => {
        await signIn(page, REQUESTER.email, '/dashboard');
        await page.locator('.tt-metric-count').first().waitFor();
        await assertNoHorizontalOverflow(page);
        expect(await cardsInFirstRow(page)).toBe(CARDS_PER_ROW[name]);

        await page.goto(`/tickets/${ticketId}`);
        await page.locator('.tt-actions-table tbody tr').first().waitFor();
        await assertNoHorizontalOverflow(page);
        expect(await clippedFields(page)).toEqual([]);
      });
    });
  }
});
