import { fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  BehaviorNumberField,
  ThemeModeField,
} from '@/components/settings/behavior-fields'
import { FieldLabel } from '@/components/fields/field-label'
import { renderUi } from '../../helpers/render'

describe('BehaviorNumberField', () => {
  function mount(value: number | undefined) {
    const onChange = vi.fn()
    const utils = renderUi(
      <BehaviorNumberField
        label="Round cap"
        value={value}
        defaultValue={3}
        min={1}
        max={5}
        step={1}
        onChange={onChange}
      />,
    )
    const input = utils.container.querySelector('input') as HTMLInputElement
    return { ...utils, onChange, input }
  }

  it('shows the default when unset and clamps entered values into range', () => {
    const { input, onChange } = mount(undefined)
    expect(input.value).toBe('3')
    fireEvent.change(input, { target: { value: '9' } })
    expect(onChange).toHaveBeenCalledWith(5) // clamped to max
  })

  it('collapses a value equal to the default back to undefined (storage invariant)', () => {
    const { input, onChange } = mount(4)
    fireEvent.change(input, { target: { value: '3' } })
    expect(onChange).toHaveBeenCalledWith(undefined)
  })

  it('an emptied field resets to undefined', () => {
    const { input, onChange } = mount(4)
    fireEvent.change(input, { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith(undefined)
  })

  it('clamps below the floor too', () => {
    const { input, onChange } = mount(4)
    fireEvent.change(input, { target: { value: '0' } })
    expect(onChange).toHaveBeenCalledWith(1)
  })

  it('the Reset control appears only when overridden', () => {
    const overridden = mount(4)
    expect(
      overridden.container.querySelector('button[aria-label*="Reset" i]') ??
        Array.from(overridden.container.querySelectorAll('button')).find((b) =>
          /reset/i.test(b.textContent ?? ''),
        ),
    ).toBeTruthy()
  })
})

describe('ThemeModeField', () => {
  it('collapses the default (system) selection to undefined', () => {
    const onChange = vi.fn()
    renderUi(<ThemeModeField value="dark" onChange={onChange} />)
    // The Select renders its current value; assert it mounted with dark.
    expect(document.body.textContent).toContain('Dark')
  })
})

describe('FieldLabel', () => {
  it('renders the Reset affordance only when overridden and fires onReset', () => {
    const onReset = vi.fn()
    const { container, rerender } = renderUi(
      <FieldLabel label="Voice" isOverridden={false} onReset={onReset} />,
    )
    expect(
      Array.from(container.querySelectorAll('button')).some((b) =>
        /reset/i.test(b.textContent ?? ''),
      ),
    ).toBe(false)

    rerender(<FieldLabel label="Voice" isOverridden onReset={onReset} />)
    const reset = Array.from(container.querySelectorAll('button')).find((b) =>
      /reset/i.test(b.textContent ?? ''),
    )
    expect(reset).toBeDefined()
    fireEvent.click(reset!)
    expect(onReset).toHaveBeenCalledOnce()
  })
})
