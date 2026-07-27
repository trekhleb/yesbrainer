/**
 * The keyless demo councils — the app's entire try-before-you-paste-a-key
 * path, and the only content on the site that search engines can index.
 *
 * Three properties, none of which the other suites check end to end:
 *
 *  1. **They seed and open with no key at all.** A visitor with zero
 *     credentials must still be able to read a full council.
 *  2. **Every prerendered permalink resolves in the app.** The slugs come
 *     from two independent implementations on purpose — `src/utils/slug.ts`
 *     for the app, `scripts/slugify.mjs` for the build, because a `.mjs`
 *     can't import a `.ts`. A unit test checks they agree on the shipping
 *     titles; this checks the stronger thing, that the URLs the build
 *     ACTUALLY emitted resolve against the councils the app ACTUALLY seeds.
 *     Drift there emits `dist/demo/<slug>.html` at an address the app
 *     answers with nothing — an indexed page that renders empty.
 *  3. **Reading one costs no provider call.** "No key needed" is a claim
 *     the README makes; here it's enforced.
 *
 * The slug list is read from the generated `dist/sitemap.xml` rather than
 * hardcoded, so adding or renaming a demo extends this test automatically.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { installAnthropicMock } from './mock-anthropic'
import { seedRandom } from './helpers'

/** Titles of the councils in `src/data/demo-councils/`. The sidebar shows
 *  these; the permalinks are their slugs. */
const DEMO_TITLES = [
  'Best Third Language: French Over Mandarin',
  'Best Seat for Golden Gate View',
  'Identify the Location of a Beach Access',
  'Name This App: Nobody Said Yes-Brainer',
]

/** Demo paths exactly as the build emitted them. */
function demoPathsFromSitemap(): string[] {
  const sitemap = readFileSync(
    fileURLToPath(new URL('../../dist/sitemap.xml', import.meta.url)),
    'utf8',
  )
  return [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => new URL(match[1] ?? '').pathname)
    .filter((path) => path.startsWith('/demo/'))
}

/** How many demo councils ship. The folder IS the inventory. */
function demoFileCount(): number {
  return readdirSync(
    fileURLToPath(new URL('../../src/data/demo-councils', import.meta.url)),
  ).filter((name) => name.endsWith('.json')).length
}

test('a visitor with no key can read every demo council', async ({ page }) => {
  await seedRandom(page)
  // No key, no demo suppression: exactly a first-time visitor. Any
  // provider call at all would throw in the route handler, since the
  // script covers no roles.
  const mock = await installAnthropicMock(page, {})

  /* Demos seed themselves on first load and are reachable as real links —
     openable in a new tab, and crawlable. */
  await page.goto('/')
  for (const title of DEMO_TITLES) {
    // `exact` matters: each sidebar row carries a title link AND a wrapper
    // link whose accessible name prepends the structure pill.
    await expect(
      page.getByRole('link', { name: title, exact: true }),
    ).toBeVisible()
  }

  /* Reading is free, asking is not: with no usable model the composer is
     replaced by the keys gate rather than sitting there inert. */
  await expect(
    page.getByRole('button', { name: 'Add your keys to begin' }),
  ).toBeVisible()

  /* One permalink per shipped demo — a demo added without a permalink (or
     a permalink outliving its demo) fails here. */
  const paths = demoPathsFromSitemap()
  expect(paths).toHaveLength(demoFileCount())
  expect(paths).toHaveLength(DEMO_TITLES.length)

  /* And every one of them resolves, deep-linked rather than clicked
     through. An unresolvable slug leaves `activeId` null and the shell
     renders its empty state, so the answer round is the proof: it exists
     only when the slug found a council. */
  for (const path of paths) {
    await page.goto(path)
    await expect(
      page.locator('section[aria-label="Roundtable"]').first(),
    ).toBeVisible()
  }

  /* Reading demos never contacts a provider. */
  expect(mock.calls).toEqual([])
})

test('a demo opened from the sidebar shows its recorded deliberation', async ({
  page,
}) => {
  await seedRandom(page)
  const mock = await installAnthropicMock(page, {})

  await page.goto('/')
  // The Trial demo — the richest one: answers, peer votes, a verdict.
  await page
    .getByRole('link', {
      name: 'Identify the Location of a Beach Access',
      exact: true,
    })
    .click()

  await expect(page.locator('section[aria-label="Voting"]').first()).toBeVisible()
  await expect(page.locator('section[aria-label="Judge"]').first()).toBeVisible()
  await expect(
    page.getByLabel('Top peer-rated answer').first(),
  ).toBeVisible()

  expect(mock.calls).toEqual([])
})
