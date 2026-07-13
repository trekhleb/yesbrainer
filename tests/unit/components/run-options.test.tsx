import { fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ComposerRunControls } from '@/components/composer/run-options'
import type { ModelEntry } from '@/models/registry'
import { renderUi } from '../helpers/render'

function seatEntry(over: Partial<ModelEntry> = {}): ModelEntry {
  return {
    modelId: 'anthropic:claude-opus-4-8',
    label: 'Claude Opus 4.8',
    provider: 'anthropic',
    providerModelId: 'claude-opus-4-8',
    tier: 'paid',
    country: 'USA',
    developer: 'Anthropic',
    contextWindow: 200_000,
    capabilities: { tools: true, vision: true, reasoning: true },
    defaultSystemPrompt: '',
    ...over,
  }
}

function mount(over: Partial<Parameters<typeof ComposerRunControls>[0]> = {}) {
  const props = {
    toolOptions: [
      { name: 'web_search', label: 'Web search', enabledSeats: 2, toolSeats: 2 },
    ],
    reasoningSeats: [{ entry: seatEntry() }],
    mutedTools: new Set<string>(),
    onToggleTool: vi.fn(),
    reasoningEffort: null,
    onChangeReasoning: vi.fn(),
    disabled: false,
    onOpenCouncilSettings: vi.fn(),
    settingsOverridden: false,
    ...over,
  }
  return { ...renderUi(<ComposerRunControls {...props} />), props }
}

describe('ComposerRunControls', () => {
  it('renders the thinking, tools, and settings triggers', () => {
    const { container } = mount()
    // Three popover/trigger buttons.
    expect(container.querySelectorAll('button').length).toBeGreaterThanOrEqual(3)
  })

  it('opens the council-settings modal from the sliders trigger', () => {
    const { container, props } = mount()
    // The settings trigger is the last control.
    const buttons = Array.from(container.querySelectorAll('button'))
    fireEvent.click(buttons.at(-1)!)
    expect(props.onOpenCouncilSettings).toHaveBeenCalled()
  })

  it('hides the thinking control when no seat can reason', () => {
    const { container } = mount({ reasoningSeats: [], onOpenCouncilSettings: undefined })
    // Only the tools control remains.
    expect(container.querySelectorAll('button').length).toBe(1)
  })

  it('hides the tools control when there are no tool options', () => {
    const { container } = mount({ toolOptions: [], onOpenCouncilSettings: undefined })
    expect(container.querySelectorAll('button').length).toBe(1) // thinking only
  })

  it('opens the thinking popover and arms a reasoning level', () => {
    const { props } = mount()
    const brain = Array.from(document.querySelectorAll('button')).find((b) =>
      /thinking/i.test(b.getAttribute('aria-label') ?? ''),
    )!
    fireEvent.click(brain)
    expect(document.body.textContent).toContain('Thinking')
    const high = Array.from(
      document.querySelectorAll('[role="tab"], button'),
    ).find((el) => /^high$/i.test(el.textContent?.trim() ?? ''))
    fireEvent.click(high!)
    expect(props.onChangeReasoning).toHaveBeenCalledWith('high')
    // The widened dial's new rungs arm too.
    const off = Array.from(
      document.querySelectorAll('[role="tab"], button'),
    ).find((el) => /^off$/i.test(el.textContent?.trim() ?? ''))
    fireEvent.click(off!)
    expect(props.onChangeReasoning).toHaveBeenCalledWith('off')
  })

  it('discloses the per-seat resolution of the armed thinking level', () => {
    mount({
      reasoningEffort: 'max',
      reasoningSeats: [
        { entry: seatEntry() },
        {
          entry: seatEntry({
            modelId: 'openai:gpt-5.5',
            label: 'GPT-5.5',
            provider: 'openai',
            providerModelId: 'gpt-5.5',
          }),
        },
      ],
    })
    const brain = Array.from(document.querySelectorAll('button')).find((b) =>
      /thinking/i.test(b.getAttribute('aria-label') ?? ''),
    )!
    fireEvent.click(brain)
    // Each seat row shows what "Max" is actually sent as on that model.
    expect(document.body.textContent).toContain('Claude Opus 4.8')
    expect(document.body.textContent).toContain('max effort')
    expect(document.body.textContent).toContain('GPT-5.5')
    expect(document.body.textContent).toContain('extra-high effort')
  })

  it('marks Judge / Mediator disclosure rows with their role', () => {
    mount({
      reasoningEffort: 'max',
      reasoningSeats: [
        { entry: seatEntry() },
        { entry: seatEntry(), role: 'Judge' },
      ],
    })
    const brain = Array.from(document.querySelectorAll('button')).find((b) =>
      /thinking/i.test(b.getAttribute('aria-label') ?? ''),
    )!
    fireEvent.click(brain)
    // The synthesiser row names its role — it shares the seat's model here,
    // and the marker is what keeps the two rows apart.
    expect(document.body.textContent).toContain('Claude Opus 4.8 · Judge')
  })

  it('under Default the disclosure shows each seat\'s own setting', () => {
    mount({
      reasoningEffort: null,
      reasoningSeats: [
        { entry: seatEntry(), seatEffort: 'high' },
        {
          entry: seatEntry({
            modelId: 'openai:gpt-5.5',
            label: 'GPT-5.5',
            provider: 'openai',
            providerModelId: 'gpt-5.5',
          }),
        },
      ],
    })
    const brain = Array.from(document.querySelectorAll('button')).find((b) =>
      /thinking/i.test(b.getAttribute('aria-label') ?? ''),
    )!
    fireEvent.click(brain)
    // Seat with its own sticky level shows it; unset seat shows the default.
    expect(document.body.textContent).toContain('high effort')
    expect(document.body.textContent).toContain('provider default')
  })

  it('opens the tools popover and mutes a tool', () => {
    const { props } = mount()
    const wrench = Array.from(document.querySelectorAll('button')).find((b) =>
      /tools/i.test(b.getAttribute('aria-label') ?? ''),
    )!
    fireEvent.click(wrench)
    expect(document.body.textContent).toContain('Web search')
    const checkbox = document.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )!
    // The switch starts on (not muted) → toggling it mutes the tool.
    fireEvent.click(checkbox)
    expect(props.onToggleTool).toHaveBeenCalledWith('web_search', true)
  })

  it('shows the armed thinking level and partial tool-mute indicator', () => {
    const { container } = mount({
      reasoningEffort: 'high',
      toolOptions: [
        { name: 'web_search', label: 'Web search', enabledSeats: 1, toolSeats: 3 },
        { name: 'code_execution', label: 'Code execution', enabledSeats: 2, toolSeats: 2 },
      ],
      mutedTools: new Set(['web_search']),
    })
    // Armed reasoning shows its short label; one muted of two → "1 off".
    expect(container.textContent).toContain('High')
    expect(container.textContent).toContain('1 off')
  })
})
