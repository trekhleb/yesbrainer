import { beforeEach, describe, expect, it } from 'vitest'
import {
  buildShareCardData,
  buildShareText,
  shareCardFilename,
  verdictExcerpt,
} from '@/utils/share-card/data'
import { renderShareCard } from '@/utils/share-card/paint'
import { stubCanvas } from '../helpers/canvas-stub'
import {
  participantEvent,
  seat,
  synthesisEvent,
} from '../helpers/fixtures'
import type { SocialStructure, TurnEvent } from '@/types/council'

const seats = [seat('s1'), seat('s2')]

function voteEvent(voterId: string, targetSeatId = 's1', score = 5): TurnEvent {
  return {
    ...participantEvent(voterId),
    roleType: 'vote',
    output: '',
    vote: [{ targetSeatId, ratings: { accuracy: score }, comment: '' }],
  }
}

describe('buildShareCardData', () => {
  it('trial: verdict layout with the peer-score line', () => {
    const data = buildShareCardData({
      structure: 'trial',
      question: 'Which db?',
      events: [
        participantEvent('s1'),
        participantEvent('s2'),
        voteEvent('s2'),
        synthesisEvent('judge', { output: '# Verdict\nUse **Postgres**.' }),
      ],
      seats,
    })
    expect(data?.verdict?.role).toBe('Verdict')
    // Bold survives for the painter (headings arrive as bold lines);
    // the italic/code/link strip still applies.
    expect(data?.verdict?.text).toContain('**Verdict**')
    expect(data?.verdict?.text).toContain('Use **Postgres**.')
    expect(data?.scores[0]).toMatchObject({ score: 5, winner: true })
    expect(data?.processLine).toContain('one Judge ruled')
  })

  it('consensus: verdict layout with the movement stat', () => {
    const data = buildShareCardData({
      structure: 'consensus',
      question: 'q',
      events: [
        participantEvent('s1'),
        synthesisEvent('mediator', {
          output: 'We agree.',
          mediator: {
            round: 2,
            convergent: true,
            roundDigest: {
              summary: 's',
              movements: [{ label: 'A', stance: 'converged', note: '' }],
            },
          },
        }),
      ],
      seats,
    })
    expect(data?.verdict?.role).toBe('Consensus')
    expect(data?.processLine).toContain('2 rounds of debate')
    expect(data?.processLine).toContain('1 changed its position')
    expect(data?.processLine).toContain('consensus reached')
  })

  it('parallel: columns panorama capped at three', () => {
    const events = ['s1', 's2', 's3', 's4'].map((id) =>
      participantEvent(id, { output: `answer ${id}` }),
    )
    const data = buildShareCardData({
      structure: 'roundtable',
      question: 'q',
      events,
      seats,
    })
    expect(data?.columns).toHaveLength(3)
    expect(data?.verdict).toBeUndefined()
    expect(data?.processLine).toContain('(3 of 4 shown)')
  })

  it('trial: sorts the peer-score leaderboard best-first across targets', () => {
    const data = buildShareCardData({
      structure: 'trial',
      question: 'q',
      events: [
        participantEvent('s1'),
        participantEvent('s2'),
        voteEvent('s2', 's1', 3),
        voteEvent('s1', 's2', 5),
        synthesisEvent('judge', { output: 'Verdict.' }),
      ],
      seats,
    })
    // Two scored targets → the comparator actually runs; best first.
    expect(data?.scores).toHaveLength(2)
    expect(data?.scores[0]?.score).toBeGreaterThanOrEqual(
      data?.scores[1]?.score ?? 0,
    )
  })

  it('threads the turn\'s image attachments through to the card', () => {
    const images = ['data:image/png;base64,AA', 'data:image/png;base64,BB']
    const data = buildShareCardData({
      structure: 'roundtable',
      question: 'Where was this photo taken?',
      events: [participantEvent('s1')],
      seats,
      userImages: images,
    })
    expect(data?.userImages).toEqual(images)
    // Absent (not empty) without attachments — the painter keys on it.
    const bare = buildShareCardData({
      structure: 'roundtable',
      question: 'q',
      events: [participantEvent('s1')],
      seats,
      userImages: [],
    })
    expect(bare?.userImages).toBeUndefined()
  })

  it('returns null (no throw) for an off-union structure', () => {
    expect(
      buildShareCardData({
        structure: 'bogus' as unknown as SocialStructure,
        question: 'q',
        events: [participantEvent('s1', { output: 'x' })],
        seats,
      }),
    ).toBeNull()
  })

  it('returns null with nothing shareable (and always for custom)', () => {
    expect(
      buildShareCardData({
        structure: 'trial',
        question: 'q',
        events: [participantEvent('s1')],
        seats,
      }),
    ).toBeNull()
    expect(
      buildShareCardData({
        structure: 'custom',
        question: 'q',
        events: [participantEvent('s1')],
        seats,
      }),
    ).toBeNull()
  })
})

