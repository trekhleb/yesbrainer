/**
 * Every published URL must render its own page in the app.
 *
 * `scripts/seo-routes.mjs` writes a static file per public route and lists it
 * in `sitemap.xml`; `src/hooks/use-app-route.ts` decides what React renders
 * there. Nothing links those two together — the manifest's own doc comment
 * says the pairing "is on you" — and the failure is silent in the worst way:
 * a crawler indexes correct prerendered HTML, a human clicks the result, and
 * React mounts something else over it. The URL, the title and the search
 * snippet all look right; only the content is wrong.
 *
 * So this derives the published paths from the same JSON the manifest reads,
 * renders the real `<App>` at each, and asserts the page that belongs there
 * actually appears. The manifest itself can't be imported here (it reads
 * files at import time via `import.meta.url`, which isn't a file URL under
 * jsdom), hence the shared JSON rather than a shared module.
 *
 * It also guards the redirect bug this feature shipped with once already:
 * standalone document routes must be in `chromelessPage`, or the "land on the
 * most recent real council" effect quietly redirects anyone arriving from
 * search onto a council of their own.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { waitFor } from '@testing-library/react'
import { useLocation } from 'react-router-dom'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { App } from '@/app'
import { createCouncil, patchCouncilTitle } from '@/storage/councils'
import { COMPARISONS, COMPARISON_HUB } from '@/models/comparisons'
import { slugify } from '@/utils/slug'
import { clearDb } from '../helpers/db'
import { MODEL_B, seat } from '../helpers/fixtures'
import { renderUi } from '../helpers/render'

vi.mock('@/providers/run-stream', () => ({
  runParticipantStream: vi.fn(),
}))
vi.mock('@/utils/session/title-gen', () => ({
  generateTitleForFirstTurn: vi.fn().mockResolvedValue(undefined),
}))

const DEMO_DIR = resolve('src/data/demo-councils')

/** Demo council titles, read the way the seeder and the manifest read them. */
function demoTitles(): string[] {
  return readdirSync(DEMO_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .flatMap((f) => {
      const parsed: unknown = JSON.parse(
        readFileSync(`${DEMO_DIR}/${f}`, 'utf8'),
      )
      const envelope = parsed as { councils?: unknown[] }
      const councils = Array.isArray(envelope.councils)
        ? envelope.councils
        : [parsed]
      return councils.map((c) => (c as { title?: string }).title ?? '')
    })
    .filter((t) => t !== '')
}

function LocationProbe() {
  const { pathname } = useLocation()
  return <div data-pathname={pathname} />
}

beforeEach(async () => {
  await clearDb()
  localStorage.setItem('yesbrainer:demos-seeded', '1')
  vi.resetModules()
})

async function seedDemoCouncils() {
  const titles = demoTitles()
  for (const [i, title] of titles.entries()) {
    await createCouncil({
      id: `demo-${i}`,
      socialStructure: 'roundtable',
      seats: [seat(MODEL_B)],
      isDemo: true,
    })
    await patchCouncilTitle(`demo-${i}`, title)
  }
  return titles
}

/** Every path the build publishes, paired with text unique to that page. */
const STATIC_ROUTES: { path: string; expect: string }[] = [
  { path: '/private', expect: 'no account, no server' },
  { path: '/vs', expect: COMPARISON_HUB.heading },
  ...COMPARISONS.map((c) => ({
    path: `/vs/${c.slug}`,
    expect: c.heading,
  })),
]

describe('published document routes render their own page', () => {
  it.each(STATIC_ROUTES)('$path', async ({ path, expect: needle }) => {
    const { container } = renderUi(<App />, { route: path })
    await waitFor(
      () =>
        expect(container.textContent?.toLowerCase()).toContain(
          needle.toLowerCase(),
        ),
      { timeout: 10_000 },
    )
  }, 20_000)

  it('every demo permalink resolves to its council', async () => {
    const titles = await seedDemoCouncils()
    expect(titles.length).toBeGreaterThan(0)
    for (const title of titles) {
      const { container, unmount } = renderUi(<App />, {
        route: `/demo/${slugify(title)}`,
      })
      await waitFor(() => expect(container.textContent).toContain(title), {
        timeout: 10_000,
      })
      unmount()
    }
  }, 40_000)
})

describe('document routes survive the land-on-a-valid-council effect', () => {
  // The regression this feature shipped with once: a route missing from
  // `chromelessPage` gets its visitor redirected to their own most recent
  // council the moment the list loads.
  it.each(STATIC_ROUTES.map((r) => r.path))(
    '%s keeps its URL when the user already has a council',
    async (path) => {
      await createCouncil({
        id: 'mine-1',
        socialStructure: 'roundtable',
        seats: [seat(MODEL_B)],
      })
      await patchCouncilTitle('mine-1', 'A council of my own')

      const { container } = renderUi(
        <>
          <App />
          <LocationProbe />
        </>,
        { route: path },
      )

      // Wait for the council list to load — that's what arms the effect.
      await waitFor(
        () => expect((container.textContent ?? '').length).toBeGreaterThan(50),
        { timeout: 10_000 },
      )
      await new Promise((r) => setTimeout(r, 60))
      expect(container.querySelector('[data-pathname]')).toHaveProperty(
        'dataset.pathname',
        path,
      )
    },
    20_000,
  )
})
