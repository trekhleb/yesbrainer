/**
 * React Router behaviour — the parts a major-version upgrade actually
 * breaks.
 *
 * The app's router surface is deliberately small: `BrowserRouter` with a
 * `basename`, `useMatch` for every route (there is no `<Routes>`/`<Route>`
 * tree and no data router), `useNavigate`, `<Navigate replace>`,
 * `useSearchParams`, `useLocation`, and `<Link>`. Path *matching* is
 * already well covered — by `useAppRoute` unit tests, the demo-route
 * tests, and `05-demos`, which walks every published permalink.
 *
 * What nothing covered before this file is **history semantics**: whether
 * a navigation pushes or replaces, and what the back button does about it.
 * Those are decisions the app makes deliberately and documents in
 * comments, they're invisible on screen, and they are exactly what shifts
 * between router majors. They also can't be tested in jsdom — the unit
 * suite renders under `MemoryRouter`, which simulates history rather than
 * using the browser's.
 *
 * Each test below pins an intent that already exists in a source comment,
 * so a v8 upgrade that changes the semantics fails here rather than in
 * someone's browser.
 */

import { expect, test } from '@playwright/test'
import { installAnthropicMock } from './mock-anthropic'
import {
  councilPath,
  emptyCouncil,
  importCouncil,
  seedRandom,
  seedReadyProfile,
} from './helpers'

/** Path + query, which is what these assertions are actually about. */
function route(url: string): string {
  const parsed = new URL(url)
  return `${parsed.pathname}${parsed.search}`
}

