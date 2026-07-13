import { createRef } from 'react'
import { fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TurnView } from '@/components/chat-thread/turn-view'
import { renderUi } from '../helpers/render'

// Opening the share modal dynamically imports the canvas painter (which can't
// rasterize in jsdom); stub it so the modal mounts on the build shape.
vi.mock('@/utils/share-card', () => ({
  buildShareCardData: () => ({
    structure: 'trial',
    question: 'q',
    seats: [],
    processLine: '',
    scores: [],
  }),
  renderShareCard: vi
    .fn()
    .mockResolvedValue(new Blob(['png'], { type: 'image/png' })),
  buildShareText: () => 'text',
  shareCardFilename: () => 'card.png',
}))
import {
  MODEL_B,
  participantEvent,
  seat,
  synthesisEvent,
  turn,
} from '../helpers/fixtures'
import type { Turn, TurnEvent } from '@/types/council'

const seats = [seat('s1'), seat('s2', MODEL_B)]

function voteEvent(voterId: string, over: Partial<TurnEvent> = {}): TurnEvent {
  return {
    ...participantEvent(voterId),
    roleType: 'vote',
    output: '',
    vote: [{ targetSeatId: 's1', ratings: { accuracy: 4 }, comment: 'solid' }],
    ...over,
  }
}

function mount(
  t: Turn,
  structure: 'roundtable' | 'trial' | 'consensus',
  over: Partial<Parameters<typeof TurnView>[0]> = {},
) {
  return renderUi(
    <TurnView
      turn={t}
      seats={seats}
      socialStructure={structure}
      votingTurnOverlay={null}
      actionsEnabled
      onRetryFailedVotes={vi.fn()}
      seatRetryOverlay={null}
      synthRetryOverlay={null}
      {...over}
    />,
  )
}

function buttonsMatching(container: HTMLElement, re: RegExp): HTMLElement[] {
  return Array.from(container.querySelectorAll('button')).filter((b) =>
    re.test(b.textContent ?? ''),
  )
}

/** The share affordance is an icon button — match aria-label / title too. */
function shareButton(): HTMLElement | undefined {
  return Array.from(document.querySelectorAll('button')).find((b) =>
    /share/i.test(
      `${b.getAttribute('aria-label') ?? ''} ${b.getAttribute('title') ?? ''} ${b.textContent ?? ''}`,
    ),
  )
}

describe('TurnView — parallel', () => {
  it('renders the user bubble and one pane per answer', () => {
    const t = turn({
      userMsg: 'the question',
      events: [
        participantEvent('s1', { output: 'answer one' }),
        participantEvent('s2', { output: 'answer two' }),
      ],
    })
    const { container } = mount(t, 'roundtable')
    expect(container.textContent).toContain('the question')
    expect(container.textContent).toContain('answer one')
    expect(container.textContent).toContain('answer two')
  })

  it('opens and closes the share modal from a shareable parallel turn', () => {
    const t = turn({
      events: [
        participantEvent('s1', { output: 'answer one' }),
        participantEvent('s2', { output: 'answer two' }),
      ],
    })
    mount(t, 'roundtable')
    const share = shareButton()
    expect(share).toBeDefined()
    fireEvent.click(share!)
    expect(document.body.textContent).toContain('Share this result')
    // Close it again (the modal's Close button).
    const close = Array.from(document.querySelectorAll('button')).find((b) =>
      /^close$/i.test(b.textContent?.trim() ?? ''),
    )!
    fireEvent.click(close)
    expect(document.body.textContent).not.toContain('Share this result')
  })

  it('offers the per-seat retry only on errored panes while idle', () => {
    const onRetrySeatAnswer = vi.fn()
    const t = turn({
      id: 'turn-x',
      events: [
        participantEvent('s1', { output: 'fine' }),
        participantEvent('s2', { error: 'provider down', output: '' }),
      ],
    })
    const { container } = mount(t, 'roundtable', { onRetrySeatAnswer })
    const retries = buttonsMatching(container, /retry/i)
    expect(retries).toHaveLength(1)
    fireEvent.click(retries[0]!)
    expect(onRetrySeatAnswer).toHaveBeenCalledWith('turn-x', 's2')
  })
})

