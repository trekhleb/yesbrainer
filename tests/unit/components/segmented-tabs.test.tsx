import { fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SegmentedTabs } from '@/components/segmented-tabs'
import { renderUi } from '../helpers/render'

const tabs = [
  { key: 'a', ariaLabel: 'Tab A', content: (active: boolean) => (active ? 'A*' : 'A') },
  { key: 'b', ariaLabel: 'Tab B', content: () => 'B' },
  { key: 'c', ariaLabel: 'Tab C', content: () => 'C' },
]

describe('SegmentedTabs', () => {
  it('renders a segment per tab and jumps on click (switcher mode)', () => {
    const onJump = vi.fn()
    const { container } = renderUi(
      <SegmentedTabs tabs={tabs} activeIdx={0} onJump={onJump} ariaLabel="lane" />,
    )
    const segs = container.querySelectorAll('button[aria-label^="Tab"]')
    expect(segs).toHaveLength(3)
    fireEvent.click(segs[2]!)
    expect(onJump).toHaveBeenCalledWith(2)
  })

  it('marks the active tab and expands its content', () => {
    const { container } = renderUi(
      <SegmentedTabs tabs={tabs} activeIdx={0} onJump={vi.fn()} ariaLabel="lane" />,
    )
    expect(container.textContent).toContain('A*') // active label expanded
  })

  it('arrow keys move the active tab in switcher mode', () => {
    const onJump = vi.fn()
    const { container } = renderUi(
      <SegmentedTabs tabs={tabs} activeIdx={1} onJump={onJump} ariaLabel="lane" />,
    )
    const tablist = container.querySelector('[role="tablist"]')!
    fireEvent.keyDown(tablist, { key: 'ArrowRight' })
    expect(onJump).toHaveBeenCalledWith(2)
    fireEvent.keyDown(tablist, { key: 'ArrowLeft' })
    expect(onJump).toHaveBeenCalledWith(0)
    // Non-arrow keys are ignored (roving nav only).
    onJump.mockClear()
    fireEvent.keyDown(tablist, { key: 'Enter' })
    expect(onJump).not.toHaveBeenCalled()
  })

  it('legend mode ignores arrow keys', () => {
    const onJump = vi.fn()
    const { container } = renderUi(
      <SegmentedTabs
        tabs={tabs}
        activeIdx={1}
        onJump={onJump}
        ariaLabel="legend"
        mode="legend"
      />,
    )
    fireEvent.keyDown(container.querySelector('[role="group"]')!, {
      key: 'ArrowRight',
    })
    expect(onJump).not.toHaveBeenCalled()
  })

  it('legend mode has no active state and still locates on click', () => {
    const onJump = vi.fn()
    const { container } = renderUi(
      <SegmentedTabs
        tabs={tabs}
        activeIdx={1}
        onJump={onJump}
        ariaLabel="legend"
        mode="legend"
      />,
    )
    fireEvent.click(container.querySelectorAll('button[aria-label^="Tab"]')[0]!)
    expect(onJump).toHaveBeenCalledWith(0)
  })
})
