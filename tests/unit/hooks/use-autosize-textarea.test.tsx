import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAutosizeTextarea } from '@/hooks/use-autosize-textarea'

function Field(props: { value: string; maxHeight?: number; minRows?: number }) {
  const ref = useAutosizeTextarea({
    value: props.value,
    maxHeight: props.maxHeight ?? 100,
    ...(props.minRows !== undefined ? { minRows: props.minRows } : {}),
  })
  return <textarea ref={ref} data-testid="ta" />
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useAutosizeTextarea', () => {
  it('sizes the textarea to its content on value change', () => {
    const { getByTestId } = render(<Field value="hello" />)
    // jsdom reports scrollHeight 0, so the height clamps to the floor — the
    // point is that a concrete px height was written (the resize ran).
    expect((getByTestId('ta') as HTMLTextAreaElement).style.height).toMatch(
      /px$/,
    )
  })

  it('recomputes when the observed width changes', () => {
    let observerCb: () => void = () => {}
    class FakeResizeObserver {
      constructor(cb: () => void) {
        observerCb = cb
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)

    const { getByTestId } = render(<Field value="x" />)
    const ta = getByTestId('ta') as HTMLTextAreaElement
    // Width changed since the effect captured `lastWidth` (0 in jsdom) → the
    // observer callback runs a resize.
    Object.defineProperty(ta, 'clientWidth', { value: 321, configurable: true })
    const setHeight = vi.spyOn(ta.style, 'height', 'set')
    act(() => observerCb())
    expect(setHeight).toHaveBeenCalled()

    // A callback with no width change is a no-op (height-only, e.g. keyboard).
    setHeight.mockClear()
    act(() => observerCb())
    expect(setHeight).not.toHaveBeenCalled()
  })
})
