import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { analytics } from '@/analytics'
import { useCouncilActions } from '@/hooks/use-council-actions'
import {
  appendTurn,
  createCouncil,
  getCouncil,
  listCouncils,
  type CouncilSummary,
} from '@/storage/councils'
import { toaster } from 'baseui/toast'
import { clearDb } from '../helpers/db'
import { participantEvent, seat, turn } from '../helpers/fixtures'

vi.mock('baseui/toast', () => ({
  toaster: { info: vi.fn(), positive: vi.fn(), negative: vi.fn() },
}))

function harness(initial: CouncilSummary[], activeId: string | null = null) {
  const navigateToCouncil = vi.fn()
  const hook = renderHook(() => {
    const [councils, setCouncils] = useState(initial)
    const refreshList = async () => {
      setCouncils(await listCouncils())
    }
    const actions = useCouncilActions({
      councils,
      setCouncils,
      activeId,
      navigateToCouncil,
      refreshList,
    })
    return { councils, ...actions }
  })
  return { hook, navigateToCouncil }
}

beforeEach(async () => {
  vi.mocked(toaster.info).mockClear()
  await clearDb()
})

describe('delete flow', () => {
  it('two-step confirm deletes, clears the active route, and refreshes', async () => {
    await createCouncil({
      id: 'c1',
      socialStructure: 'roundtable',
      seats: [seat('s1')],
    })
    const summaries = await listCouncils()
    const { hook, navigateToCouncil } = harness(summaries, 'c1')

    act(() => hook.result.current.requestDelete('c1'))
    expect(hook.result.current.pendingDeleteCouncil?.id).toBe('c1')

    await act(() => hook.result.current.confirmDelete())
    expect(await getCouncil('c1')).toBeNull()
    expect(navigateToCouncil).toHaveBeenCalledWith(null)
    expect(hook.result.current.pendingDeleteId).toBeNull()
    expect(hook.result.current.councils).toEqual([])
  })

  it('counts one council-deleted analytics event per confirmed delete', async () => {
    const eventSpy = vi.spyOn(analytics, 'event')
    await createCouncil({
      id: 'c1',
      socialStructure: 'roundtable',
      seats: [seat('s1')],
    })
    const { hook } = harness(await listCouncils())
    act(() => hook.result.current.requestDelete('c1'))
    await act(() => hook.result.current.confirmDelete())
    expect(eventSpy).toHaveBeenCalledExactlyOnceWith('council-deleted')
    eventSpy.mockRestore()
  })

  it('cancel closes the dialog without deleting', async () => {
    await createCouncil({
      id: 'c1',
      socialStructure: 'roundtable',
      seats: [seat('s1')],
    })
    const { hook } = harness(await listCouncils())
    act(() => hook.result.current.requestDelete('c1'))
    act(() => hook.result.current.cancelDelete())
    await act(() => hook.result.current.confirmDelete()) // no pending id — no-op
    expect(await getCouncil('c1')).not.toBeNull()
  })
})

describe('rename flow', () => {
  it('renames optimistically and persists the clamp', async () => {
    await createCouncil({
      id: 'c1',
      socialStructure: 'roundtable',
      seats: [seat('s1')],
    })
    const { hook } = harness(await listCouncils())
    act(() => hook.result.current.openRename('c1'))
    expect(hook.result.current.pendingRenameCouncil?.id).toBe('c1')

    await act(() => hook.result.current.renameCouncil('c1', '  New name  '))
    expect((await getCouncil('c1'))?.title).toBe('New name')
    // Blank rename is a no-op.
    await act(() => hook.result.current.renameCouncil('c1', '   '))
    expect((await getCouncil('c1'))?.title).toBe('New name')
  })
})

describe('share flow', () => {
  it('loads the latest shareable turn into the modal payload', async () => {
    await createCouncil({
      id: 'c1',
      socialStructure: 'roundtable',
      seats: [seat('s1')],
    })
    await appendTurn(
      'c1',
      turn({ id: 't1', idx: 0, userMsg: 'shareable q', events: [participantEvent('s1')] }),
    )
    const { hook } = harness(await listCouncils())
    await act(() => hook.result.current.shareCouncil('c1'))
    expect(hook.result.current.sharePayload).toMatchObject({
      structure: 'roundtable',
      question: 'shareable q',
    })
    act(() => hook.result.current.closeShare())
    expect(hook.result.current.sharePayload).toBeNull()
  })

  it('toasts when nothing is shareable', async () => {
    await createCouncil({
      id: 'c1',
      socialStructure: 'roundtable',
      seats: [seat('s1')],
    })
    const { hook } = harness(await listCouncils())
    await act(() => hook.result.current.shareCouncil('c1'))
    expect(hook.result.current.sharePayload).toBeNull()
    expect(toaster.info).toHaveBeenCalledOnce()
  })
})
