import { describe, expect, it } from 'vitest'
import { buildParticipantEvent } from '@/utils/session/participant-event'
import { buildVoteEvent } from '@/utils/session/vote-event'
import { seat } from '../../helpers/fixtures'

describe('buildParticipantEvent', () => {
  it('persists only the fields the result actually carries', () => {
    const full = buildParticipantEvent({
      id: 'e1',
      seat: seat('s1'),
      result: {
        text: 'answer',
        aborted: false,
        tokens: { input: 1, output: 2 },
        toolCalls: [{ name: 'web_search', query: 'x' }],
      },
    })
    expect(full).toMatchObject({
      id: 'e1',
      roleType: 'participant',
      seatId: 's1',
      output: 'answer',
      tokens: { input: 1, output: 2 },
      toolCalls: [{ name: 'web_search', query: 'x' }],
    })

    const bare = buildParticipantEvent({
      id: 'e2',
      seat: seat('s1'),
      result: { text: '', aborted: false, error: 'boom', toolCalls: [] },
    })
    expect(bare.error).toBe('boom')
    expect('tokens' in bare).toBe(false)
    expect('toolCalls' in bare).toBe(false)
  })
})

describe('buildVoteEvent', () => {
  it('keeps output empty and carries votes / raw response conditionally', () => {
    const ev = buildVoteEvent({
      id: 'v1',
      voter: seat('s1'),
      result: {
        vote: [{ targetSeatId: 's2', ratings: { accuracy: 4 }, comment: 'ok' }],
        aborted: false,
        tokens: { input: 1, output: 1 },
      },
    })
    expect(ev.roleType).toBe('vote')
    expect(ev.output).toBe('')
    expect(ev.vote).toHaveLength(1)

    const failed = buildVoteEvent({
      id: 'v2',
      voter: seat('s1'),
      result: {
        vote: [],
        aborted: false,
        error: 'no entries',
        rawResponse: '{"votes":[]}',
      },
    })
    expect(failed.error).toBe('no entries')
    expect(failed.rawResponse).toBe('{"votes":[]}')
    expect('vote' in failed).toBe(false)
  })
})
