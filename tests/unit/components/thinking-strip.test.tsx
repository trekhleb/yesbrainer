import { describe, expect, it } from 'vitest'
import { ThinkingStrip } from '@/components/roundtable/thinking-strip'
import { ParticipantPane } from '@/components/roundtable/participant-pane'
import { renderUi } from '../helpers/render'
import type { RoundtablePane } from '@/types/session'

function pane(over: Partial<RoundtablePane> = {}): RoundtablePane {
  return {
    key: 't:s',
    modelId: 'anthropic:claude-opus-4-8',
    output: '',
    status: 'streaming',
    error: null,
    ...over,
  }
}

describe('ThinkingStrip', () => {
  it('renders the status pill and the streamed summary text', () => {
    const { container } = renderUi(
      <ThinkingStrip text={'first thought\n\nsecond thought'} />,
    )
    // Same pill vocabulary as "deliberating…" — lowercase label, shared
    // StatusTag/LoadingText primitive.
    expect(container.textContent).toContain('thinking')
    expect(container.textContent).toContain('first thought')
    expect(container.textContent).toContain('second thought')
  })
})

describe('ParticipantPane thinking branch', () => {
  it('shows the thinking feed while streaming with no answer text yet', () => {
    const { container } = renderUi(
      <ParticipantPane pane={pane({ reasoning: 'pondering the tradeoffs' })} />,
    )
    expect(container.textContent).toContain('thinking')
    expect(container.textContent).toContain('pondering the tradeoffs')
  })

  it('drops the thinking feed the moment answer text arrives', () => {
    const { container } = renderUi(
      <ParticipantPane
        pane={pane({ reasoning: 'pondering the tradeoffs', output: 'Answer!' })}
      />,
    )
    expect(container.textContent).toContain('Answer!')
    expect(container.textContent).not.toContain('pondering the tradeoffs')
  })

  it('falls back to the deliberating tag when no reasoning streams', () => {
    const { container } = renderUi(<ParticipantPane pane={pane()} />)
    expect(container.textContent).toContain('deliberating')
  })
})
