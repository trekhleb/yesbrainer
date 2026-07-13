/**
 * Factory reset — the full loop, as a functional regression net (no
 * screenshots): a profile with real councils wipes everything, the page
 * reloads on a pristine profile, the demo councils re-seed through their
 * lazy-loaded chunk, and the first-run gate renders.
 *
 * Exists because this exact flow died in the wild: the demo
 * chunk's dynamic import rejected on the post-wipe reload (stale PWA
 * service worker whose precache predated the chunk), the error boundary's
 * `unhandledrejection` listener caught it, and the whole app rendered the
 * fatal error screen. Three invariants are pinned here:
 *  1. the post-wipe boot NEVER shows the error screen (seeding is
 *     crash-proof — a failed seed logs and boots demo-less);
 *  2. the happy path re-seeds the demos (flag cleared by the wipe);
 *  3. the gate's "See it in action" rows mirror the live DB — deleting
 *     every demo removes the section, so the card never links to a
 *     council that no longer exists.
 * The stale-SW trigger itself isn't reproducible on the dev server (no SW
 * in dev) — `wipeAllStorage` now unregisters SWs + clears Cache Storage,
 * which this test exercises only as a no-op.
 */

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { SEEDED_STATE, composerInput } from './helpers'

test.use({ storageState: SEEDED_STATE })

/** The chat thread's scroll position — the thread is the only vertically
 *  scrollable `section` (stage sections inside turns don't scroll). */
function threadScroll(
  page: Page,
): Promise<{ top: number; scrollable: boolean } | null> {
  return page.evaluate(() => {
    const scroller = Array.from(document.querySelectorAll('section')).find(
      (s) => {
        const overflowY = getComputedStyle(s).overflowY
        return overflowY === 'auto' || overflowY === 'scroll'
      },
    )
    return scroller
      ? {
          top: scroller.scrollTop,
          scrollable: scroller.scrollHeight > scroller.clientHeight + 100,
        }
      : null
  })
}

test('wipe everything → reload → demos re-seed, no error screen', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'flow is identical; run once on desktop')
  // Start with the seeded inventory (real councils → demos were NOT
  // seeded for this profile; the flag got set on first load instead).
  await page.goto('/')
  await composerInput(page).waitFor()

  // Pin the AS-IS for *real* councils before wiping: opening one lands on
  // the latest turn (scrolled toward the bottom), so the demo open-at-top
  // behaviour asserted below stays an exception, never the new default.
  const realCouncil = await threadScroll(page)
  expect(realCouncil).not.toBeNull()
  if (realCouncil?.scrollable) expect(realCouncil.top).toBeGreaterThan(0)

  await page.goto('/settings/storage')
  await page.getByRole('button', { name: 'Wipe everything' }).click()
  // The confirm modal's action button carries the same label; the modal is
  // a destructive-confirm variant, so its role is `alertdialog`.
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Wipe everything' })
    .click()

  // The confirm dialog closes (its own "Wipe everything" button leaves the
  // DOM) before we assert the page-level one — otherwise the label matches
  // both mid-teardown (strict-mode violation).
  await expect(page.getByRole('alertdialog')).toHaveCount(0)

  // The wipe reloads in place (still /settings/storage) on a pristine
  // profile — this is exactly where the crash surfaced, so the
  // first assertion is that boot survives: Settings renders, no error
  // boundary. Demo seeding runs on this load too (the boot effect mounts
  // on every route).
  await expect(
    page.getByRole('button', { name: 'Wipe everything' }),
  ).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('The app hit an error')).toHaveCount(0)

  // Home now shows the first-run gate with the re-seeded demo councils.
  await page.goto('/')
  await expect(page.getByText('Get started in a minute')).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByText('The app hit an error')).toHaveCount(0)
  // At least one Demo row — not an exact count: the inventory is the
  // `src/data/demo-councils/` folder, which grows and shrinks by design.
  await expect(page.getByText('Demo', { exact: true }).first()).toBeVisible()

  // Demo councils open at the TOP of the recording (read start-to-finish),
  // unlike real councils (latest-turn assertion above). Open whichever demo
  // sorts first — the assertion is inventory-agnostic. The keyless
  // composer face proves the demo thread mounted (the in-thread demo
  // banner was removed — mobile space).
  await page.getByRole('link').filter({ hasText: 'Demo' }).first().click()
  await expect(
    page.getByText('Add your API keys to ask follow-ups'),
  ).toBeVisible()
  const demo = await threadScroll(page)
  expect(demo).not.toBeNull()
  expect(demo?.top).toBe(0)

  // The gate's "See it in action" rows are DERIVED from live DB rows, not
  // a hardcoded list — deleting every demo in-app must remove the rows and
  // the section label (no dangling links), while the keys CTA card stays.
  // Inventory-agnostic: deletes however many demos are seeded.
  await page.goto('/')
  await expect(page.getByText('See it in action')).toBeVisible()
  const demoTag = () => page.getByText('Demo', { exact: true })
  const seededCount = await demoTag().count()
  expect(seededCount).toBeGreaterThan(0)
  for (let remaining = seededCount; remaining > 0; remaining--) {
    await page
      .locator('li')
      .filter({ hasText: 'Demo' })
      .first()
      .getByRole('button', { name: 'More actions' })
      .click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Delete' })
      .click()
    await expect(demoTag()).toHaveCount(remaining - 1)
  }
  // Self-healed: the card keeps its action + trust strip, the demo section
  // is gone entirely.
  await expect(page.getByText('Get started in a minute')).toBeVisible()
  await expect(page.getByText('Works with')).toBeVisible()
  await expect(page.getByText('See it in action')).toHaveCount(0)
})
