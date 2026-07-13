/**
 * The degenerate "Parallel of one" council (`vf-solo`) — a single-seat
 * roster renders as a plain single-column chat, indistinguishable from a
 * regular model chat. Also the home of the fenced-code-block shot
 * (Shiki syntax highlighting inside model output).
 */

import { expect, test } from '@playwright/test'
import { COUNCIL_IDS } from './fixtures/bundle'
import { SEEDED_STATE, gotoCouncil } from './helpers'

test.use({ storageState: SEEDED_STATE })

test('single-seat council reads as a plain chat', async ({ page }) => {
  await gotoCouncil(page, COUNCIL_IDS.solo)
  // Shiki decorates fenced blocks with a `.shiki` <pre>; wait for it so the
  // shot never races the highlighter.
  await page.locator('pre.shiki').first().waitFor()
  await page
    .getByText('Write a regex that validates ISO-8601')
    .scrollIntoViewIfNeeded()
  await expect(page).toHaveScreenshot('solo-chat-code-blocks.png')
})
