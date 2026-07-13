/**
 * The Settings pages (`/settings/:tab`): Keys (BYOK banner, provider
 * fields with configured keys, the opt-in Ollama toggle), Storage (the
 * on-device banner, quota meter, backup/restore, danger zone — with
 * `navigator.storage` pinned so the numbers don't drift per machine),
 * and Councils (per-structure recipe panels; one expanded).
 */

import { expect, test } from '@playwright/test'
import { SEEDED_STATE, stubStorageEstimate } from './helpers'

test.use({ storageState: SEEDED_STATE })

test('keys tab', async ({ page }) => {
  await page.goto('/settings/keys')
  // "Anthropic" et al. render as hidden SVG <title>s; the BYOK banner is
  // the stable visible anchor.
  await expect(page.getByText('You own your keys.')).toBeVisible()
  await expect(page).toHaveScreenshot('settings-keys.png')
})

test('keys tab: opt-in Ollama section', async ({ page }) => {
  await page.goto('/settings/keys')
  const ollama = page.getByText('Ollama', { exact: false }).last()
  await ollama.scrollIntoViewIfNeeded()
  await expect(page).toHaveScreenshot('settings-keys-ollama.png')
})

test('storage tab', async ({ page }) => {
  await stubStorageEstimate(page)
  await page.goto('/settings/storage')
  await expect(page.getByText('Backup', { exact: false }).first())
    .toBeVisible()
  await expect(page).toHaveScreenshot('settings-storage.png')
})

test('councils tab', async ({ page }) => {
  await page.goto('/settings/councils')
  await expect(page).toHaveScreenshot('settings-councils.png')
})

test('councils tab: structure recipe expanded', async ({ page }) => {
  await page.goto('/settings/councils')
  await page.getByRole('button', { name: /Trial verdict/ }).click()
  await expect(
    page.getByText('voting', { exact: false }).first(),
  ).toBeVisible()
  await expect(page).toHaveScreenshot('settings-councils-trial-recipe.png')
})
