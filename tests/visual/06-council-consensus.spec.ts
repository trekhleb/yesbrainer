/**
 * Consensus-debate council states. `vf-consensus-a` converges on round 2:
 * the opening fan-out, the Mediator's divergence assessment (with the
 * per-round movement digest), the Participants' reconsider round, and the
 * final consensus summary. `vf-consensus-b` hits the round cap still
 * divergent (agreements + remaining conflicts) and has a turn whose
 * Mediator round errored — retry affordance + raw-response inspector.
 */

import { expect, test } from '@playwright/test'
import { COUNCIL_IDS } from './fixtures/bundle'
import { SEEDED_STATE, gotoCouncil } from './helpers'

test.use({ storageState: SEEDED_STATE })

test.describe('converging debate', () => {
  test.beforeEach(async ({ page }) => {
    await gotoCouncil(page, COUNCIL_IDS.consensusA)
  })

  test('round 1: opening positions', async ({ page }) => {
    const round1 = page.locator('section[aria-label="Roundtable"]').first()
    await round1.scrollIntoViewIfNeeded()
    await expect(page).toHaveScreenshot('consensus-round1.png')
  })

  test('mediator flags divergence with a round digest', async ({ page }) => {
    const mediator = page.locator('section[aria-label="Mediator"]').first()
    await mediator.scrollIntoViewIfNeeded()
    await expect(page).toHaveScreenshot('consensus-mediator-divergence.png')
  })

  test('round 2: participants reconsider', async ({ page }) => {
    const reconsider = page
      .locator('section[aria-label="Reconsider"]')
      .first()
    await reconsider.scrollIntoViewIfNeeded()
    await expect(page).toHaveScreenshot('consensus-reconsider.png')
  })

  test('consensus reached: final summary', async ({ page }) => {
    const final = page.locator('section[aria-label="Mediator"]').nth(1)
    await final.scrollIntoViewIfNeeded()
    // "Consensus reached" also appears as a convergent-badge tooltip; pin to
    // the synthesis heading.
    await expect(
      final.getByRole('heading', { name: 'Consensus reached' }),
    ).toBeVisible()
    await expect(page).toHaveScreenshot('consensus-final-converged.png')
  })
})

test.describe('cap-hit debate', () => {
  test.beforeEach(async ({ page }) => {
    await gotoCouncil(page, COUNCIL_IDS.consensusB)
  })

  test('round cap reached without consensus', async ({ page }) => {
    const capFinal = page.locator('section[aria-label="Mediator"]').nth(2)
    await capFinal.scrollIntoViewIfNeeded()
    await expect(
      capFinal.getByText('No consensus at the round cap'),
    ).toBeVisible()
    await expect(page).toHaveScreenshot('consensus-cap-hit.png')
  })

  test('errored mediator round with retry', async ({ page }) => {
    const errored = page.locator('section[aria-label="Mediator"]').nth(3)
    await errored.scrollIntoViewIfNeeded()
    await expect(
      errored.getByText('503 UNAVAILABLE', { exact: false }),
    ).toBeVisible()
    await expect(page).toHaveScreenshot('consensus-mediator-error.png')
  })
})