describe('TurnView — trial', () => {
  it('renders voting cards and the verdict with its share affordance', () => {
    const t = turn({
      votingLabels: { A: 's1', B: 's2' },
      events: [
        participantEvent('s1'),
        participantEvent('s2'),
        voteEvent('s2'),
        synthesisEvent('judge', { output: 'the final verdict' }),
      ],
    })
    const { container } = mount(t, 'trial')
    expect(container.textContent).toContain('the final verdict')
    expect(container.textContent?.toUpperCase()).toContain('VERDICT')
    // Voting block rendered (the voter's comment surfaces in the card).
    expect(container.textContent?.toUpperCase()).toContain('VOTING')
  })

  it('opens the share modal from the finished verdict', () => {
    const t = turn({
      events: [
        participantEvent('s1'),
        synthesisEvent('judge', { output: 'the final verdict' }),
      ],
    })
    mount(t, 'trial')
    const share = shareButton()
    expect(share).toBeDefined()
    fireEvent.click(share!)
    expect(document.body.textContent).toContain('Share this result')
  })

  it('offers the judge retry on an errored verdict', () => {
    const onRetryJudge = vi.fn()
    const t = turn({
      id: 'turn-y',
      events: [
        participantEvent('s1'),
        synthesisEvent('judge', { error: 'died', output: '' }),
      ],
    })
    const { container } = mount(t, 'trial', { onRetryJudge })
    const retries = buttonsMatching(container, /retry/i)
    expect(retries.length).toBeGreaterThan(0)
    fireEvent.click(retries[0]!)
    expect(onRetryJudge).toHaveBeenCalledWith('turn-y')
  })

  it('overlays an in-flight judge retry as judging', () => {
    const t = turn({
      events: [
        participantEvent('s1'),
        synthesisEvent('judge', { error: 'died', output: '' }),
      ],
    })
    const { container } = mount(t, 'trial', {
      synthRetryOverlay: {
        turnId: t.id,
        role: 'judge',
        modelId: MODEL_B,
        output: 'rethinking the verdict…',
      },
    })
    expect(container.textContent).toContain('rethinking the verdict…')
    expect(buttonsMatching(container, /retry/i)).toHaveLength(0)
  })
})

