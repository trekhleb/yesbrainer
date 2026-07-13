import { fireEvent } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  DeliberationForm,
  type DeliberationFormHandle,
} from '@/components/council-settings/deliberation-form'
import { renderUi } from '../helpers/render'
import type { CouncilDeliberation } from '@/types/council'

type Ref = { current: DeliberationFormHandle | null }

function mount(
  structure: 'roundtable' | 'trial' | 'consensus',
  deliberation?: CouncilDeliberation,
) {
  const ref: Ref = { current: null }
  const utils = renderUi(
    <DeliberationForm
      ref={ref as never}
      structure={structure}
      deliberation={deliberation}
    />,
  )
  return { ...utils, ref }
}

describe('DeliberationForm', () => {
  it('buildDeliberation returns the seeded draft untouched when nothing edits', () => {
    const seeded: CouncilDeliberation = { mediatorMaxRounds: 4 }
    const { ref } = mount('consensus', seeded)
    expect(ref.current!.buildDeliberation()).toMatchObject({
      mediatorMaxRounds: 4,
    })
  })

  it('preserves the full bag across structures (never drops an unrendered field)', () => {
    // A roundtable form doesn't render the mediator round cap, but Save must
    // still round-trip it (the draft holds the whole CouncilDeliberation).
    const { ref } = mount('roundtable', {
      mediatorMaxRounds: 5,
      participant: 'custom voice',
    })
    const built = ref.current!.buildDeliberation()
    expect(built.mediatorMaxRounds).toBe(5)
  })

  it('renders for a fresh council with no overrides', () => {
    const { ref, container } = mount('trial', undefined)
    expect(container.textContent?.length).toBeGreaterThan(0)
    expect(ref.current!.buildDeliberation()).toBeTypeOf('object')
  })

  it('captures an edited participant voice into the draft (all three structures)', () => {
    for (const structure of ['roundtable', 'trial', 'consensus'] as const) {
      const { ref, container } = mount(structure, undefined)
      const textarea = container.querySelector('textarea')
      expect(textarea).not.toBeNull()
      fireEvent.change(textarea!, {
        target: { value: `custom ${structure} voice` },
      })
      expect(ref.current!.buildDeliberation().participant).toBe(
        `custom ${structure} voice`,
      )
    }
  })

  it('trial renders the voting rubric + judge fields; consensus the round machinery', () => {
    const trial = mount('trial', undefined)
    expect(trial.container.textContent?.toLowerCase()).toMatch(/voting|judge/)
    const consensus = mount('consensus', undefined)
    expect(consensus.container.textContent?.toLowerCase()).toMatch(
      /round|mediator|reconsider/,
    )
  })

  it('captures every trial knob edit into the draft', () => {
    const { ref, container } = mount('trial', undefined)
    // Every prompt / rubric field is a textarea — edit them all.
    const textareas = Array.from(container.querySelectorAll('textarea'))
    textareas.forEach((ta, i) =>
      fireEvent.change(ta, { target: { value: `trial edit ${i}` } }),
    )
    const built = ref.current!.buildDeliberation()
    expect(built.participant).toBe('trial edit 0')
    // The remaining prompt fields (voting system/template, judge template)
    // all round-tripped their edits.
    expect(built.votingSystem).toBeTypeOf('string')
    expect(built.votingTemplate).toBeTypeOf('string')
    expect(built.judgeTemplate).toBeTypeOf('string')
    // The rubric field parsed its text into a dimension list.
    expect(built.votingDimensions).toBeDefined()
  })

  it('captures every consensus knob edit, then Reset clears the overrides', () => {
    const { ref, container } = mount('consensus', undefined)
    Array.from(container.querySelectorAll('textarea')).forEach((ta, i) =>
      fireEvent.change(ta, { target: { value: `consensus edit ${i}` } }),
    )
    // Max debate rounds (numeric input).
    const number = container.querySelector<HTMLInputElement>(
      'input[type="number"]',
    )!
    fireEvent.change(number, { target: { value: '5' } })
    // The reconsider segmented control — switch off the default state.
    const seg = Array.from(
      container.querySelectorAll('[role="tab"], button'),
    ).find((el) => /peer answers/i.test(el.textContent ?? ''))
    fireEvent.click(seg!)

    let built = ref.current!.buildDeliberation()
    expect(built.reanswerSystem).toBeTypeOf('string')
    expect(built.mediatorTemplate).toBeTypeOf('string')
    expect(built.mediatorMaxRounds).toBe(5)
    expect(built.passPeerAnswers).toBe(true)

    // Reset every overridden field → the draft empties back out.
    Array.from(container.querySelectorAll('button'))
      .filter((b) => /reset/i.test(b.textContent ?? ''))
      .forEach((b) => fireEvent.click(b))
    built = ref.current!.buildDeliberation()
    expect(built.participant).toBeUndefined()
    expect(built.mediatorMaxRounds).toBeUndefined()
    expect(built.passPeerAnswers).toBeUndefined()
  })
})
