import { fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CouncilsTab } from '@/components/settings/councils-tab'
import type { BehaviorSettings } from '@/storage/behavior'
import type { UserPrompts } from '@/storage/prompts'
import { renderUi } from '../../helpers/render'

function mount() {
  // The setters are updater-style; invoke the updater so the update closures
  // (`(p) => ({ ...p, [key]: next })`) actually run.
  const setPrompts = vi.fn((u: (p: UserPrompts) => UserPrompts) => {
    u({})
  })
  const setBehavior = vi.fn((u: (b: BehaviorSettings) => BehaviorSettings) => {
    u({})
  })
  const utils = renderUi(
    <CouncilsTab
      prompts={{}}
      setPrompts={setPrompts}
      behavior={{}}
      setBehavior={setBehavior}
    />,
  )
  return { ...utils, setPrompts, setBehavior }
}

describe('CouncilsTab', () => {
  it('renders a panel per structure plus Council titles', () => {
    const { container } = mount()
    const text = container.textContent ?? ''
    expect(text).toContain('Parallel answers')
    expect(text).toContain('Consensus debate')
    expect(text).toContain('Trial verdict')
    expect(text).toContain('Council titles')
  })

  it('field edits across every panel write through the binding', () => {
    const { container, setPrompts, setBehavior } = mount()
    // Expand every accordion panel so its fields mount.
    Array.from(container.querySelectorAll('[aria-expanded]')).forEach((el) =>
      fireEvent.click(el),
    )
    // Edit every prompt / rubric textarea now visible.
    const textareas = Array.from(container.querySelectorAll('textarea'))
    expect(textareas.length).toBeGreaterThan(0)
    textareas.forEach((ta, i) =>
      fireEvent.change(ta, { target: { value: `edit ${i}` } }),
    )
    // The mediator max-rounds numeric input.
    container.querySelectorAll<HTMLInputElement>('input[type="number"]').forEach(
      (n) => fireEvent.change(n, { target: { value: '5' } }),
    )
    // The reconsider segmented control.
    const seg = Array.from(
      container.querySelectorAll('[role="tab"], button'),
    ).find((el) => /peer answers/i.test(el.textContent ?? ''))
    if (seg) fireEvent.click(seg)

    // Both binding kinds (prompts + behavior) were driven.
    expect(setPrompts).toHaveBeenCalled()
    expect(setBehavior).toHaveBeenCalled()
  })
})
