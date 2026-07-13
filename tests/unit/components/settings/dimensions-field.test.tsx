import { fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DimensionsField } from '@/components/settings/dimensions-field'
import { renderUi } from '../../helpers/render'

function mount(value: Parameters<typeof DimensionsField>[0]['value']) {
  const onChange = vi.fn()
  const utils = renderUi(
    <DimensionsField
      label="Rating dimensions"
      value={value}
      defaultValue={[{ name: 'accuracy' }, { name: 'insight' }]}
      onChange={onChange}
    />,
  )
  const textarea = utils.container.querySelector('textarea') as HTMLTextAreaElement
  return { ...utils, onChange, textarea }
}

describe('DimensionsField', () => {
  it('parses edited lines into dimension configs', () => {
    const { textarea, onChange } = mount(undefined)
    fireEvent.change(textarea, {
      target: { value: 'clarity: is it clear?\ntone' },
    })
    expect(onChange).toHaveBeenCalledWith([
      { name: 'clarity', description: 'is it clear?' },
      { name: 'tone' },
    ])
  })

  it('an empty textarea resets to undefined (fall back to the default rubric)', () => {
    const { textarea, onChange } = mount([{ name: 'x' }])
    fireEvent.change(textarea, { target: { value: '   ' } })
    expect(onChange).toHaveBeenCalledWith(undefined)
  })
})
