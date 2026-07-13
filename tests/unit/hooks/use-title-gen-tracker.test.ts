import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useTitleGenTracker } from '@/hooks/use-title-gen-tracker'
import type { CouncilSummary } from '@/storage/councils'

describe('useTitleGenTracker', () => {
  it('tracks in-flight ids and swaps the sidebar title atomically on finish', () => {
    const setCouncils = vi.fn()
    const { result } = renderHook(() => useTitleGenTracker(setCouncils))

    act(() => result.current.onTitleGenStart('c1'))
    expect(result.current.generatingTitleIds.has('c1')).toBe(true)
    // Idempotent start keeps the same set instance semantics.
    act(() => result.current.onTitleGenStart('c1'))
    expect(result.current.generatingTitleIds.size).toBe(1)

    act(() => result.current.onTitleGenFinish('c1', 'Fresh title'))
    expect(result.current.generatingTitleIds.size).toBe(0)
    const updater = setCouncils.mock.calls[0]?.[0] as (
      cs: CouncilSummary[],
    ) => CouncilSummary[]
    const updated = updater([
      { id: 'c1', title: 'old', createdAt: 1, socialStructure: 'roundtable', modelIds: [], tokenTotal: { inputTokens: 0, outputTokens: 0 } },
      { id: 'c2', title: 'other', createdAt: 1, socialStructure: 'roundtable', modelIds: [], tokenTotal: { inputTokens: 0, outputTokens: 0 } },
    ])
    expect(updated[0]?.title).toBe('Fresh title')
    expect(updated[1]?.title).toBe('other')
  })

  it('a finish without a title only clears the spinner', () => {
    const setCouncils = vi.fn()
    const { result } = renderHook(() => useTitleGenTracker(setCouncils))
    act(() => result.current.onTitleGenStart('c1'))
    act(() => result.current.onTitleGenFinish('c1'))
    expect(result.current.generatingTitleIds.size).toBe(0)
    expect(setCouncils).not.toHaveBeenCalled()
  })
})
