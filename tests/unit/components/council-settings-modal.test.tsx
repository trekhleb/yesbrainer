import { fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CouncilSettingsModal } from '@/components/council-settings-modal'
import { createCouncil, getCouncil } from '@/storage/councils'
import { db } from '@/storage/db'
import { toaster } from 'baseui/toast'
import { clearDb } from '../helpers/db'
import { MODEL_A, MODEL_B, seat } from '../helpers/fixtures'
import { renderUi } from '../helpers/render'

vi.mock('baseui/toast', async (importOriginal) => ({
  ...(await importOriginal<typeof import('baseui/toast')>()),
  toaster: { info: vi.fn(), positive: vi.fn(), negative: vi.fn() },
}))

const ollamaOff = { enabled: false, reachable: false, checked: true }

beforeEach(async () => {
  await clearDb()
  localStorage.setItem('yesbrainer:keys', JSON.stringify({ anthropic: 'k' }))
})

describe('CouncilSettingsModal', () => {
  it('loads the target council and saves roster edits through storage', async () => {
    await createCouncil({
      id: 'c1',
      socialStructure: 'trial',
      seats: [seat('s1'), seat('s2', MODEL_B)],
      judge: { modelId: MODEL_B, config: {} },
    })
    const onSaved = vi.fn()
    renderUi(
      <CouncilSettingsModal
        councilId="c1"
        ollama={ollamaOff}
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    )
    await waitFor(() =>
      expect(document.body.textContent).toContain('Untitled council'),
    )
    expect(document.body.textContent).toContain('Trial')

    const save = Array.from(document.querySelectorAll('button')).find((b) =>
      /^save$/i.test(b.textContent?.trim() ?? ''),
    )
    expect(save).toBeDefined()
    fireEvent.click(save!)
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('c1'))
    // A no-edit save round-trips the roster untouched.
    const persisted = await getCouncil('c1')
    expect(persisted?.seats.map((s) => s.id)).toEqual(['s1', 's2'])
  })

  it('shows the load error for a missing council', async () => {
    renderUi(
      <CouncilSettingsModal
        councilId="ghost"
        ollama={ollamaOff}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    )
    await waitFor(() =>
      expect(document.body.textContent).toContain('Council not found'),
    )
  })

  const textButton = (re: RegExp): HTMLElement | undefined =>
    Array.from(document.querySelectorAll('button')).find((b) =>
      re.test(b.textContent?.trim() ?? ''),
    )
  const configToggles = (): HTMLElement[] =>
    Array.from(document.querySelectorAll('button[aria-label="Configure this model"]'))
  const removeButtons = (): HTMLElement[] =>
    Array.from(document.querySelectorAll('button[aria-label="Remove seat"]'))

  it('adds a seat, removes another, expands configs, and flushes all edits', async () => {
    await createCouncil({
      id: 'c1',
      socialStructure: 'trial',
      seats: [seat('s1'), seat('s2', MODEL_B)],
      judge: { modelId: MODEL_B, config: {} },
    })
    const onSaved = vi.fn()
    const onClose = vi.fn()
    renderUi(
      <CouncilSettingsModal
        councilId="c1"
        ollama={ollamaOff}
        onClose={onClose}
        onSaved={onSaved}
      />,
    )
    await waitFor(() =>
      expect(document.body.textContent).toContain('Untitled council'),
    )
    // Add a third seat so the remove buttons surface (Trial floor is 2).
    fireEvent.click(textButton(/add seat/i)!)
    await waitFor(() => expect(removeButtons().length).toBe(3))
    // Expand a seat config (mounts its inline form) and the Judge's config.
    fireEvent.click(configToggles()[0]!)
    fireEvent.click(configToggles()[configToggles().length - 1]!)
    // Drop the first seat — back at the two-seat floor, remove buttons hide.
    fireEvent.click(removeButtons()[0]!)
    await waitFor(() => expect(removeButtons().length).toBe(0))

    fireEvent.click(textButton(/^save$/i)!)
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('c1'))
    expect(onClose).toHaveBeenCalled()
    const persisted = await getCouncil('c1')
    // One removed, one added → still three… minus the removal = two seats,
    // and s1 is gone.
    expect(persisted?.seats.map((s) => s.id)).not.toContain('s1')
    expect(persisted?.seats.length).toBe(2)
  })

  it('saves a Consensus council through the mediator path', async () => {
    await createCouncil({
      id: 'con',
      socialStructure: 'consensus',
      seats: [seat('s1'), seat('s2', MODEL_B)],
      mediator: { modelId: MODEL_A, config: {} },
    })
    const onSaved = vi.fn()
    renderUi(
      <CouncilSettingsModal
        councilId="con"
        ollama={ollamaOff}
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    )
    await waitFor(() =>
      expect(document.body.textContent).toContain('Consensus'),
    )
    fireEvent.click(textButton(/^save$/i)!)
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('con'))
    // The mediator save ran (round-trips the slot).
    expect((await getCouncil('con'))?.mediator?.modelId).toBe(MODEL_A)
  })

  it('keeps the modal open and toasts when a save fails', async () => {
    await createCouncil({
      id: 'c1',
      socialStructure: 'trial',
      seats: [seat('s1'), seat('s2', MODEL_B)],
      judge: { modelId: MODEL_B, config: {} },
    })
    const onClose = vi.fn()
    renderUi(
      <CouncilSettingsModal
        councilId="c1"
        ollama={ollamaOff}
        onClose={onClose}
        onSaved={vi.fn()}
      />,
    )
    await waitFor(() =>
      expect(document.body.textContent).toContain('Untitled council'),
    )
    // Yank the council out from under the save — the first storage write
    // (updateSeat) then throws `council_not_found`, exercising the catch.
    await clearDb()
    fireEvent.click(textButton(/^save$/i)!)
    await waitFor(() => expect(toaster.negative).toHaveBeenCalled())
    // The modal stays put so edits aren't lost.
    expect(onClose).not.toHaveBeenCalled()
  })

  it('surfaces a thrown load error (not just a missing council)', async () => {
    const getSpy = vi
      .spyOn(db.councils, 'get')
      .mockRejectedValue(new Error('indexeddb unavailable'))
    renderUi(
      <CouncilSettingsModal
        councilId="c1"
        ollama={ollamaOff}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    )
    await waitFor(() =>
      expect(document.body.textContent).toContain('indexeddb unavailable'),
    )
    getSpy.mockRestore()
  })
})
