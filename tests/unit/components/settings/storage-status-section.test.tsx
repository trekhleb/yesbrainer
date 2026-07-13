import { fireEvent, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StorageStatusSection } from '@/components/settings/storage-status-section'
import { renderUi } from '../../helpers/render'

vi.mock('@/storage/persist', () => ({ ensurePersistedStorage: vi.fn() }))
import { ensurePersistedStorage } from '@/storage/persist'

afterEach(() => {
  vi.clearAllMocks()
})

describe('StorageStatusSection', () => {
  it('shows the persistent state and the quota meter', () => {
    const { container } = renderUi(
      <StorageStatusSection
        persisted={true}
        estimate={{ usage: 1000, quota: 10_000 }}
        onChanged={vi.fn()}
      />,
    )
    expect(container.textContent).toContain('Persistent')
    expect(container.textContent).toContain('Using')
  })

  it('offers the upgrade when best-effort and surfaces a declined attempt', async () => {
    vi.mocked(ensurePersistedStorage).mockResolvedValue(false)
    const onChanged = vi.fn()
    const { container } = renderUi(
      <StorageStatusSection
        persisted={false}
        estimate={null}
        onChanged={onChanged}
      />,
    )
    expect(container.textContent).toContain('Best-effort')
    expect(container.textContent).toContain(
      'Quota information is not available',
    )
    const btn = Array.from(container.querySelectorAll('button')).find((b) =>
      /make persistent/i.test(b.textContent ?? ''),
    )!
    fireEvent.click(btn)
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(ensurePersistedStorage).toHaveBeenCalled()
    // The browser declined → the inline error explains how to unlock it.
    await waitFor(() =>
      expect(container.textContent).toMatch(/declined the persistence upgrade/i),
    )
  })

  it('flags usage approaching the quota', () => {
    const { container } = renderUi(
      <StorageStatusSection
        persisted={true}
        estimate={{ usage: 9000, quota: 10_000 }}
        onChanged={vi.fn()}
      />,
    )
    expect(container.textContent).toMatch(/Approaching the quota/)
  })
})
