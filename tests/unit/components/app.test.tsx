import { fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app'
import { createCouncil, getCouncil, listCouncils } from '@/storage/councils'
import { clearDb } from '../helpers/db'
import { MODEL_B, seat } from '../helpers/fixtures'
import { renderUi } from '../helpers/render'

vi.mock('@/providers/run-stream', () => ({
  runParticipantStream: vi.fn(),
}))
vi.mock('@/utils/session/title-gen', () => ({
  generateTitleForFirstTurn: vi.fn().mockResolvedValue(undefined),
}))

beforeEach(async () => {
  await clearDb()
  vi.resetModules()
})

describe('App shell', () => {
  it('boots a pristine profile: seeds the demos and lands on the onboarding explainer', async () => {
    const { container } = renderUi(<App />)
    // The one-shot flag lands only after the whole import settles — waiting
    // on it (not on the first row) keeps the seeder from racing the next
    // test's database wipe.
    await waitFor(
      () =>
        expect(localStorage.getItem('yesbrainer:demos-seeded')).toBe('1'),
      { timeout: 10_000 },
    )
    expect((await listCouncils()).length).toBeGreaterThan(0)
    await waitFor(() =>
      expect(container.textContent?.length ?? 0).toBeGreaterThan(200),
    )
    // Demo rows appear in the sidebar; no council auto-opens.
    const demos = await listCouncils()
    expect(demos.every((c) => c.isDemo)).toBe(true)
  }, 15_000)

  it('opens the New-council modal from the ?new-council deep link', async () => {
    localStorage.setItem('yesbrainer:demos-seeded', '1')
    localStorage.setItem('yesbrainer:keys', JSON.stringify({ anthropic: 'k' }))
    renderUi(<App />, { route: '/?new-council=1' })
    await waitFor(() =>
      expect(document.body.textContent).toContain('New council'),
    )
  })

  it('auto-selects the most recent real council on a bare route', async () => {
    localStorage.setItem('yesbrainer:demos-seeded', '1')
    localStorage.setItem('yesbrainer:keys', JSON.stringify({ anthropic: 'k' }))
    await createCouncil({
      id: 'real-1',
      socialStructure: 'roundtable',
      seats: [seat('s1')],
    })
    const { container } = renderUi(<App />)
    // The council view mounts (its composer textarea is the tell).
    await waitFor(() =>
      expect(container.querySelector('textarea')).not.toBeNull(),
    )
  })
})

/** Buttons live all over the shell + portals — query the whole document. */
const button = (re: RegExp): HTMLElement | undefined =>
  Array.from(document.querySelectorAll('button')).find((b) =>
    re.test(b.textContent?.trim() ?? ''),
  )
const byAria = (label: string): HTMLElement | undefined =>
  Array.from(document.querySelectorAll('button')).find(
    (b) => (b.getAttribute('aria-label') ?? '') === label,
  )
function openRowMenu(): void {
  const kebab = Array.from(document.querySelectorAll('button')).find((b) =>
    /more actions/i.test(b.getAttribute('aria-label') ?? ''),
  )
  fireEvent.click(kebab!)
}
function menuItem(re: RegExp): HTMLElement | undefined {
  // The kebab menu renders in a portal appended after the shell, so the
  // *last* match wins over same-named chrome (e.g. the sidebar's Settings).
  const all = Array.from(document.querySelectorAll('button')).filter((el) =>
    re.test(el.textContent ?? ''),
  )
  return all[all.length - 1]
}

describe('App flows', () => {
  beforeEach(() => {
    localStorage.setItem('yesbrainer:demos-seeded', '1')
    localStorage.setItem(
      'yesbrainer:keys',
      JSON.stringify({ anthropic: 'k', openai: 'k' }),
    )
  })

  async function withCouncil(over = {}) {
    await createCouncil({
      id: 'c1',
      socialStructure: 'roundtable',
      seats: [seat('s1')],
      ...over,
    })
    const utils = renderUi(<App />)
    // Council auto-selects → the composer textarea confirms the view mounted.
    await waitFor(() =>
      expect(utils.container.querySelector('textarea')).not.toBeNull(),
    )
    return utils
  }

  it('creates a council from the New-council modal and lands on it', async () => {
    renderUi(<App />, { route: '/?new-council=1' })
    await waitFor(() =>
      expect(document.body.textContent).toContain('New council'),
    )
    fireEvent.click(button(/^create$/i)!)
    await waitFor(() =>
      expect(document.querySelector('textarea')).not.toBeNull(),
    )
    expect((await listCouncils()).length).toBe(1)
  })

  it('renders the About page on /about', async () => {
    const { container } = renderUi(<App />, { route: '/about' })
    await waitFor(() =>
      expect((container.textContent?.length ?? 0)).toBeGreaterThan(200),
    )
  })

  it('opens the Settings page from the sidebar', async () => {
    renderUi(<App />)
    await waitFor(() => expect(byAria('Settings')).toBeDefined())
    fireEvent.click(byAria('Settings')!)
    // MemoryRouter keeps location in memory, so assert on the rendered page.
    await waitFor(() =>
      expect(document.body.textContent).toContain(
        'Changes save automatically on this device',
      ),
    )
  })

  it('renames a council from the sidebar kebab', async () => {
    await withCouncil()
    openRowMenu()
    fireEvent.click(menuItem(/rename/i)!)
    await waitFor(() =>
      expect(document.body.textContent).toContain('Rename council'),
    )
    const input = document.querySelector<HTMLInputElement>(
      'input[placeholder="Council title"]',
    )!
    fireEvent.change(input, { target: { value: 'My renamed council' } })
    // Enter commits (covers the modal's key handler).
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(async () =>
      expect((await getCouncil('c1'))?.title).toBe('My renamed council'),
    )
  })

  it('deletes a council from the sidebar kebab', async () => {
    await withCouncil()
    openRowMenu()
    fireEvent.click(menuItem(/delete/i)!)
    await waitFor(() =>
      expect(document.body.textContent).toContain('Delete council'),
    )
    // The confirm modal's primary button is labelled "Delete".
    const confirm = Array.from(document.querySelectorAll('button')).find(
      (b) => /^delete$/i.test(b.textContent?.trim() ?? ''),
    )
    fireEvent.click(confirm!)
    await waitFor(async () => expect(await getCouncil('c1')).toBeNull())
  })

  it('opens council settings from the sidebar and saves', async () => {
    await withCouncil()
    openRowMenu()
    fireEvent.click(menuItem(/settings/i)!)
    // The modal loads its council asynchronously — wait for the loaded body
    // (the Save button only mounts once the council resolves).
    await waitFor(() =>
      expect(document.body.textContent).toContain(
        'Changes apply to upcoming turns',
      ),
    )
    fireEvent.click(button(/^save$/i)!)
    // Save closes the modal and confirms via the app-level toast.
    await waitFor(() =>
      expect(document.body.textContent).toContain('Council settings saved'),
    )
  })

  it('fires share from the sidebar kebab without crashing', async () => {
    // A Trial council is shareable (its verdict); with no turns there is
    // nothing to render, but the share handler still runs.
    await withCouncil({
      id: 'c1',
      socialStructure: 'trial',
      seats: [seat('s1'), seat('s2', MODEL_B)],
      judge: { modelId: MODEL_B, config: {} },
    })
    openRowMenu()
    const share = menuItem(/share/i)
    expect(share).toBeDefined()
    fireEvent.click(share!)
    // The app is still alive (the council view is still mounted).
    expect(document.querySelector('textarea')).not.toBeNull()
  })
})
