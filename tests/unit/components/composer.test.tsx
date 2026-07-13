import { fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Composer } from '@/components/composer'
import { renderUi } from '../helpers/render'

function mount(over: Partial<Parameters<typeof Composer>[0]> = {}) {
  const onSend = vi.fn()
  const onStop = vi.fn()
  const utils = renderUi(
    <Composer onSend={onSend} onStop={onStop} isStreaming={false} {...over} />,
  )
  const textarea = utils.container.querySelector('textarea') as HTMLTextAreaElement
  return { ...utils, onSend, onStop, textarea }
}

function sendButton(container: HTMLElement): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((b) =>
    /send/i.test(`${b.getAttribute('aria-label') ?? ''} ${b.textContent ?? ''}`),
  ) as HTMLButtonElement | undefined
}

describe('Composer', () => {
  it('sends the trimmed draft and clears the textarea', () => {
    const { container, onSend, textarea } = mount()
    fireEvent.change(textarea, { target: { value: '  hello council  ' } })
    fireEvent.click(sendButton(container)!)
    expect(onSend).toHaveBeenCalledWith('hello council', undefined, undefined)
    expect(textarea.value).toBe('')
  })

  it('seeds the textarea from a persisted draft and leaves Send enabled', () => {
    const { container, textarea } = mount({ initialDraft: 'restored question' })
    expect(textarea.value).toBe('restored question')
    expect(sendButton(container)!.disabled).toBe(false)
  })

  it('reports draft changes and clears the persisted draft on send', () => {
    const onDraftChange = vi.fn()
    const { container, onSend, textarea } = mount({ onDraftChange })
    fireEvent.change(textarea, { target: { value: 'work in progress' } })
    expect(onDraftChange).toHaveBeenLastCalledWith('work in progress')
    fireEvent.click(sendButton(container)!)
    expect(onSend).toHaveBeenCalledWith('work in progress', undefined, undefined)
    // Send empties the input *and* the stored draft for this council.
    expect(onDraftChange).toHaveBeenLastCalledWith('')
    expect(textarea.value).toBe('')
  })

  it('does not send an empty or whitespace-only draft', () => {
    const { container, onSend, textarea } = mount()
    fireEvent.change(textarea, { target: { value: '   ' } })
    const btn = sendButton(container)
    if (btn && !btn.disabled) fireEvent.click(btn)
    expect(onSend).not.toHaveBeenCalled()
  })

  it('Enter sends; Shift+Enter inserts a newline', () => {
    const { onSend, textarea } = mount()
    fireEvent.change(textarea, { target: { value: 'via enter' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })
    expect(onSend).not.toHaveBeenCalled()
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(onSend).toHaveBeenCalledWith('via enter', undefined, undefined)
  })

  it('on a soft-keyboard device Enter is a newline; Send still submits', () => {
    // Report the device as touch-primary (phone/tablet on-screen keyboard).
    const spy = vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query.includes('pointer: coarse'),
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList,
    )
    const { container, onSend, textarea } = mount()
    fireEvent.change(textarea, { target: { value: 'via enter' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled() // newline, not a submit
    fireEvent.click(sendButton(container)!)
    expect(onSend).toHaveBeenCalledWith('via enter', undefined, undefined)
    spy.mockRestore()
  })

  it('shows a Stop control while streaming and fires onStop', () => {
    const { container, onStop } = mount({ isStreaming: true })
    const stop = Array.from(container.querySelectorAll('button')).find((b) =>
      /stop/i.test(`${b.getAttribute('aria-label') ?? ''} ${b.textContent ?? ''}`),
    )
    expect(stop).toBeDefined()
    fireEvent.click(stop!)
    expect(onStop).toHaveBeenCalledOnce()
  })

  it('clicks the hidden file input when Attach images is pressed', () => {
    const { container } = mount()
    const clickSpy = vi
      .spyOn(HTMLInputElement.prototype, 'click')
      .mockImplementation(() => {})
    const attach = Array.from(container.querySelectorAll('button')).find((b) =>
      /attach images/i.test(b.getAttribute('aria-label') ?? ''),
    )!
    fireEvent.click(attach)
    expect(clickSpy).toHaveBeenCalled()
  })

  it('propagates tool-mute and thinking changes to onRunOptionsChange', () => {
    const onRunOptionsChange = vi.fn()
    const { container } = mount({
      toolOptions: [
        { name: 'web_search', label: 'Web search', enabledSeats: 1, toolSeats: 1 },
      ],
      reasoningSeats: [
        {
          entry: {
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
          },
        },
      ],
      onRunOptionsChange,
      onOpenCouncilSettings: vi.fn(),
    })
    // Tools popover → mute the web-search switch.
    const wrench = Array.from(container.querySelectorAll('button')).find((b) =>
      /tools/i.test(b.getAttribute('aria-label') ?? ''),
    )!
    fireEvent.click(wrench)
    fireEvent.click(document.querySelector('input[type="checkbox"]')!)
    expect(onRunOptionsChange).toHaveBeenCalledWith(
      expect.objectContaining({ mutedTools: ['web_search'] }),
    )
    // Thinking popover → arm High.
    const brain = Array.from(container.querySelectorAll('button')).find((b) =>
      /thinking/i.test(b.getAttribute('aria-label') ?? ''),
    )!
    fireEvent.click(brain)
    const high = Array.from(
      document.querySelectorAll('[role="tab"], button'),
    ).find((el) => /^high$/i.test(el.textContent?.trim() ?? ''))
    fireEvent.click(high!)
    expect(onRunOptionsChange).toHaveBeenCalledWith(
      expect.objectContaining({ reasoningEffort: 'high' }),
    )
  })

  it('surfaces the context-usage hint past the soft floor', () => {
    const { container } = mount({
      contextEstimator: () => ({
        seatId: 's1',
        modelId: 'anthropic:claude-sonnet-5',
        displayLabel: 'Claude',
        used: 150_000,
        max: 200_000,
        pct: 0.75,
      }),
    })
    expect(container.textContent).toMatch(/context/i)
    expect(container.textContent).toContain('75')
  })
})
