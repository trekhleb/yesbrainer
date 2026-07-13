import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useRef } from 'react'
import {
  laneCardGeometry,
  useLaneLayout,
  useLocateFlash,
} from '@/hooks/use-lane-layout'
import { stubRects } from '../helpers/geometry'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('laneCardGeometry', () => {
  it('gives carousel cards a peek width, grid cards flex columns, full nothing', () => {
    expect(laneCardGeometry('carousel').width).toBe('82%')
    expect(laneCardGeometry('carousel').scrollSnapAlign).toBe('center')
    expect(laneCardGeometry('grid')).toMatchObject({ flex: '1 1 0%', minWidth: 0 })
    expect(laneCardGeometry('full')).toEqual({})
  })
})

describe('useLaneLayout', () => {
  function mountWith(cardCount: number, width: number) {
    const el = document.createElement('div')
    stubRects([{ el, left: 0, width }])
    return renderHook(() => {
      const ref = useRef<HTMLElement | null>(el)
      return useLaneLayout(cardCount, ref)
    })
  }

  it('carousels a single card and 4+ cards regardless of width', () => {
    expect(mountWith(1, 4000).result.current).toBe('carousel')
    expect(mountWith(4, 4000).result.current).toBe('carousel')
  })

  it('grids 2–3 cards only when every column clears the readability floor', () => {
    // 3 cards need 3*360 + 2*16 = 1112px.
    expect(mountWith(3, 1200).result.current).toBe('grid')
    expect(mountWith(3, 1000).result.current).toBe('carousel')
    expect(mountWith(2, 800).result.current).toBe('grid')
  })
})

describe('useLocateFlash', () => {
  it('flashes an index then clears after the timer, restarting on re-click', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useLocateFlash())
    act(() => result.current.flash(2))
    expect(result.current.flashIdx).toBe(2)
    act(() => {
      vi.advanceTimersByTime(600)
    })
    act(() => result.current.flash(1)) // re-click restarts
    expect(result.current.flashIdx).toBe(1)
    act(() => {
      vi.advanceTimersByTime(1100)
    })
    expect(result.current.flashIdx).toBeNull()
  })
})
