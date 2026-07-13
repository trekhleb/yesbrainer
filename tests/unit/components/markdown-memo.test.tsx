import { fireEvent, render } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Guards the highest-value optimization: `memo(Markdown)`. react-markdown has
 * no internal parse cache — its body re-parses on every render — so without the
 * memo, a token streamed into *one* pane re-parses every settled message in the
 * thread. `parseSpy` stands in for that parse: it fires once per real
 * react-markdown render, so its call count is exactly "how many times did this
 * message re-parse".
 */
const { parseSpy } = vi.hoisted(() => ({ parseSpy: vi.fn() }))

vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => {
    parseSpy(children)
    return <div data-testid="rm">{children}</div>
  },
}))
// react-markdown is mocked, so the highlighter is never used — stub it to keep
// the test hermetic and skip the real Shiki singleton init.
vi.mock('@/utils/shiki-highlighter', () => ({ getShikiHighlighter: () => ({}) }))

import { Markdown } from '@/components/markdown'

function Harness({ text }: { text: string }) {
  const [n, setN] = useState(0)
  return (
    <>
      <button onClick={() => setN((v) => v + 1)}>bump {n}</button>
      <Markdown>{text}</Markdown>
    </>
  )
}

describe('memo(Markdown)', () => {
  beforeEach(() => parseSpy.mockClear())

  it('does not re-parse when a parent re-renders with unchanged text', () => {
    const { getByText } = render(<Harness text="hello **world**" />)
    expect(parseSpy).toHaveBeenCalledTimes(1)
    // Parent re-renders (as it would on every streamed token elsewhere in the
    // thread) — the memoized message must not re-parse.
    fireEvent.click(getByText(/bump/))
    fireEvent.click(getByText(/bump/))
    expect(parseSpy).toHaveBeenCalledTimes(1)
  })

  it('re-parses only when the message text actually changes', () => {
    const { rerender } = render(<Harness text="first" />)
    expect(parseSpy).toHaveBeenCalledTimes(1)
    rerender(<Harness text="second" />)
    expect(parseSpy).toHaveBeenCalledTimes(2)
    expect(parseSpy).toHaveBeenLastCalledWith('second')
  })
})
