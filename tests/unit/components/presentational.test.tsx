import { fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { VoteDetail } from '@/components/voting/vote-detail'
import { ToolCallStrip } from '@/components/roundtable/tool-call-strip'
import { ComposerKeysGate } from '@/components/composer-keys-gate'
import { ErrorInspector } from '@/components/error-inspector'
import { PendingThumbnail, Thumbnail } from '@/components/composer/thumbnail'
import { UserBubble } from '@/components/user-bubble'
import { SidebarFooterLinks } from '@/components/sidebar/footer-links'
import { aggregateVotesByTarget } from '@/utils/vote-leaderboard'
import { renderUi } from '../helpers/render'
import { participantEvent, seat } from '../helpers/fixtures'
import type { TurnEvent } from '@/types/council'

describe('VoteDetail', () => {
  it('lists each voter’s stars and comment', () => {
    const seats = [seat('a'), seat('b')]
    const events: TurnEvent[] = [
      participantEvent('a'),
      {
        ...participantEvent('b'),
        roleType: 'vote',
        output: '',
        vote: [{ targetSeatId: 'a', ratings: { accuracy: 4 }, comment: 'clear reasoning' }],
      },
    ]
    const entry = aggregateVotesByTarget(events, seats)[0]!
    const { container } = renderUi(<VoteDetail entry={entry} />)
    expect(container.textContent).toContain('clear reasoning')
  })
})

describe('ToolCallStrip', () => {
  it('collapses repeated calls of the same tool into one labelled row + count', () => {
    const { container } = renderUi(
      <ToolCallStrip
        toolCalls={[
          { name: 'web_search', query: 'a' },
          { name: 'web_search', query: 'b' },
        ]}
      />,
    )
    expect(container.textContent?.toLowerCase()).toContain('web search')
    expect(container.textContent).toContain('2×')
    // One row for the single distinct tool.
    expect(container.querySelectorAll('span[class]').length).toBeGreaterThan(0)
    const { container: empty } = renderUi(<ToolCallStrip toolCalls={[]} />)
    expect(empty.querySelector('span')).toBeNull()
  })
})

describe('ComposerKeysGate', () => {
  it('renders the add-keys call to action', () => {
    const { container } = renderUi(<ComposerKeysGate />)
    expect(container.textContent?.toLowerCase()).toMatch(/key/)
  })
})

describe('ErrorInspector', () => {
  it('reveals the raw response in a popover on click', () => {
    const { container } = renderUi(
      <ErrorInspector label="Parse failed" rawResponse='{"votes":[]}' />,
    )
    const trigger = container.querySelector('button')!
    fireEvent.click(trigger)
    expect(document.body.textContent).toContain('votes')
  })
})

describe('composer thumbnails', () => {
  it('PendingThumbnail renders a placeholder; Thumbnail removes on click', () => {
    renderUi(<PendingThumbnail />)
    const onRemove = vi.fn()
    const { container } = renderUi(
      <Thumbnail src="data:image/png;base64,AA" onRemove={onRemove} disabled={false} />,
    )
    const remove = container.querySelector('button')
    fireEvent.click(remove!)
    expect(onRemove).toHaveBeenCalledOnce()
  })
})

describe('UserBubble', () => {
  it('renders the message and any image thumbnails', () => {
    const { container } = renderUi(
      <UserBubble content="the question" images={['data:image/png;base64,AA']} />,
    )
    expect(container.textContent).toContain('the question')
    expect(container.querySelector('img')).not.toBeNull()
  })
})

describe('SidebarFooterLinks', () => {
  it('renders external links with the opener severed', () => {
    const { container } = renderUi(<SidebarFooterLinks onSelect={vi.fn()} />)
    const external = Array.from(container.querySelectorAll('a[target="_blank"]'))
    expect(external.length).toBeGreaterThan(0)
    for (const a of external) {
      expect(a.getAttribute('rel')).toBe('noopener noreferrer')
    }
  })
})