describe('buildShareText / shareCardFilename / verdictExcerpt', () => {
  it('verdict text quotes the question, credits the model, and stays bare', () => {
    const text = buildShareText({
      structure: 'trial',
      question: 'Which db?',
      seats: [],
      processLine: '2 models · one Judge ruled',
      scores: [],
      verdict: {
        role: 'Verdict',
        modelLabel: 'GPT-4o',
        text: 'Use **Postgres**.',
      },
    })
    expect(text).toContain('“Which db?”')
    // The painter's bold markers would paste as literal asterisks.
    expect(text).toContain('Use Postgres.')
    expect(text).not.toContain('**')
    expect(text).toContain('— Verdict by GPT-4o')
    expect(text).toContain('https://yesbrainer.ai')
  })

  it('notes the attachment the paste cannot carry', () => {
    const base = {
      structure: 'trial' as const,
      question: 'Where was this photo taken?',
      seats: [],
      processLine: 'p',
      scores: [],
      verdict: { role: 'Verdict', modelLabel: 'M', text: 't' },
    }
    expect(
      buildShareText({ ...base, userImages: ['data:image/png;base64,AA'] }),
    ).toContain('(asked about an attached image)')
    expect(
      buildShareText({
        ...base,
        userImages: ['data:image/png;base64,AA', 'data:image/png;base64,BB'],
      }),
    ).toContain('(asked about 2 attached images)')
    expect(buildShareText(base)).not.toContain('attached image')
  })

  it('parallel text lists each column under its model name', () => {
    const text = buildShareText({
      structure: 'roundtable',
      question: 'Which db?',
      seats: [],
      processLine: '3 models answered independently',
      scores: [],
      columns: [
        { provider: 'openai', label: 'GPT-4o', excerpt: 'Use **Postgres**.' },
        { provider: 'google', label: 'Gemini', excerpt: 'Use SQLite.' },
      ],
    })
    expect(text).toContain('“Which db?”')
    expect(text).toContain('GPT-4o:')
    expect(text).toContain('Use Postgres.')
    expect(text).not.toContain('**')
    expect(text).toContain('Gemini:')
    expect(text).toContain('— 3 models answered independently')
  })

  it('filenames slugify; excerpts skip preamble to the conclusion line', () => {
    expect(shareCardFilename('Which DB — really?!')).toBe(
      'yesbrainer-which-db-really.png',
    )
    expect(verdictExcerpt('Thinking out loud.\nVerdict: Postgres.\nmore')).toBe(
      'Verdict: Postgres.\nmore',
    )
    // A bold conclusion opener (or a demoted heading) still counts.
    expect(verdictExcerpt('Preamble.\n**Verdict:** Postgres.')).toBe(
      '**Verdict:** Postgres.',
    )
    expect(verdictExcerpt('Verdict first already.')).toBe(
      'Verdict first already.',
    )
  })
})

describe('renderShareCard (stubbed canvas)', () => {
  beforeEach(() => {
    stubCanvas()
  })

  it('paints the verdict card and encodes a PNG blob', async () => {
    const recorder = stubCanvas()
    const blob = await renderShareCard({
      structure: 'trial',
      question: 'Which database should we pick for the new service?',
      seats: [
        { provider: 'anthropic', label: 'Claude' },
        { provider: 'openai', label: 'GPT-4o' },
      ],
      processLine: '2 models answered · one Judge ruled',
      scores: [
        { provider: 'openai', label: 'GPT-4o', score: 4.5, winner: true },
      ],
      verdict: {
        role: 'Verdict',
        modelLabel: 'Claude',
        text: 'Use **Postgres** for it. '.repeat(300),
      },
    })
    expect(blob.type).toBe('image/png')
    const painted = recorder.texts.join('\n')
    expect(painted).toContain('Yes-Brainer')
    expect(painted).toContain('TRIAL · VERDICT')
    expect(painted).toContain('Peer-rated best:  ')
    expect(painted).toContain('VERDICT · CLAUDE')
    expect(painted).toContain('yesbrainer.ai')
    // Bold runs paint as their own fillText fragments (the font switch
    // happens between them; a fragment may carry its run's trailing
    // space), never with literal ** markers.
    expect(recorder.texts.some((t) => t.trim() === 'Postgres')).toBe(true)
    expect(painted).not.toContain('**')
    // The adaptive clamp ellipsized the long verdict.
    expect(painted).toMatch(/…/)
  })

  it('degrades to the imageless layout when the attachment cannot decode', async () => {
    // jsdom can't decode images, so `tryLoadImage` yields null — the exact
    // path a corrupt data URI takes in a browser. The card must still paint
    // its full text at the imageless (full-width) question layout.
    const recorder = stubCanvas()
    const blob = await renderShareCard({
      structure: 'trial',
      question: 'Where was this photo taken?',
      userImages: ['data:image/png;base64,AA'],
      seats: [{ provider: 'anthropic', label: 'Claude' }],
      processLine: '1 model answered',
      scores: [],
      verdict: { role: 'Verdict', modelLabel: 'Claude', text: 'A beach.' },
    })
    expect(blob.type).toBe('image/png')
    const painted = recorder.texts.join('\n')
    expect(painted).toContain('Where was this photo taken?')
    expect(painted).toContain('A beach.')
  })

  it('paints the parallel columns card', async () => {
    const recorder = stubCanvas()
    await renderShareCard({
      structure: 'roundtable',
      question: 'q',
      seats: [{ provider: 'google', label: 'Gemini' }],
      processLine: '3 models answered independently',
      scores: [],
      columns: [
        { provider: 'google', label: 'Gemini', excerpt: 'col one text' },
        { provider: 'groq', label: 'Llama', excerpt: 'col two text' },
      ],
    })
    const painted = recorder.texts.join('\n')
    expect(painted).toContain('PARALLEL ANSWERS')
    expect(painted).toContain('col one text')
    expect(painted).toContain('col two text')
    // Glyphs can't rasterize in jsdom — the badge falls back to initials.
    expect(recorder.texts).toContain('G')
  })
})
