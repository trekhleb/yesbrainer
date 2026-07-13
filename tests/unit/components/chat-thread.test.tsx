import { describe, expect, it, vi } from 'vitest'
import { ChatThread } from '@/components/chat-thread'
import { renderUi } from '../helpers/render'
import {
  council,
  participantEvent,
  seat,
  turn,
} from '../helpers/fixtures'
import type { ChatThreadProps } from '@/components/chat-thread'

function mount(over: Partial<ChatThreadProps> = {}) {
  const base: ChatThreadProps = {
    council: council({ seats: [seat('s1')] }),
    streamingTurn: null,
    votingTurn: null,
    mediatingTurn: null,
    judgingTurn: null,
    onRetryFailedVotes: vi.fn(),
    seatRetry: null,
    onRetrySeatAnswer: vi.fn(),
    synthRetry: null,
    onRetryJudge: vi.fn(),
    onRetryMediatorRound: vi.fn(),
    error: null,
    ...over,
  }
  return renderUi(<ChatThread {...base} />)
}

describe('ChatThread', () => {
  it('renders the empty state for a fresh council', () => {
    const { container } = mount()
    expect(container.querySelector('section')).not.toBeNull()
    expect(container.textContent?.length).toBeGreaterThan(0)
  })

  it('renders persisted turns and the in-flight streaming turn together', () => {
    const c = council({
      seats: [seat('s1')],
      turns: [
        turn({
          userMsg: 'first question',
          events: [participantEvent('s1', { output: 'persisted answer' })],
        }),
      ],
    })
    const { container } = mount({
      council: c,
      streamingTurn: {
        id: 'live',
        userMsg: 'second question',
        perSeat: {
          s1: {
            status: 'streaming',
            error: null,
            output: 'typing…',
            modelId: 'anthropic:claude-sonnet-5',
          },
        },
      },
    })
    expect(container.textContent).toContain('persisted answer')
    expect(container.textContent).toContain('second question')
    expect(container.textContent).toContain('typing…')
  })

  it('surfaces a top-level error banner', () => {
    const { container } = mount({ error: 'the sky fell' })
    expect(container.textContent).toContain('the sky fell')
  })
})
