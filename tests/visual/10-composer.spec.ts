/**
 * The composer, on a multi-seat council whose first seat supports thinking
 * + tools: at rest (the paperclip / brain / wrench / sliders run-control
 * cluster + Send), with an image attachment thumbnail, and with a long
 * draft that surfaces the context-window hint.
 *
 * The Thinking / Tools *popover* interactions (open state, armed
 * indicators) are intentionally not covered here yet — that part of the
 * composer is mid-refactor in the working tree, so pinning its internals
 * would bake in a transient state. Re-add popover-open + armed-indicator
 * shots once the run-options control settles (the old
 * `composer-run-controls` spec in git history is the template).
 */

import { expect, test, type Page } from '@playwright/test'
import { COUNCIL_IDS } from './fixtures/bundle'
import { SEEDED_STATE, composerForm, composerInput, gotoCouncil } from './helpers'

test.use({ storageState: SEEDED_STATE })

test.beforeEach(async ({ page }) => {
  await gotoCouncil(page, COUNCIL_IDS.parallel)
})

/** Deterministic PNG rendered in-page, for the attach-pipeline shot. */
async function pngBuffer(page: Page, w: number, h: number): Promise<Buffer> {
  const b64 = await page.evaluate(
    ([width, height]) => {
      const c = document.createElement('canvas')
      c.width = width!
      c.height = height!
      const ctx = c.getContext('2d')!
      const g = ctx.createLinearGradient(0, 0, width!, height!)
      g.addColorStop(0, '#1d4ed8')
      g.addColorStop(1, '#f59e0b')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, width!, height!)
      return c.toDataURL('image/png').split(',')[1]!
    },
    [w, h] as const,
  )
  return Buffer.from(b64, 'base64')
}

test('composer at rest', async ({ page }) => {
  await expect(composerForm(page)).toHaveScreenshot('composer-rest.png')
})

test('image attachment thumbnail', async ({ page }) => {
  const buf = await pngBuffer(page, 800, 500)
  await page.locator('input[type="file"]').setInputFiles({
    name: 'allocation.png',
    mimeType: 'image/png',
    buffer: buf,
  })
  await expect(composerForm(page).locator('img')).toBeVisible()
  await expect(composerForm(page)).toHaveScreenshot('composer-attachment.png')
})

test('long draft with the context hint', async ({ page }) => {
  const draft =
    'Given everything discussed above, please reconsider the conversion ' +
    'plan under three scenarios: rates rise two points, rates stay flat, ' +
    'and an early-retirement year with near-zero earned income. '
  await composerInput(page).fill(draft.repeat(12))
  await expect(composerForm(page)).toHaveScreenshot('composer-long-draft.png')
})
