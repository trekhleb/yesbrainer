/**
 * The top-level crash fallback — a critical state the redesign must not
 * regress silently (it's the last thing a user sees when something breaks,
 * and it deliberately renders without the styling layer so a crash *in*
 * that layer still shows). Triggered through the boundary's own
 * `unhandledrejection` window listener rather than by breaking a
 * component, so the app is otherwise healthy up to the throw.
 *
 * The fallback prints the error message + a redacted details block; the
 * URL / UA lines in that block are environment-stable within the suite
 * (fixed localhost origin + one browser), so the shot stays deterministic.
 */

import { expect, test } from '@playwright/test'
import { seedFakeKeys } from './helpers'

test('crash fallback renders with a redacted, copyable error', async ({
  page,
}) => {
  await seedFakeKeys(page)
  await page.goto('/')
  // Reach past render into the boundary's async-error net — a provider
  // error that escaped a handler is the realistic path here.
  await page.evaluate(() => {
    window.dispatchEvent(
      new PromiseRejectionEvent('unhandledrejection', {
        promise: Promise.reject(new Error('Something went wrong')),
        reason: new Error('Something went wrong'),
      }),
    )
  })
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(
    page.getByRole('button', { name: /copy error/i }),
  ).toBeVisible()
  await expect(page).toHaveScreenshot('error-boundary-fallback.png')
})