describe('TurnView — open-landing anchor placement', () => {
  /** Whether the (deepest) element carrying `text` renders before or after
   *  the open anchor in document order. */
  function textRelativeToAnchor(
    anchor: Element,
    container: HTMLElement,
    text: string,
  ): 'before' | 'after' {
    const leaf = Array.from(container.querySelectorAll('*'))
      .filter((el) => (el.textContent ?? '').includes(text))
      .at(-1)
    expect(leaf).toBeDefined()
    const pos = anchor.compareDocumentPosition(leaf!)
    return pos & Node.DOCUMENT_POSITION_FOLLOWING ? 'after' : 'before'
  }

  it('parallel: anchor sits before the answer fan-out (the result)', () => {
    const ref = createRef<HTMLDivElement>()
    const t = turn({
      userMsg: 'the question',
      events: [participantEvent('s1', { output: 'answer one' })],
    })
    const { container } = mount(t, 'roundtable', { openAnchorRef: ref })
    expect(ref.current).not.toBeNull()
    expect(textRelativeToAnchor(ref.current!, container, 'the question')).toBe(
      'before',
    )
    expect(textRelativeToAnchor(ref.current!, container, 'answer one')).toBe(
      'after',
    )
  })

  it('trial: anchor sits before the verdict, after the answers', () => {
    const ref = createRef<HTMLDivElement>()
    const t = turn({
      userMsg: 'the question',
      votingLabels: { A: 's1', B: 's2' },
      events: [
        participantEvent('s1', { output: 'answer one' }),
        participantEvent('s2', { output: 'answer two' }),
        voteEvent('s2'),
        synthesisEvent('judge', { output: 'the final verdict' }),
      ],
    })
    const { container } = mount(t, 'trial', { openAnchorRef: ref })
    expect(textRelativeToAnchor(ref.current!, container, 'answer one')).toBe(
      'before',
    )
    expect(
      textRelativeToAnchor(ref.current!, container, 'the final verdict'),
    ).toBe('after')
  })

  it('trial without downstream phases: anchor falls back to the answers', () => {
    const ref = createRef<HTMLDivElement>()
    const t = turn({
      userMsg: 'the question',
      events: [participantEvent('s1', { output: 'answer one' })],
    })
    const { container } = mount(t, 'trial', { openAnchorRef: ref })
    expect(textRelativeToAnchor(ref.current!, container, 'answer one')).toBe(
      'after',
    )
  })

  it('consensus: anchor sits before the last mediator round, after the positions', () => {
    const ref = createRef<HTMLDivElement>()
    const t = turn({
      userMsg: 'the question',
      votingLabels: { A: 's1', B: 's2' },
      events: [
        participantEvent('s1', { output: 'position one' }),
        participantEvent('s2', { output: 'position two' }),
        synthesisEvent('mediator', {
          output: 'we all agree now',
          round: 1,
          mediator: { round: 1, convergent: true },
        }),
      ],
    })
    const { container } = mount(t, 'consensus', { openAnchorRef: ref })
    expect(textRelativeToAnchor(ref.current!, container, 'position one')).toBe(
      'before',
    )
    expect(
      textRelativeToAnchor(ref.current!, container, 'we all agree now'),
    ).toBe('after')
  })

  it('consensus whose mediator never ran: anchor falls back to the answers', () => {
    const ref = createRef<HTMLDivElement>()
    const t = turn({
      userMsg: 'the question',
      events: [participantEvent('s1', { output: 'position one' })],
    })
    const { container } = mount(t, 'consensus', { openAnchorRef: ref })
    expect(textRelativeToAnchor(ref.current!, container, 'position one')).toBe(
      'after',
    )
  })

})

describe('TurnView — consensus', () => {
  it('renders the debate rounds with the mediator synthesis', () => {
    const t = turn({
      votingLabels: { A: 's1', B: 's2' },
      events: [
        participantEvent('s1', { output: 'position one' }),
        participantEvent('s2', { output: 'position two' }),
        synthesisEvent('mediator', {
          output: 'we all agree now',
          round: 1,
          mediator: { round: 1, convergent: true },
        }),
      ],
    })
    const { container } = mount(t, 'consensus')
    expect(container.textContent).toContain('we all agree now')
    expect(container.textContent).toContain('position one')
    expect(container.textContent?.toUpperCase()).toContain('MEDIATOR')
  })

  it('offers the mediator retry only on the final errored round', () => {
    const onRetryMediatorRound = vi.fn()
    const t = turn({
      id: 'turn-z',
      votingLabels: { A: 's1', B: 's2' },
      events: [
        participantEvent('s1'),
        participantEvent('s2'),
        synthesisEvent('mediator', {
          output: 'fine round',
          round: 1,
          mediator: { round: 1, convergent: false },
        }),
        {
          ...participantEvent('s1', { output: 'rethought' }),
          roleType: 'reanswer' as const,
          round: 2,
        },
        synthesisEvent('mediator', {
          output: '',
          error: 'died',
          round: 2,
          mediator: { round: 2, convergent: false },
        }),
      ],
    })
    const { container } = mount(t, 'consensus', { onRetryMediatorRound })
    const retries = buttonsMatching(container, /retry/i)
    expect(retries).toHaveLength(1)
    fireEvent.click(retries[0]!)
    expect(onRetryMediatorRound).toHaveBeenCalledWith('turn-z')
  })
})
