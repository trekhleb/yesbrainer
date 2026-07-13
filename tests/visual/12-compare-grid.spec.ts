/**
 * The desktop Compare grid: with ≤3 seats and a lane
 * wide enough to give every card a ≥360px column, the answer + voting
 * carousels flatten into side-by-side, full-opacity columns and the pager
 * demotes to a roster legend (no active segment).
 *
 * These shots pin the 3-up grid on a collapsed-rail lane (measured 1347px
 * ≥ the 3×360+32 = 1112px gate at the 1440×900 project viewport). The
 * *expanded*-sidebar lane at 1440 measures 1103px — 9px under the gate —
 * so that state stays a carousel and the 05-council-trial baselines pin
 * it. Desktop-only: no phone lane passes the 2×360+16 fit check, so
 * mobile keeps the carousel by construction.
 */

import { expect, test } from '@playwright/test'
import { SEEDED_STATE, gotoCouncil } from './helpers'

test.use({ storageState: SEEDED_STATE })

test('compare grid: 3-up answers on a collapsed-rail lane', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'grid is desktop-only — phones never pass the width fit')
  await gotoCouncil(page, 'vf-trial')
  await page.getByRole('button', { name: 'Close sidebar' }).click()
  await expect(
    page.getByRole('button', { name: 'Open sidebar' }),
  ).toBeVisible()
  // Read the conversation from the top — turn 1's question + answer grid.
  await page
    .getByText('Should our five-person startup build the product')
    .scrollIntoViewIfNeeded()
  await expect(page).toHaveScreenshot('compare-grid-answers.png')
})

test('compare grid: voting lane follows the same rule', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'grid is desktop-only — phones never pass the width fit')
  await gotoCouncil(page, 'vf-trial')
  await page.getByRole('button', { name: 'Close sidebar' }).click()
  await expect(
    page.getByRole('button', { name: 'Open sidebar' }),
  ).toBeVisible()
  // Turn 1's Voting stage — the sticky header sits at the section top, so
  // scrolling it into view frames the three vote cards side-by-side.
  await page.getByText('Voting', { exact: true }).first().scrollIntoViewIfNeeded()
  await expect(page).toHaveScreenshot('compare-grid-voting.png')
})
