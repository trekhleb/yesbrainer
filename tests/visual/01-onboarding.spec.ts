/**
 * First-run onboarding — the two frontpage states a brand-new visitor can
 * hit: no usable model (the capability gate with the "add your keys" CTA)
 * and keys-just-added with zero councils (the CTA flips to "create your
 * first council"). Runs on a fresh browser profile on purpose — no
 * seeded state here.
 */

import { expect, test } from '@playwright/test'
import { seedFakeKeys } from './helpers'

test('first-run gate: no keys, no councils', async ({ page }) => {
  await page.goto('/')
  const cta = page.getByRole('button', { name: 'Add your keys to begin' })
  await expect(cta).toBeVisible()
  await expect(page).toHaveScreenshot('onboarding-gate-top.png')

  await cta.scrollIntoViewIfNeeded()
  await expect(page).toHaveScreenshot('onboarding-gate-keys-cta.png')
})

test('gate flips once a key lands: no councils yet', async ({ page }) => {
  await seedFakeKeys(page)
  await page.goto('/')
  const cta = page.getByRole('button', { name: 'Create your first council' })
  await expect(cta).toBeVisible()
  await cta.scrollIntoViewIfNeeded()
  await expect(page).toHaveScreenshot('onboarding-ready-cta.png')
})
