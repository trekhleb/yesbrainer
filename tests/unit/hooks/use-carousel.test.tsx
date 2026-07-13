import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCarousel } from '@/hooks/use-carousel'
import { stubRects, syncRaf } from '../helpers/geometry'

/**
 * Build a `scroller > track > card[]` DOM with deterministic geometry and
 * assign it to the hook's ref, so the scroll math runs on real numbers
 * without depending on render timing.
 */
function buildLane(scrollLeft = 0): HTMLDivElement {
  const scroller = document.createElement('div')
  const track = document.createElement('div')
  scroller.appendChild(track)
  const cards = [0, 1, 2].map(() => {
    const c = document.createElement('div')
    track.appendChild(c)
    return c
  })
  Object.defineProperty(scroller, 'clientWidth', { value: 200 })
  scroller.scrollLeft = scrollLeft
  scroller.scrollTo = vi.fn((opts) => {
    if (typeof opts === 'object' && opts?.left != null) scroller.scrollLeft = opts.left
  }) as unknown as typeof scroller.scrollTo
  stubRects([
    { el: scroller, left: 0, width: 200 },
    { el: cards[0]!, left: 0 - scrollLeft, width: 100 },
    { el: cards[1]!, left: 100 - scrollLeft, width: 100 },
    { el: cards[2]!, left: 200 - scrollLeft, width: 100 },
  ])
  return scroller
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useCarousel', () => {
  it('tracks the card nearest the lane centre on scroll', () => {
    syncRaf()
    const { result } = renderHook(() => useCarousel(3))
    ;(result.current.scrollerRef as { current: HTMLDivElement }).current =
      buildLane(50) // card 1 now 50–150, straddling centre (100)
    act(() => result.current.onScroll())
    expect(result.current.activeIdx).toBe(1)
  })

  it('jumpTo centre-scrolls a card into focus', () => {
    const { result } = renderHook(() => useCarousel(3))
    const scroller = buildLane(0)
    ;(result.current.scrollerRef as { current: HTMLDivElement }).current =
      scroller
    act(() => result.current.jumpTo(2))
    // card 2 at 200 wide 100, lane 200 → 200 - (200-100)/2 = 150.
    expect(scroller.scrollLeft).toBe(150)
  })

  it('seeds activeIdx to initialIdx (opens on the final round)', () => {
    const { result } = renderHook(() => useCarousel(3, { initialIdx: 2 }))
    expect(result.current.activeIdx).toBe(2)
  })

  it('jumpTo is a no-op with no scroller mounted', () => {
    const { result } = renderHook(() => useCarousel(3))
    expect(() => act(() => result.current.jumpTo(1))).not.toThrow()
  })

  it('scrolls to initialIdx on first layout once the lane exists', () => {
    const { result, rerender } = renderHook(
      ({ n }: { n: number }) => useCarousel(n, { initialIdx: 2 }),
      { initialProps: { n: 3 } },
    )
    // The lane mounts after the first layout pass; the init effect re-runs on
    // the itemCount change and lands the scroll on the final round.
    const scroller = buildLane(0)
    ;(result.current.scrollerRef as { current: HTMLDivElement }).current =
      scroller
    rerender({ n: 4 })
    // card 2 at 200 wide 100, lane 200 → 200 - (200-100)/2 = 150.
    expect(scroller.scrollLeft).toBe(150)
  })
})
