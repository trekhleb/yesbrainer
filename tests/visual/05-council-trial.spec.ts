/**
 * Trial-verdict council states (`vf-trial`): the answer round, the gold
 * Voting block (per-target leaderboard cards, agreement read, winner
 * trophy), the expanded per-voter detail (stars + comments), the Judge's
 * synthesized verdict, and a turn whose voting partially failed (errored
 * voter + "retry failed voters").
 */

import { expect, test } from '@playwright/test'
import { COUNCIL_IDS } from './fixtures/bundle'
import { SEEDED_STATE, gotoCouncil } from './helpers'

test.use({ storageState: SEEDED_STATE })

test.beforeEach(async ({ page }) => {
  await gotoCouncil(page, COUNCIL_IDS.trial)
})

test('answer round', async ({ page }) => {
  const turn1 = page.locator('section[aria-label="Roundtable"]').first()
  await turn1.scrollIntoViewIfNeeded()
  await expect(page).toHaveScreenshot('trial-answers.png')
})

test('voting leaderboard', async ({ page }) => {
  const voting = page.locator('section[aria-label="Voting"]').first()
  await voting.scrollIntoViewIfNeeded()
  await expect(page).toHaveScreenshot('trial-voting.png')
})

test('voting: per-voter detail expanded', async ({ page }) => {
  const voting = page.locator('section[aria-label="Voting"]').first()
  await voting.scrollIntoViewIfNeeded()
  await voting
    .getByRole('button', { name: /How others voted/ })
    .first()
    .click()
  await expect(page).toHaveScreenshot('trial-vote-details.png')
})

test('judge verdict', async ({ page }) => {
  const judge = page.locator('section[aria-label="Judge"]')
  await judge.scrollIntoViewIfNeeded()
  await expect(page).toHaveScreenshot('trial-judge-verdict.png')
})

test('errored voter with retry-failed-votes', async ({ page }) => {
  const voting = page.locator('section[aria-label="Voting"]').nth(1)
  await voting.scrollIntoViewIfNeeded()
  await expect(
    voting.getByRole('button', { name: 'Retry failed voters' }),
  ).toBeVisible()
  await expect(page).toHaveScreenshot('trial-vote-error.png')
})
