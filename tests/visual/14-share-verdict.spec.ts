/**
 * Share-the-result card — the share affordance on the
 * Judge verdict, the final Mediator round, and the Parallel answer fan-out,
 * plus the canvas-rendered card each previews.
 *
 * Two kinds of coverage:
 *  - **Visual snapshots** of the rendered card (`toHaveScreenshot`) — these
 *    bake in the card's fonts, so like every baseline in this suite they're
 *    born on the canonical runner (`test:visual:update`), not in a
 *    fonts-differ container.
 *  - **Content assertions** via the "Copy text" output — font-independent
 *    and machine-independent, so they lock what the card *says* (question,
 *    process line, verdict / column excerpts) even where the pixel baseline
 *    can't be trusted. This is the regression net for `buildShareCardData`.
 *
 * One card per structure: Trial verdict + peer line, Consensus synthesis,
 * Parallel columns panorama.
 */

import { expect, test, type Locator, type Page } from '@playwright/test'
import { COUNCIL_IDS } from './fixtures/bundle'
import { gotoCouncil, SEEDED_STATE } from './helpers'

// Clipboard read/write for the "Copy text" content assertions (Chromium
// honours these with permission granted).
test.use({
  storageState: SEEDED_STATE,
  permissions: ['clipboard-read', 'clipboard-write'],
})

async function openShare(
  page: Page,
  councilId: string,
  triggerLabel: string,
  /** Which matching trigger to open — Parallel councils wear one "Share
   *  answers" per turn, so `1` shares the second turn. */
  nth = 0,
): Promise<Locator> {
  await gotoCouncil(page, councilId)
  await page.getByLabel(triggerLabel).nth(nth).click()
  const img = page.getByAltText('Share card preview')
  await img.waitFor()
  await expect
    .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBeGreaterThan(0)
  // The painter's contract: 1200×900 (4:3) at the 2× backing scale.
  expect(
    await img.evaluate((el: HTMLImageElement) => [
      el.naturalWidth,
      el.naturalHeight,
    ]),
  ).toEqual([2400, 1800])
  return img
}

/** Click "Copy text" and return what landed on the clipboard. */
async function copiedText(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Copy text' }).click()
  return page.evaluate(() => navigator.clipboard.readText())
}

test('trial: verdict card — visual + content + actions', async ({ page }) => {
  await openShare(page, COUNCIL_IDS.trial, 'Share verdict')
  await expect(
    page.getByRole('button', { name: 'Download PNG' }),
  ).toBeVisible()

  const text = await copiedText(page)
  expect(text).toContain('monolith or as microservices') // the question
  expect(text).toContain('one Judge ruled') // Trial process line
  expect(text).toContain('Verdict by Claude Opus 4.8') // credit line
  expect(text).toContain('https://yesbrainer.ai')

  await expect(page.getByRole('dialog')).toHaveScreenshot(
    'share-verdict-modal.png',
  )
})

test('consensus: synthesis card — visual + content', async ({ page }) => {
  await openShare(page, COUNCIL_IDS.consensusA, 'Share consensus')

  const text = await copiedText(page)
  expect(text).toContain('remote-first or hybrid') // the question
  expect(text).toContain('consensus reached') // Consensus process line
  expect(text).toContain('Consensus by Claude Opus 4.8')

  await expect(page.getByRole('dialog')).toHaveScreenshot(
    'share-consensus-modal.png',
  )
})

test('parallel: columns panorama — visual + content', async ({ page }) => {
  // Parallel shares from the answer fan-out's stage header ("Share
  // answers"), not a verdict block — the fan-out IS the result.
  await openShare(page, COUNCIL_IDS.parallel, 'Share answers')

  const text = await copiedText(page)
  expect(text).toContain('traditional IRA to Roth') // the question
  expect(text).toContain('answered independently') // Parallel process line
  // Each column's model is named in the copied panorama.
  expect(text).toContain('Claude Sonnet 5:')
  expect(text).toContain('GPT-5.4:')

  await expect(page.getByRole('dialog')).toHaveScreenshot(
    'share-parallel-modal.png',
  )
})

test('parallel: an image turn carries its attachment onto the card', async ({
  page,
}) => {
  // Turn 2 asked about two attached images (chart + statement): the card
  // paints the first as a thumbnail beside the question, and the copy text
  // names the attachments it can't carry.
  await openShare(page, COUNCIL_IDS.parallel, 'Share answers', 1)

  const text = await copiedText(page)
  expect(text).toContain('year-to-date statement') // the question
  expect(text).toContain('(asked about 2 attached images)')

  await expect(page.getByRole('dialog')).toHaveScreenshot(
    'share-parallel-image-modal.png',
  )
})