test.describe('the new-council deep link', () => {
  test('opens with a push, so back closes the modal', async ({ page }) => {
    await seedReadyProfile(page)
    await installAnthropicMock(page, {})
    const id = await importCouncil(
      page,
      emptyCouncil('it-route-push', 'roundtable', 'Routing council'),
    )

    await page.getByRole('button', { name: 'New council' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    expect(route(page.url())).toBe(`${councilPath(id)}?new-council=1`)

    /* The documented contract: "Open → push a new entry (back button
       closes the modal)". */
    await page.goBack()
    await expect(page.getByRole('dialog')).toBeHidden()
    expect(route(page.url())).toBe(councilPath(id))
  })

  test('closes with a replace, leaving no dead entry to back past', async ({
    page,
  }) => {
    await seedReadyProfile(page)
    await installAnthropicMock(page, {})
    const id = await importCouncil(
      page,
      emptyCouncil('it-route-replace', 'roundtable', 'Routing council'),
    )

    await page.getByRole('button', { name: 'New council' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('dialog')).toBeHidden()

    /* "Close → replace, so dismissing doesn't leave a dead entry to back
       past." Were it a push, this back would restore `?new-council=1` and
       the modal would spring open again. */
    await page.goBack()
    await expect(page.getByRole('dialog')).toBeHidden()
    expect(route(page.url())).toBe(councilPath(id))
  })
})

test.describe('settings routing', () => {
  test('bare /settings redirects to the default tab, replacing itself', async ({
    page,
  }) => {
    await seedReadyProfile(page)
    await installAnthropicMock(page, {})
    const id = await importCouncil(
      page,
      emptyCouncil('it-route-settings', 'roundtable', 'Routing council'),
    )

    await page.goto('/settings')
    await expect(page).toHaveURL(/\/settings\/keys$/)

    /* `<Navigate replace>` — going back must leave settings entirely. A
       push here would return to bare `/settings`, which would redirect
       forward again and trap the back button. */
    await page.goBack()
    expect(route(page.url())).toBe(councilPath(id))
  })

  test('tab switches replace, so back leaves settings in one step', async ({
    page,
  }) => {
    await seedReadyProfile(page)
    await installAnthropicMock(page, {})
    const id = await importCouncil(
      page,
      emptyCouncil('it-route-tabs', 'roundtable', 'Routing council'),
    )

    await page.goto('/settings/keys')
    await page.getByRole('tab', { name: 'Storage' }).click()
    await expect(page).toHaveURL(/\/settings\/storage$/)
    await page.getByRole('tab', { name: 'Councils' }).click()
    await expect(page).toHaveURL(/\/settings\/councils$/)

    /* Two tab switches, zero history entries: "`replace` so the back
       button leaves settings instead of stepping through tabs". */
    await page.goBack()
    expect(route(page.url())).toBe(councilPath(id))
  })
})

test('a Link navigates client-side, and back/forward retrace it', async ({
  page,
}) => {
  /* A demos-only profile on purpose. The auto-land effect only fires when
     a *real* council exists, so `/` is a stable resting route here and the
     history assertions below measure the router rather than that
     redirect — see the note at the bottom of this file. */
  await seedRandom(page)
  await installAnthropicMock(page, {})
  await page.goto('/')

  /* Marker on the window object: it survives a client-side navigation and
     dies on a document load, which is the difference `<Link>` is for. */
  await page.evaluate(() => {
    ;(window as unknown as Record<string, unknown>).__navMarker = 'alive'
  })

  const demo = page.getByRole('link', {
    name: 'Best Seat for Golden Gate View',
    exact: true,
  })
  const href = await demo.getAttribute('href')
  await demo.click()
  await expect(page).toHaveURL(new RegExp(`${href ?? ''}$`))
  expect(
    await page.evaluate(
      () => (window as unknown as Record<string, unknown>).__navMarker,
    ),
  ).toBe('alive')

  /* Back and forward retrace the client-side entry. */
  await page.goBack()
  await expect(page).toHaveURL(/localhost:\d+\/$/)
  await page.goForward()
  await expect(page).toHaveURL(new RegExp(`${href ?? ''}$`))
})

test('a council id needing percent-encoding survives the round trip', async ({
  page,
}) => {
  await seedReadyProfile(page)
  await installAnthropicMock(page, {})

  /* Imported ids are only `z.string().min(1).max(1000)`, so spaces and
     non-ASCII are legal. `councilPath` encodes on the way out and the
     router decodes the captured param on the way in — a contract spelled
     out in `use-app-route.ts` and worth pinning, since param decoding is
     a classic router-major behaviour change. */
  const exoticId = 'notes v2 Проект'
  await importCouncil(
    page,
    emptyCouncil(exoticId, 'roundtable', 'Exotic id council'),
  )

  /* The deep link resolved: the sidebar row for this council links back to
     the same encoded path, which only happens if `useMatch` handed the
     decoded id through. */
  const row = page.getByRole('link', {
    name: 'Exotic id council',
    exact: true,
  })
  await expect(row).toHaveAttribute('href', councilPath(exoticId))

  /* And clicking it lands on the same place rather than a 404 shell. */
  await row.click()
  await expect(page).toHaveURL(new RegExp(`${councilPath(exoticId)}$`))
  await expect(page.getByRole('button', { name: 'New council' })).toBeVisible()
})

/*
 * NOT COVERED, deliberately — a pre-existing back-button trap on `/`.
 *
 * The land-on-a-valid-council effect (`src/app.tsx`, "When the active hash
 * points nowhere valid") reaches the router through `selectActive` →
 * `navigateToCouncil`, which **pushes**. So visiting `/` with at least one
 * real council pushes `/council/<id>` on top of it, and pressing back
 * returns to `/`, where the effect fires again and pushes forward. `/` is
 * unreachable by back, and each attempt grows the history stack.
 *
 * Reproduces on React Router 7 today, so it is not an upgrade risk — but
 * it would be easy to misread as one, which is why it's written down here
 * rather than asserted. No test pins it: encoding it as expected behaviour
 * would make the eventual fix look like a regression.
 *
 * The fix isn't a one-liner: `selectActive` is shared with sidebar clicks,
 * where a push is correct ("browser back/forward navigates between
 * councils" — app.tsx). Only the *effect* should replace, so it needs its
 * own navigation rather than a flag flipped on the shared helper.
 */
