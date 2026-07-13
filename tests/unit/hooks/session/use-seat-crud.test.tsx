import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { useSeatCRUD } from '@/hooks/session/use-seat-crud'
import { updateSeat } from '@/storage/councils'
import { council, seat } from '../../helpers/fixtures'
import type { Council } from '@/types/council'

vi.mock('@/storage/councils', () => ({ updateSeat: vi.fn() }))
const updateSeatMock = vi.mocked(updateSeat)

function harness(initial: Council | null) {
  return renderHook(() => {
    const [c, setCouncil] = useState<Council | null>(initial)
    return { c, ...useSeatCRUD({ council: c, setCouncil }) }
  })
}

beforeEach(() => {
  updateSeatMock.mockReset()
  updateSeatMock.mockResolvedValue(undefined)
})

describe('useSeatCRUD', () => {
  it('merges the partial config, persists it, and mirrors locally', async () => {
    const c = council({ seats: [seat('s1'), seat('s2')] })
    const hook = harness(c)
    await act(() =>
      hook.result.current.updateSeatConfig('s1', { temperature: 0.7 }),
    )
    expect(updateSeatMock).toHaveBeenCalledWith(c.id, 's1', {
      config: { temperature: 0.7 },
    })
    expect(hook.result.current.c?.seats[0]?.config.temperature).toBe(0.7)
    expect(hook.result.current.c?.seats[1]?.config).toEqual({})
  })

  it('is a no-op for a null council or an unknown seat', async () => {
    const nullHook = harness(null)
    await act(() =>
      nullHook.result.current.updateSeatConfig('s1', { temperature: 1 }),
    )
    const hook = harness(council({ seats: [seat('s1')] }))
    await act(() =>
      hook.result.current.updateSeatConfig('ghost', { temperature: 1 }),
    )
    expect(updateSeatMock).not.toHaveBeenCalled()
  })
})
