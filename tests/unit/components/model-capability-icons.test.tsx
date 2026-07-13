import { describe, expect, it, vi } from 'vitest'
import { ModelCapabilityIcons } from '@/components/model-capability-icons'
import { formatContextWindow } from '@/utils/format-tokens'
import { getModel, registry } from '@/models/registry'
import { renderUi } from '../helpers/render'

describe('formatContextWindow', () => {
  it('renders round provider specs tightly — uppercase, no trailing ".0"', () => {
    expect(formatContextWindow(8192)).toBe('8K')
    expect(formatContextWindow(32_000)).toBe('32K')
    expect(formatContextWindow(131_072)).toBe('131K')
    expect(formatContextWindow(200_000)).toBe('200K')
    expect(formatContextWindow(400_000)).toBe('400K')
    expect(formatContextWindow(1_000_000)).toBe('1M')
    expect(formatContextWindow(1_500_000)).toBe('1.5M')
  })
})

describe('ModelCapabilityIcons', () => {
  // A real registry model — expectations are computed from the entry, not a
  // hard-coded literal, so a catalog refresh can't silently break the test.
  const model = registry[0]!

  it('shows the context figure only when showContext is set', () => {
    const expected = formatContextWindow(getModel(model.modelId).contextWindow)
    const withCtx = renderUi(
      <ModelCapabilityIcons modelId={model.modelId} showContext />,
    )
    expect(withCtx.container.textContent).toContain(expected)

    const without = renderUi(<ModelCapabilityIcons modelId={model.modelId} />)
    expect(without.container.textContent ?? '').not.toContain(expected)
  })

  it('still renders the context figure when a model has no capability flags', () => {
    // An unlisted id → the fallback stub has all-false capabilities but a real
    // contextWindow, so the row renders its context instead of collapsing.
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const id = 'nonexistent-provider:ghost-model'
    const expected = formatContextWindow(getModel(id).contextWindow)
    const { container } = renderUi(
      <ModelCapabilityIcons modelId={id} showContext />,
    )
    expect(container.textContent).toContain(expected)
    vi.restoreAllMocks()
  })
})
