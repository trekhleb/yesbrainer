import { fireEvent, waitFor } from '@testing-library/react'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest'
import { analytics } from '@/analytics'
import { StorageWipeSection } from '@/components/settings/storage-wipe-section'
import { renderUi } from '../../helpers/render'

vi.mock('@/storage/wipe', () => ({
  wipeAllStorage: vi.fn(),
  wipeAllCouncils: vi.fn(),
  wipeApiKeys: vi.fn(),
}))
import { wipeAllCouncils, wipeAllStorage, wipeApiKeys } from '@/storage/wipe'

vi.mock('@/utils/session/active-streams', () => ({
  abortAllCouncilStreams: vi.fn(),
}))
import { abortAllCouncilStreams } from '@/utils/session/active-streams'

// restoreMocks: true restores spies before every test — create per test.
let eventSpy: MockInstance
beforeEach(() => {
  eventSpy = vi.spyOn(analytics, 'event')
})

afterEach(() => vi.clearAllMocks())

/** All buttons whose trimmed label matches — the trigger plus, once a modal
 *  is open, its red confirm (same label). The confirm is the last one. */
const buttonsMatching = (re: RegExp) =>
  Array.from(document.querySelectorAll('button')).filter((b) =>
    re.test(b.textContent?.trim() ?? ''),
  )

describe('StorageWipeSection', () => {
  it('opens the confirm modal and cancels without wiping', () => {
    renderUi(<StorageWipeSection />)
    fireEvent.click(buttonsMatching(/^wipe everything$/i)[0]!)
    expect(document.body.textContent).toContain('Wipe everything?')
    const cancel = Array.from(document.querySelectorAll('button')).find((b) =>
      /^cancel$/i.test(b.textContent?.trim() ?? ''),
    )!
    fireEvent.click(cancel)
    expect(wipeAllStorage).not.toHaveBeenCalled()
    expect(eventSpy).not.toHaveBeenCalled()
  })

  it('surfaces an error inline when the wipe fails', async () => {
    vi.mocked(wipeAllStorage).mockRejectedValue(new Error('idb locked'))
    renderUi(<StorageWipeSection />)
    fireEvent.click(buttonsMatching(/^wipe everything$/i)[0]!)
    // Confirm inside the modal (the second "Wipe everything" — the red confirm).
    const confirm = buttonsMatching(/wipe everything/i)
    fireEvent.click(confirm[confirm.length - 1]!)
    await waitFor(() =>
      expect(document.body.textContent).toMatch(/couldn.t wipe: idb locked/i),
    )
    // Counted at confirm, before the wipe/reload — a failing wipe still
    // counts as the feature being invoked (and the keepalive ordering is
    // what lets the event out before the success-path reload).
    expect(eventSpy).toHaveBeenCalledExactlyOnceWith('wipe-everything')
  })

  it('wipes only the keys, reactively, and refreshes stats', async () => {
    const onChanged = vi.fn()
    const onCouncilsChanged = vi.fn()
    renderUi(
      <StorageWipeSection
        onChanged={onChanged}
        onCouncilsChanged={onCouncilsChanged}
      />,
    )
    fireEvent.click(buttonsMatching(/^wipe keys$/i)[0]!)
    expect(document.body.textContent).toContain('Wipe keys?')
    const confirm = buttonsMatching(/wipe keys/i)
    fireEvent.click(confirm[confirm.length - 1]!)

    await waitFor(() => expect(wipeApiKeys).toHaveBeenCalledOnce())
    expect(eventSpy).toHaveBeenCalledExactlyOnceWith('wipe-keys')
    expect(onChanged).toHaveBeenCalledOnce()
    // Keys are their own slice — councils untouched, no bulk-stream abort.
    expect(wipeAllCouncils).not.toHaveBeenCalled()
    expect(onCouncilsChanged).not.toHaveBeenCalled()
    expect(abortAllCouncilStreams).not.toHaveBeenCalled()
    // Modal closed.
    await waitFor(() =>
      expect(document.body.textContent).not.toContain('Wipe keys?'),
    )
  })

  it('wipes only the councils: aborts in-flight runs then refreshes the sidebar', async () => {
    const onCouncilsChanged = vi.fn()
    renderUi(<StorageWipeSection onCouncilsChanged={onCouncilsChanged} />)
    fireEvent.click(buttonsMatching(/^wipe councils$/i)[0]!)
    expect(document.body.textContent).toContain('Wipe councils?')
    const confirm = buttonsMatching(/wipe councils/i)
    fireEvent.click(confirm[confirm.length - 1]!)

    await waitFor(() => expect(wipeAllCouncils).toHaveBeenCalledOnce())
    expect(eventSpy).toHaveBeenCalledExactlyOnceWith('wipe-councils')
    expect(abortAllCouncilStreams).toHaveBeenCalledOnce()
    expect(onCouncilsChanged).toHaveBeenCalledOnce()
    // Councils are their own slice — keys untouched.
    expect(wipeApiKeys).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(document.body.textContent).not.toContain('Wipe councils?'),
    )
  })
})
