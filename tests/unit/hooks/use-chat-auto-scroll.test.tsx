import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useChatAutoScroll } from '@/hooks/use-chat-auto-scroll'
import { stubRects } from '../helpers/geometry'

/** A thread that wires the refs the hook expects. `withOpenAnchor` mirrors
 *  the latest turn rendering the open-landing marker. */
function Thread({
  pinKey,
  openAtTop,
  withOpenAnchor,
}: {
  pinKey: string | null
  openAtTop?: boolean
  withOpenAnchor?: boolean
}) {
  const { scrollRef, anchorRef, spacerRef, openAnchorRef } = useChatAutoScroll(
    pinKey,
    openAtTop !== undefined ? { openAtTop } : undefined,
  )
  return (
    <div ref={scrollRef as React.RefObject<HTMLDivElement>} data-testid="scroller">
      <div ref={anchorRef} data-testid="anchor" />
      <div>turn</div>
      {withOpenAnchor ? <div ref={openAnchorRef} data-testid="open-anchor" /> : null}
      <div ref={spacerRef} data-testid="spacer" />
    </div>
  )
}

describe('useChatAutoScroll', () => {
  it('mounts and wires refs without throwing (pin on new turn)', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const { getByTestId, rerender } = render(<Thread pinKey={null} />)
    expect(getByTestId('scroller')).toBeTruthy()
    // A new pin key triggers the pin-to-top layout effect.
    rerender(<Thread pinKey="turn-1" />)
    expect(getByTestId('anchor')).toBeTruthy()
  })

  it('supports the demo open-at-top mode', () => {
    Element.prototype.scrollIntoView = vi.fn()
    const { getByTestId } = render(<Thread pinKey="demo" openAtTop />)
    expect(getByTestId('spacer')).toBeTruthy()
  })

  it('opening lands on the result anchor and re-asserts across early commits', () => {
    Element.prototype.scrollIntoView = vi.fn()
    const { getByTestId, rerender } = render(
      <Thread pinKey={null} withOpenAnchor />,
    )
    const scroller = getByTestId('scroller') as HTMLDivElement
    const openAnchor = getByTestId('open-anchor')
    Object.defineProperty(scroller, 'clientHeight', {
      value: 500,
      configurable: true,
    })
    Object.defineProperty(scroller, 'scrollHeight', {
      value: 1200,
      configurable: true,
    })
    stubRects([
      { el: scroller, left: 0, width: 800 },
      { el: openAnchor, left: 0, width: 800, top: 400 },
    ])
    // Still inside the open-settle window: the next commit (re-)lands on the
    // anchor's content offset (top 400 while unscrolled → 400).
    rerender(<Thread pinKey={null} withOpenAnchor />)
    expect(scroller.scrollTop).toBe(400)
    // Regression: the lanes' pre-paint carousel→grid flip re-flows the
    // content taller after the first landing. The anchor now sits at content
    // offset 700 (viewport-relative 300 while scrolled to 400) — the next
    // commit must re-land there instead of stranding the view.
    stubRects([
      { el: scroller, left: 0, width: 800 },
      { el: openAnchor, left: 0, width: 800, top: 300 },
    ])
    rerender(<Thread pinKey={null} withOpenAnchor />)
    expect(scroller.scrollTop).toBe(700)
  })

  it('a user gesture ends the open settle — the landing never fights the user', () => {
    Element.prototype.scrollIntoView = vi.fn()
    const { getByTestId, rerender } = render(
      <Thread pinKey={null} withOpenAnchor />,
    )
    const scroller = getByTestId('scroller') as HTMLDivElement
    const openAnchor = getByTestId('open-anchor')
    Object.defineProperty(scroller, 'clientHeight', {
      value: 500,
      configurable: true,
    })
    Object.defineProperty(scroller, 'scrollHeight', {
      value: 1200,
      configurable: true,
    })
    stubRects([
      { el: scroller, left: 0, width: 800 },
      { el: openAnchor, left: 0, width: 800, top: 400 },
    ])
    rerender(<Thread pinKey={null} withOpenAnchor />)
    expect(scroller.scrollTop).toBe(400)
    fireEvent.wheel(scroller)
    stubRects([
      { el: scroller, left: 0, width: 800 },
      { el: openAnchor, left: 0, width: 800, top: 300 },
    ])
    rerender(<Thread pinKey={null} withOpenAnchor />)
    expect(scroller.scrollTop).toBe(400)
  })

  it('opening falls back to the bottom when no result anchor is rendered', () => {
    Element.prototype.scrollIntoView = vi.fn()
    const { getByTestId, rerender } = render(<Thread pinKey={null} />)
    const scroller = getByTestId('scroller') as HTMLDivElement
    Object.defineProperty(scroller, 'clientHeight', {
      value: 500,
      configurable: true,
    })
    Object.defineProperty(scroller, 'scrollHeight', {
      value: 900,
      configurable: true,
    })
    stubRects([{ el: scroller, left: 0, width: 800 }])
    rerender(<Thread pinKey={null} />)
    expect(scroller.scrollTop).toBe(900)
  })

  it('demo open-at-top never writes scrollTop, even while content reflows', () => {
    Element.prototype.scrollIntoView = vi.fn()
    const { getByTestId, rerender } = render(
      <Thread pinKey={null} openAtTop withOpenAnchor />,
    )
    const scroller = getByTestId('scroller') as HTMLDivElement
    const openAnchor = getByTestId('open-anchor')
    Object.defineProperty(scroller, 'clientHeight', {
      value: 500,
      configurable: true,
    })
    Object.defineProperty(scroller, 'scrollHeight', {
      value: 1200,
      configurable: true,
    })
    stubRects([
      { el: scroller, left: 0, width: 800 },
      { el: openAnchor, left: 0, width: 800, top: 400 },
    ])
    rerender(<Thread pinKey={null} openAtTop withOpenAnchor />)
    expect(scroller.scrollTop).toBe(0)
  })

  it('reserves spacer height and pins to the live edge once at the bottom', () => {
    Element.prototype.scrollIntoView = vi.fn()
    const { getByTestId, rerender } = render(<Thread pinKey="t1" />)
    const scroller = getByTestId('scroller') as HTMLDivElement
    const anchor = getByTestId('anchor')
    const spacer = getByTestId('spacer')
    // Viewport (500) taller than content (300) → the spacer reserves 200 so
    // the question can still pin to the top.
    Object.defineProperty(scroller, 'clientHeight', {
      value: 500,
      configurable: true,
    })
    Object.defineProperty(scroller, 'scrollHeight', {
      value: 300,
      configurable: true,
    })
    stubRects([
      { el: scroller, left: 0, width: 300 },
      { el: anchor, left: 0, width: 300 },
    ])
    // Content shorter than the viewport → a scroll reads as "at the bottom",
    // engaging follow.
    scroller.scrollTop = 0
    fireEvent.scroll(scroller)
    // Re-render (same pin) re-runs the layout effect: sizes the spacer, then
    // follows the live edge.
    rerender(<Thread pinKey="t1" />)
    expect(spacer.style.height).toBe('200px')
    expect(scroller.scrollTop).toBe(300)
  })
})
