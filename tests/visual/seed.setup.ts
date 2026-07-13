/**
 * One-time seeding for the visual suite (a Playwright "project
 * dependency" — runs before the desktop / mobile projects).
 *
 * Injects the fixture bundle through the app's own Settings → Storage
 * import flow — the same zod-validated path a real user restore takes —
 * so a fixture that drifts from the bundle schema fails HERE with the
 * import report's reason, not as a silently-empty screenshot later.
 * The resulting browser state (fake BYOK keys in localStorage + the
 * imported councils in IndexedDB) is saved to `SEEDED_STATE`, which
 * seeded specs restore per-test via `test.use({ storageState: … })`.
 */

import { expect, test as setup } from '@playwright/test'
import { buildFixtureBundle } from './fixtures/bundle'
import { SEEDED_STATE, drawFixtureImages, seedFakeKeys } from './helpers'

setup('import fixture councils and save browser state', async ({ page }) => {
  await seedFakeKeys(page)
  // Pre-set the demo-seed flag so the fixture profile stays **demo-free**:
  // without it, the app's first load here (zero councils, no flag) would
  // seed the demo councils, and every seeded-state baseline would carry
  // three extra sidebar rows. Demo behaviour has its own coverage — the
  // fresh-profile onboarding spec and the factory-reset spec.
  await page.addInitScript(() => {
    localStorage.setItem('yesbrainer:demos-seeded', '1')
  })
  await page.goto('/settings/storage')

  // The attachment images are drawn in-page (canvas → WebP data URI), so
  // they match what the composer's attach pipeline would have produced.
  const images = await drawFixtureImages(page)
  const bundle = buildFixtureBundle(images)

  await page
    .locator('input[type="file"]')
    .setInputFiles({
      name: 'visual-fixtures.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(bundle)),
    })

  // The import report is the seed step's real assertion: every fixture
  // council must validate and land. "0 errors" is what catches schema drift.
  const report = page.getByText(/Imported/)
  await expect(report).toBeVisible()
  await expect(report).toContainText(`Imported ${bundle.councils.length}`)
  await expect(report).toContainText('0 errors')

  await page.context().storageState({ path: SEEDED_STATE, indexedDB: true })
})
