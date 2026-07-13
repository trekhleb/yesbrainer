/**
 * Dark-theme variants of the headline surfaces. The app's default theme
 * mode is `system`, so `colorScheme: 'dark'` flips the whole shell; one
 * representative shot per surface family rather than a full matrix —
 * the light suite already covers every state, this guards the second
 * palette.
 */

import { expect, test } from '@playwright/test'
import { COUNCIL_IDS } from './fixtures/bundle'
import {
  FRESH_STATE,
  SEEDED_STATE,
  composerInput,
  gotoCouncil,
} from './helpers'

test.use({ storageState: SEEDED_STATE, colorScheme: 'dark' })

test('dark: frontpage', async ({ page }) => {
  await page.goto('/')
  await composerInput(page).waitFor()
  await page
    .getByText('Should our five-person startup build the product')
    .scrollIntoViewIfNeeded()
  await expect(page).toHaveScreenshot('dark-frontpage.png')
})

test('dark: parallel answers', async ({ page }) => {
  await gotoCouncil(page, COUNCIL_IDS.parallel)
  await page
    .locator('section[aria-label="Roundtable"]')
    .first()
    .scrollIntoViewIfNeeded()
  await expect(page).toHaveScreenshot('dark-parallel-answers.png')
})

test('dark: trial voting', async ({ page }) => {
  await gotoCouncil(page, COUNCIL_IDS.trial)
  await page
    .locator('section[aria-label="Voting"]')
    .first()
    .scrollIntoViewIfNeeded()
  await expect(page).toHaveScreenshot('dark-trial-voting.png')
})

test('dark: judge verdict', async ({ page }) => {
  await gotoCouncil(page, COUNCIL_IDS.trial)
  await page
    .locator('section[aria-label="Judge"]')
    .scrollIntoViewIfNeeded()
  await expect(page).toHaveScreenshot('dark-judge-verdict.png')
})

test('dark: consensus final summary', async ({ page }) => {
  await gotoCouncil(page, COUNCIL_IDS.consensusA)
  await page
    .locator('section[aria-label="Mediator"]')
    .nth(1)
    .scrollIntoViewIfNeeded()
  await expect(page).toHaveScreenshot('dark-consensus-final.png')
})

test('dark: settings keys', async ({ page }) => {
  await page.goto('/settings/keys')
  await expect(page.getByText('You own your keys.')).toBeVisible()
  await expect(page).toHaveScreenshot('dark-settings-keys.png')
})

test('dark: new council modal', async ({ page }) => {
  // Open over a valid council route so the `/` auto-redirect doesn't strip
  // the ?new-council param and close the modal.
  await page.goto(`/council/${COUNCIL_IDS.trial}?new-council=1`)
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Create', exact: true }).waitFor()
  // Force-click past the segmented control's mount animation.
  await page
    .getByRole('option', { name: /Trial verdict/ })
    .click({ force: true })
  await expect(page.getByText('Judge').first()).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveScreenshot(
    'dark-new-council-modal.png',
  )
})

test.describe('fresh profile', () => {
  test.use({ storageState: FRESH_STATE })

  test('dark: onboarding gate', async ({ page }) => {
    await page.goto('/')
    await expect(
      page.getByRole('button', { name: 'Add your keys to begin' }),
    ).toBeVisible()
    await expect(page).toHaveScreenshot('dark-onboarding-gate.png')
  })
})
