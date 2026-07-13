import { vi } from 'vitest'

/**
 * jsdom returns all-zero layout rects. Give a set of elements deterministic
 * geometry (left/width laid out end-to-end, optional viewport-relative top)
 * so scroll/lane math runs. Re-stubbing an element replaces its geometry.
 */
export function stubRects(
  entries: Array<{ el: Element; left: number; width: number; top?: number }>,
): void {
  for (const { el, width, left, top = 0 } of entries) {
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left,
      right: left + width,
      width,
      top,
      bottom: top,
      height: 0,
      x: left,
      y: top,
      toJSON: () => ({}),
    } as DOMRect)
  }
}

/** rAF that fires synchronously — carousel onScroll defers its work into one. */
export function syncRaf(): void {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0)
    return 0
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
}
