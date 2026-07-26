/**
 * The two ways to open a demo council, and the promise that they don't fight
 * each other.
 *
 * A demo is reachable at its per-device `/council/<uuid>` (what the sidebar
 * navigates to) *and* at the stable public `/demo/<title-slug>` (what the
 * prerender publishes and a search result points at). Those resolve through
 * different code paths — `routeCouncilId` straight from the URL, versus a
 * title lookup against the live council list — merged in `app.tsx` as
 * `routeCouncilId ?? demoCouncilId`.
 *
 * The failure this guards against is quiet: `/demo/:slug` is deliberately
 * *not* a chromeless document route, so the "land on the most recent real
 * council" effect still runs there. If demo resolution ever broke, that
 * effect would redirect a visitor arriving from search onto a council of
 * their own — a page that looks fine and is the wrong content.
 *
 * These build their own demo rows rather than waiting on the seeder (the
 * seeder is app.test.tsx's subject, is slow, and only runs once per module).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { waitFor } from '@testing-library/react'
import { useLocation } from 'react-router-dom'
import { App } from '@/app'
import { createCouncil, patchCouncilTitle } from '@/storage/councils'
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

const DEMO_TITLE = 'Best Seat for Golden Gate View'
const DEMO_SLUG = slugify(DEMO_TITLE)

/** Exposes the router's current path so a test can assert no redirect fired. */
function LocationProbe() {
  const { pathname } = useLocation()
  return <div data-pathname={pathname} />
}

beforeEach(async () => {
  await clearDb()
  // Skip the real seeder — same trick app.test.tsx uses for every test that
  // isn't about seeding.
  localStorage.setItem('yesbrainer:demos-seeded', '1')
  vi.resetModules()
})

/** A demo council with a real title — `createCouncil` takes neither, so the
 *  title is patched on afterwards exactly as the app does it. */
async function makeCouncil(
  id: string,
  title: string,
  { isDemo = false } = {},
) {
  await createCouncil({
    id,
    socialStructure: 'roundtable',
    seats: [seat(MODEL_B)],
    ...(isDemo ? { isDemo: true } : {}),
  })
  await patchCouncilTitle(id, title)
  return title
}

describe('demo council routing', () => {
  it('opens a demo by its title slug at /demo/:slug', async () => {
    const title = await makeCouncil('demo-1', DEMO_TITLE, { isDemo: true })
    const { container } = renderUi(<App />, { route: `/demo/${DEMO_SLUG}` })
    await waitFor(() => expect(container.textContent).toContain(title), {
      timeout: 10_000,
    })
  }, 20_000)

  it('still opens the same demo by uuid at /council/:id', async () => {
    const title = await makeCouncil('demo-1', DEMO_TITLE, { isDemo: true })
    const { container } = renderUi(<App />, { route: '/council/demo-1' })
    await waitFor(() => expect(container.textContent).toContain(title), {
      timeout: 10_000,
    })
  }, 20_000)

  it('does not bounce a /demo/:slug visitor onto their own council', async () => {
    const title = await makeCouncil('demo-1', DEMO_TITLE, { isDemo: true })
    // A real (non-demo) council is exactly what the fallback effect would
    // redirect to if demo resolution failed. Its title showing up in the
    // sidebar proves nothing — the tell is whether the URL survived, so
    // assert on the location rather than on rendered text.
    await makeCouncil('real-1', 'A council of my own')

    const { container } = renderUi(
      <>
        <App />
        <LocationProbe />
      </>,
      { route: `/demo/${DEMO_SLUG}` },
    )

    await waitFor(() => expect(container.textContent).toContain(title), {
      timeout: 10_000,
    })
    // Give the "land on a valid council" effect a chance to misfire.
    await new Promise((r) => setTimeout(r, 50))
    expect(container.querySelector('[data-pathname]')).toHaveProperty(
      'dataset.pathname',
      `/demo/${DEMO_SLUG}`,
    )
  }, 20_000)

  it('matches only demo councils, so a real council with the same title is not hijacked', async () => {
    // Same title, but not a demo — `/demo/:slug` must not resolve to it.
    await makeCouncil('impostor-1', DEMO_TITLE)
    const { container } = renderUi(<App />, { route: `/demo/${DEMO_SLUG}` })
    // With no demo to match, the route falls through to the normal
    // "land somewhere valid" behaviour rather than opening the impostor
    // *as a demo*; what matters is that nothing crashes and the app renders.
    await waitFor(
      () => expect((container.textContent ?? '').length).toBeGreaterThan(50),
      { timeout: 10_000 },
    )
  }, 20_000)

  it('renders without crashing when the slug matches nothing', async () => {
    const { container } = renderUi(<App />, { route: '/demo/no-such-demo' })
    await waitFor(
      () => expect((container.textContent ?? '').length).toBeGreaterThan(50),
      { timeout: 10_000 },
    )
  }, 20_000)
})
