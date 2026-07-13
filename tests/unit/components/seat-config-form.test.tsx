import { fireEvent } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  SeatConfigForm,
  type SeatConfigFormHandle,
} from '@/components/seat-config/seat-config-form'
import { renderUi } from '../helpers/render'
import type { SeatConfig } from '@/types/council'

const TOOLS_MODEL = 'anthropic:claude-sonnet-5' // tools + reasoning
const PLAIN_MODEL = 'groq:llama-3.3-70b' // no tools, no reasoning

type Ref = { current: SeatConfigFormHandle | null }

function mount(modelId: string, config: SeatConfig) {
  const ref: Ref = { current: null }
  const utils = renderUi(
    <SeatConfigForm
      ref={ref as never}
      modelId={modelId}
      config={config}
      role="participant"
      effectiveDefault="You are a participant."
      defaultSource="the default"
    />,
  )
  return { ...utils, ref }
}

describe('SeatConfigForm', () => {
  it('buildConfig collapses an all-tools-on seat to the compact default', () => {
    const { ref } = mount(TOOLS_MODEL, {})
    const built = ref.current!.buildConfig()
    // Every available tool enabled by default → `tools` stays undefined.
    expect(built.tools).toBeUndefined()
    expect(built.systemPrompt).toBeUndefined()
  })

  it('drops reasoning effort for a model that cannot reason', () => {
    const { ref } = mount(PLAIN_MODEL, { reasoningEffort: 'high' })
    expect(ref.current!.buildConfig().reasoningEffort).toBeUndefined()
  })

  it('persists an edited system prompt', () => {
    const { container, ref } = mount(TOOLS_MODEL, {})
    const textarea = container.querySelector('textarea')
    expect(textarea).not.toBeNull()
    fireEvent.change(textarea!, { target: { value: 'Answer as a lawyer.' } })
    expect(ref.current!.buildConfig().systemPrompt).toBe('Answer as a lawyer.')
  })

  it('passes untouched temperature / maxOutputTokens through', () => {
    const { ref } = mount(TOOLS_MODEL, { temperature: 0.4, maxOutputTokens: 900 })
    const built = ref.current!.buildConfig()
    expect(built.temperature).toBe(0.4)
    expect(built.maxOutputTokens).toBe(900)
  })
})
