import { fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CouncilsTab } from '@/components/settings/councils-tab'
import { StorageTab } from '@/components/settings/storage-tab'
import { StorageWipeSection } from '@/components/settings/storage-wipe-section'
import { StorageStatusSection } from '@/components/settings/storage-status-section'
import { wipeAllStorage } from '@/storage/wipe'
import { clearDb } from '../../helpers/db'
import { renderUi } from '../../helpers/render'

vi.mock('@/storage/wipe', () => ({
  wipeAllStorage: vi.fn(),
  wipeAllCouncils: vi.fn(),
  wipeApiKeys: vi.fn(),
}))
const wipeMock = vi.mocked(wipeAllStorage)

beforeEach(async () => {
  wipeMock.mockReset()
  await clearDb()
})

describe('CouncilsTab', () => {
  it('renders the per-structure recipe accordions and edits a global prompt', () => {
    const setPrompts = vi.fn()
    const { container } = renderUi(
      <CouncilsTab
        prompts={{}}
        setPrompts={setPrompts}
        behavior={{}}
        setBehavior={vi.fn()}
      />,
    )
    // The three structures are all represented.
    expect(container.textContent).toMatch(/parallel/i)
    expect(container.textContent).toMatch(/trial/i)
    expect(container.textContent).toMatch(/consensus/i)

    // Editing any prompt textarea flows through setPrompts.
    const textarea = container.querySelector('textarea')
    if (textarea) {
      fireEvent.change(textarea, { target: { value: 'a custom prompt' } })
      expect(setPrompts).toHaveBeenCalled()
    }
  })
})

describe('StorageTab', () => {
  it('composes the status, backup, and wipe sections', () => {
    const { container } = renderUi(
      <StorageTab onCouncilsChanged={vi.fn()} />,
    )
    expect(container.textContent).toMatch(/backup/i)
    expect(container.textContent?.toLowerCase()).toMatch(/reset|wipe/)
  })
})

describe('StorageWipeSection', () => {
  it('wipes everything only after the confirm dialog is accepted', async () => {
    const reload = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload },
      configurable: true,
    })
    renderUi(<StorageWipeSection />)
    // Target the factory-reset button specifically — "Wipe keys" / "Wipe
    // councils" sit beside it now.
    const wipeAllBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => /^wipe everything$/i.test(b.textContent?.trim() ?? ''),
    )!
    fireEvent.click(wipeAllBtn)
    expect(wipeMock).not.toHaveBeenCalled() // just opened the confirm

    // The confirm modal's red confirm (the last "Wipe everything" in the DOM).
    const confirm = Array.from(document.querySelectorAll('button')).filter((b) =>
      /wipe everything/i.test(b.textContent ?? ''),
    )
    fireEvent.click(confirm.at(-1)!)
    await waitFor(() => expect(wipeMock).toHaveBeenCalledOnce())
  })
})

describe('StorageStatusSection', () => {
  it('renders the persisted badge and a quota meter from its props', () => {
    const { container } = renderUi(
      <StorageStatusSection
        persisted
        estimate={{ usage: 5 * 1024 * 1024, quota: 100 * 1024 * 1024 }}
        onChanged={vi.fn()}
      />,
    )
    expect(container.textContent).toMatch(/MB/)
  })

  it('degrades gracefully while the values are still null', () => {
    const { container } = renderUi(
      <StorageStatusSection persisted={null} estimate={null} onChanged={vi.fn()} />,
    )
    expect(container.textContent?.length).toBeGreaterThan(0)
  })
})
