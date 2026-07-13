import { afterEach, describe, expect, it, vi } from 'vitest'
import { findScrollParent, scrollColumnTopIntoView } from '@/utils/scroll'
import { stubRects } from '../helpers/geometry'

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('findScrollParent', () => {
  it('returns the nearest overflow-y auto/scroll ancestor, else null', () => {
    const scroller = document.createElement('div')
    scroller.style.overflowY = 'auto'
    const child = document.createElement('div')
    scroller.appendChild(child)
    document.body.appendChild(scroller)
    expect(findScrollParent(child)).toBe(scroller)

    const loose = document.createElement('div')
    document.body.appendChild(loose)
    expect(findScrollParent(loose)).toBeNull()
  })
})

describe('scrollColumnTopIntoView', () => {
  it('pulls the column top under the sticky header when scrolled into it', () => {
    const scroller = document.createElement('div')
    scroller.style.overflowY = 'auto'
    const section = document.createElement('section')
    const header = document.createElement('header')
    Object.defineProperty(header, 'offsetHeight', { value: 40, configurable: true })
    const lane = document.createElement('div')
    section.append(header, lane)
    scroller.appendChild(section)
    document.body.appendChild(scroller)

    // Both rects at top 0 → the reading line (0 + headerHeight) sits below the
    // lane top, a negative delta → scroll up.
    stubRects([
      { el: scroller, left: 0, width: 300 },
      { el: lane, left: 0, width: 300 },
    ])
    scroller.scrollTop = 100
    const scrollTo = vi.fn()
    scroller.scrollTo = scrollTo as unknown as typeof scroller.scrollTo

    scrollColumnTopIntoView(lane)
    expect(scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: 'smooth' }),
    )
  })

  it('no-ops when there is no scroll parent', () => {
    const lane = document.createElement('div')
    document.body.appendChild(lane)
    expect(() => scrollColumnTopIntoView(lane)).not.toThrow()
  })
})
