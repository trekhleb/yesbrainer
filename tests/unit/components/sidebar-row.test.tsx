import { fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Row } from '@/components/sidebar/row'
import { createCouncil } from '@/storage/councils'
import { clearDb } from '../helpers/db'
import { seat } from '../helpers/fixtures'
import { renderUi } from '../helpers/render'
import type { CouncilSummary } from '@/storage/councils'

vi.mock('@/utils/download-json', () => ({ downloadJson: vi.fn() }))
import { downloadJson } from '@/utils/download-json'

function summary(over: Partial<CouncilSummary> = {}): CouncilSummary {
  return {
    id: 'c1',
    title: 'My council',
    createdAt: 1,
    socialStructure: 'trial',
    modelIds: ['anthropic:claude-sonnet-5'],
    tokenTotal: { inputTokens: 0, outputTokens: 0 },
    ...over,
  }
}

function mount(over: Partial<Parameters<typeof Row>[0]> = {}) {
  const handlers = {
    onSelect: vi.fn(),
    onSettings: vi.fn(),
    onDelete: vi.fn(),
    onRename: vi.fn(),
    onShareResult: vi.fn(),
  }
  const utils = renderUi(
    <Row
      council={summary()}
      active={false}
      isGeneratingTitle={false}
      isStreaming={false}
      {...handlers}
      {...over}
    />,
  )
  return { ...utils, ...handlers }
}

function openMenu(container: HTMLElement): void {
  const kebab = Array.from(container.querySelectorAll('button')).find((b) =>
    /more actions/i.test(b.getAttribute('aria-label') ?? ''),
  )
  fireEvent.click(kebab!)
}

/** Menu items live in a portal, so query the whole document. */
function menuItem(re: RegExp): HTMLElement | undefined {
  return Array.from(document.querySelectorAll('button')).find((el) =>
    re.test(el.textContent ?? ''),
  )
}

beforeEach(async () => {
  await clearDb()
})

describe('sidebar Row', () => {
  it('renders the title and a hash-route link', () => {
    const { container } = mount()
    expect(container.textContent).toContain('My council')
    const link = container.querySelector('a[href="/council/c1"]')
    expect(link).not.toBeNull()
  })

  it('puts the kebab into its loading state while a title is generating', () => {
    const { container } = mount({ isGeneratingTitle: true })
    const kebab = Array.from(container.querySelectorAll('button')).find((b) =>
      /council is working/i.test(b.getAttribute('aria-label') ?? ''),
    )
    expect(kebab).toBeDefined()
  })

  it('locks the kebab menu shut while a run is streaming', () => {
    const { container } = mount({ isStreaming: true })
    const kebab = Array.from(container.querySelectorAll('button')).find((b) =>
      /council is working/i.test(b.getAttribute('aria-label') ?? ''),
    )
    fireEvent.click(kebab!)
    // `isLoading` swallows the click — no menu, so no mid-run
    // Rename/Delete/Settings races.
    expect(menuItem(/rename/i)).toBeUndefined()
  })

  it('opens the kebab menu and fires Rename / Settings / Delete', () => {
    const { container, onRename, onSettings, onDelete } = mount()
    const kebab = Array.from(container.querySelectorAll('button')).find((b) =>
      /more|options|menu/i.test(b.getAttribute('aria-label') ?? ''),
    ) ?? container.querySelector('button')
    fireEvent.click(kebab!)
    const clickItem = (re: RegExp) => {
      const item = Array.from(document.querySelectorAll('button, [role="menuitem"], li')).find(
        (el) => re.test(el.textContent ?? ''),
      )
      if (item) fireEvent.click(item)
    }
    clickItem(/rename/i)
    clickItem(/settings/i)
    clickItem(/delete/i)
    expect(
      onRename.mock.calls.length +
        onSettings.mock.calls.length +
        onDelete.mock.calls.length,
    ).toBeGreaterThan(0)
  })

  it('fires each kebab action from a freshly opened menu', () => {
    const { container, onRename, onSettings, onDelete } = mount()
    // Each item closes the popover, so the menu is re-opened per action.
    openMenu(container)
    fireEvent.click(menuItem(/settings/i)!)
    expect(onSettings).toHaveBeenCalledOnce()
    openMenu(container)
    fireEvent.click(menuItem(/rename/i)!)
    expect(onRename).toHaveBeenCalledOnce()
    openMenu(container)
    fireEvent.click(menuItem(/delete/i)!)
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('offers Share result for shareable structures and fires it', () => {
    const { container, onShareResult } = mount({
      council: summary({ socialStructure: 'trial' }),
    })
    openMenu(container)
    const share = menuItem(/share/i)
    expect(share).toBeDefined()
    fireEvent.click(share!)
    expect(onShareResult).toHaveBeenCalledOnce()
  })

  it('hides Share result for custom councils (no artifact)', () => {
    const { container } = mount({
      council: summary({ socialStructure: 'custom' }),
    })
    openMenu(container)
    expect(menuItem(/share/i)).toBeUndefined()
  })

  it('exports the council bundle to a JSON download', async () => {
    await createCouncil({
      id: 'c1',
      socialStructure: 'roundtable',
      seats: [seat('s1')],
    })
    const { container } = mount({ council: summary({ id: 'c1' }) })
    openMenu(container)
    fireEvent.click(menuItem(/export/i)!)
    await waitFor(() => expect(downloadJson).toHaveBeenCalled())
  })

  it('fires onSelect on a plain click, but not on a modifier click', () => {
    const { container, onSelect } = mount()
    const link = container.querySelector('a')!
    // cmd/middle-click falls through to the browser (new tab) — no side effect.
    fireEvent.click(link, { metaKey: true })
    expect(onSelect).not.toHaveBeenCalled()
    fireEvent.click(link)
    expect(onSelect).toHaveBeenCalledOnce()
  })
})
