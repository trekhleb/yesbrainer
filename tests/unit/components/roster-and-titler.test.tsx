import { fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SynthesiserPicker } from '@/components/new-council/synthesiser-picker'
import { RosterEditor } from '@/components/roster-editor'
import { TitleModelField } from '@/components/settings/behavior-fields'
import { buildModelOptions } from '@/components/model-options'
import { renderUi } from '../helpers/render'

const ollama = { enabled: false, reachable: false, checked: true }

beforeEach(() => {
  localStorage.setItem(
    'yesbrainer:keys',
    JSON.stringify({ anthropic: 'k', openai: 'k' }),
  )
})

function modelOptions() {
  return buildModelOptions({ anthropic: 'k', openai: 'k' }, ollama)
}

function expectPickerAcceptsImmediateSearch(
  container: HTMLElement,
): void {
  const input = container.querySelector('input')
  expect(input).not.toBeNull()
  expect(input?.readOnly).toBe(false)
  expect(input?.inputMode).not.toBe('none')
  fireEvent.click(input!)
  fireEvent.change(input!, { target: { value: 'zz' } })
  expect(document.activeElement).toBe(input)
  expect(input?.value).toBe('zz')
  expect(document.body.textContent).toContain('No results')
}

describe('RosterEditor', () => {
  function mount(over: Partial<Parameters<typeof RosterEditor>[0]> = {}) {
    const handlers = {
      onChangeModel: vi.fn(),
      onToggleConfig: vi.fn(),
      onAdd: vi.fn(),
      onRemove: vi.fn(),
      onApplySmartest: vi.fn(),
    }
    const utils = renderUi(
      <RosterEditor
        rows={[
          { key: 's1', modelId: 'anthropic:claude-sonnet-5', customized: false },
          { key: 's2', modelId: 'openai:gpt-5.4', customized: true },
        ]}
        structure="trial"
        modelOptions={modelOptions()}
        noUsableModel={false}
        expandedKeys={new Set()}
        renderConfig={() => null}
        {...handlers}
        {...over}
      />,
    )
    return { ...utils, ...handlers }
  }

  it('renders a row per seat and fires Add', () => {
    const { container, onAdd } = mount()
    const add = Array.from(container.querySelectorAll('button')).find((b) =>
      /add|\+/i.test(`${b.getAttribute('aria-label') ?? ''} ${b.textContent ?? ''}`),
    )
    fireEvent.click(add!)
    expect(onAdd).toHaveBeenCalled()
  })

  it('fires Remove for a seat when more than one exists', () => {
    const { container, onRemove } = mount()
    const remove = Array.from(container.querySelectorAll('button')).find((b) =>
      /remove|delete/i.test(b.getAttribute('aria-label') ?? ''),
    )
    if (remove) {
      fireEvent.click(remove)
      expect(onRemove).toHaveBeenCalled()
    }
  })

  it('shows the add-keys callout when nothing is usable', () => {
    const { container } = mount({ noUsableModel: true, onNavigateToKeys: vi.fn() })
    expect(container.textContent?.toLowerCase()).toMatch(/key/)
  })

  it('focuses a searchable input when a participant picker opens', () => {
    const { container } = mount()
    expectPickerAcceptsImmediateSearch(container)
  })
})

describe('TitleModelField', () => {
  it('renders the auto row + reachable-model caption and resets to undefined', () => {
    const onChange = vi.fn()
    const { container } = renderUi(
      <TitleModelField value="openai:gpt-5.4" onChange={onChange} />,
    )
    expect(container.textContent).toMatch(/titler|title/i)
    const reset = Array.from(container.querySelectorAll('button')).find((b) =>
      /reset/i.test(b.textContent ?? ''),
    )
    if (reset) {
      fireEvent.click(reset)
      expect(onChange).toHaveBeenCalledWith(undefined)
    }
  })

  it('accepts immediate type-to-search', () => {
    const { container } = renderUi(
      <TitleModelField value={undefined} onChange={vi.fn()} />,
    )
    expectPickerAcceptsImmediateSearch(container)
  })
})

describe('SynthesiserPicker', () => {
  it('accepts immediate type-to-search', () => {
    const { container } = renderUi(
      <SynthesiserPicker
        role="judge"
        modelId="anthropic:claude-sonnet-5"
        onChange={vi.fn()}
        options={modelOptions()}
      />,
    )
    expectPickerAcceptsImmediateSearch(container)
  })
})
