/**
 * Parallel-answers council states (`vf-parallel`): the multi-column
 * answer fan-out with rich markdown + a tool-call strip, the
 * image-attachment turn (user bubble thumbnails, lightbox, and the
 * ghosted non-vision seat), and an errored seat with its retry
 * affordance. On mobile the same turns render behind the segmented
 * answer pager.
 */

import { expect, test } from '@playwright/test'
import { COUNCIL_IDS } from './fixtures/bundle'
import { SEEDED_STATE, gotoCouncil } from './helpers'

test.use({ storageState: SEEDED_STATE })

test.beforeEach(async ({ page }) => {
  await gotoCouncil(page, COUNCIL_IDS.parallel)
})

test('answer fan-out with markdown and a tool call', async ({ page }) => {
  const turn1 = page.locator('section[aria-label="Roundtable"]').first()
  await turn1.scrollIntoViewIfNeeded()
  await expect(page).toHaveScreenshot('parallel-answers.png')
})

test('mobile pager: switch to another answer', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the pager only renders on narrow screens')
  const turn1 = page.locator('section[aria-label="Roundtable"]').first()
  await turn1.scrollIntoViewIfNeeded()
  await turn1.getByRole('tab', { name: 'GPT-5.4' }).click()
  await expect(page).toHaveScreenshot('parallel-answers-second-tab.png')
})

test('image-attachment turn with a ghosted non-vision seat', async ({
  page,
}) => {
  await page
    .getByText('Here is my current brokerage allocation')
    .scrollIntoViewIfNeeded()
  await expect(
    page.getByRole('button', { name: 'Open image attachment' }).first(),
  ).toBeVisible()
  await expect(page).toHaveScreenshot('parallel-image-turn.png')

  // The non-vision Groq seat is deliberately skipped with a ghost pane.
  const ghost = page.getByText(
    "Skipped: this model doesn't support image inputs.",
  )
  await ghost.scrollIntoViewIfNeeded()
  await expect(page).toHaveScreenshot('parallel-ghost-pane.png')
})

test('image lightbox', async ({ page }) => {
  await page
    .getByRole('button', { name: 'Open image attachment' })
    .first()
    .click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page).toHaveScreenshot('parallel-image-lightbox.png')
})

test('errored seat with retry', async ({ page }) => {
  const turn3 = page.locator('section[aria-label="Roundtable"]').nth(2)
  await turn3.scrollIntoViewIfNeeded()
  await expect(
    turn3.getByText('RESOURCE_EXHAUSTED', { exact: false }).first(),
  ).toBeVisible()
  await expect(page).toHaveScreenshot('parallel-seat-error.png')
})
