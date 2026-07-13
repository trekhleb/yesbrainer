/**
 * Share-card payload building — the per-structure business logic that
 * turns a persisted turn into the card's data shape (and its clipboard
 * text + filename). The canvas painting lives in `./paint.ts`; keeping
 * the transform pure and canvas-free makes it testable without a DOM.
 */

import { getModel, type ProviderId } from '@/models/registry'
import {
  aggregateVotesByTarget,
  overallScore,
  winningTargetSeatId,
} from '@/utils/vote-leaderboard'
import { assertNever } from '@/utils/assert-never'
import { markdownToPlain } from '@/utils/markdown-to-plain'
import { OFFICIAL_APP_URL } from '@/utils/external-links'
import type { Seat, SocialStructure, TurnEvent } from '@/types/council'

export interface ShareCardSeat {
  provider: ProviderId
  label: string
}

export interface ShareCardScore {
  provider: ProviderId
  label: string
  score: number
  winner: boolean
}

/** One Parallel answer, for the columns layout. */
export interface ShareCardColumn {
  provider: ProviderId
  label: string
  /** Markdown flattened to plain text with `**bold**` runs kept — the
   *  painter renders those with a bold font and truncates. */
  excerpt: string
}

export interface ShareCardData {
  structure: SocialStructure
  question: string
  /** The turn's image attachments (`data:image/…` URIs). The painter
   *  draws the first as a thumbnail beside the question — the question is
   *  often *about* the image (see the geo-guess demo) and a card without it
   *  shows a riddle with no subject; extras become a "+N" count. Nullable
   *  end-to-end: a failed decode just paints the imageless layout. */
  userImages?: string[]
  /** Answering roster, in answer order. */
  seats: ShareCardSeat[]
  /** One-line "how this ran" — the a-ha in a sentence. */
  processLine: string
  /** Trial only: peer-score leaderboard, best first. Empty otherwise. */
  scores: ShareCardScore[]
  /** Verdict layout (Trial / Consensus). Absent on the Parallel columns
   *  card, which has no synthesis. */
  verdict?: {
    /** `Verdict` / `Consensus` — the panel label. */
    role: string
    modelLabel: string
    /** Markdown flattened to plain text, `**bold**` runs kept (see
     *  `ShareCardColumn.excerpt`). */
    text: string
  }
  /** Columns layout (Parallel) — the divergence panorama: each model's
   *  answer truncated side-by-side. Present iff `verdict` is absent. */
  columns?: ShareCardColumn[]
}

/**
 * Build the card payload from a persisted turn — or `null` when the turn
 * has no shareable result (same criterion as `utils/shareability.ts`).
 * Exhaustive over the structures on purpose: a new one must decide its
 * artifact here at compile time.
 */
export function buildShareCardData(args: {
  structure: SocialStructure
  question: string
  events: TurnEvent[]
  seats: Seat[]
  /** The turn's image attachments — see `ShareCardData.userImages`. */
  userImages?: string[]
}): ShareCardData | null {
  const { structure, question, events, seats } = args
  const userImages =
    args.userImages && args.userImages.length > 0
      ? { userImages: args.userImages }
      : {}
  const answered = events.filter(
    (e) => e.roleType === 'participant' && !e.error && e.output.length > 0,
  )
  const cardSeats: ShareCardSeat[] = answered.map((e) => {
    const entry = getModel(e.modelId)
    return { provider: entry.provider, label: entry.label }
  })

  switch (structure) {
    case 'trial': {
      const judge = events.find(
        (e) => e.roleType === 'judge' && !e.error && e.output.length > 0,
      )
      if (!judge) return null
      const entries = aggregateVotesByTarget(events, seats)
      const winnerId = winningTargetSeatId(entries)
      const scores: ShareCardScore[] = entries
        .flatMap((entry) => {
          const score = overallScore(entry)
          if (score === null) return []
          return [
            {
              provider: getModel(entry.targetModelId).provider,
              label: entry.targetDisplayLabel,
              score,
              winner: entry.targetSeatId === winnerId,
            },
          ]
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 4)
      return {
        structure: 'trial',
        question,
        ...userImages,
        seats: cardSeats,
        processLine: `${cardSeats.length} models answered · rated each other anonymously · one Judge ruled`,
        scores,
        verdict: {
          role: 'Verdict',
          modelLabel: getModel(judge.modelId).label,
          text: verdictExcerpt(markdownToPlain(judge.output, { keepBold: true })),
        },
      }
    }

    case 'consensus': {
      const mediatorEvents = events.filter(
        (e) => e.roleType === 'mediator' && !e.error && e.output.length > 0,
      )
      const final = mediatorEvents[mediatorEvents.length - 1]
      if (!final) return null
      const roundCount = mediatorEvents.reduce(
        (m, e) => Math.max(m, e.mediator?.round ?? 1),
        1,
      )
      // "Who moved" across every round's digest — the shareable stat of the
      // Consensus mechanic (an AI changing its mind on the record).
      const movedLabels = new Set<string>()
      for (const e of mediatorEvents) {
        for (const m of e.mediator?.roundDigest?.movements ?? []) {
          if (m.stance === 'converged' || m.stance === 'shifted') {
            movedLabels.add(m.label)
          }
        }
      }
      const convergent = final.mediator?.convergent === true
      const pieces = [
        `${cardSeats.length} models`,
        `${roundCount} round${roundCount === 1 ? '' : 's'} of debate`,
      ]
      if (movedLabels.size > 0) {
        pieces.push(
          movedLabels.size === 1
            ? '1 changed its position'
            : `${movedLabels.size} changed their positions`,
        )
      }
      pieces.push(convergent ? 'consensus reached' : 'disagreements mapped')
      return {
        structure: 'consensus',
        question,
        ...userImages,
        seats: cardSeats,
        processLine: pieces.join(' · '),
        scores: [],
        verdict: {
          role: 'Consensus',
          modelLabel: getModel(final.modelId).label,
          text: verdictExcerpt(markdownToPlain(final.output, { keepBold: true })),
        },
      }
    }

    case 'roundtable': {
      // Parallel's artifact is the *divergence panorama*, not a verdict —
      // show the models' answers side-by-side. Cap at
      // 3 columns (the Compare grid's readability cap); the painter
      // truncates each.
      const columns: ShareCardColumn[] = answered.slice(0, 3).map((e) => ({
        provider: getModel(e.modelId).provider,
        label: getModel(e.modelId).label,
        excerpt: markdownToPlain(e.output, { keepBold: true }),
      }))
      if (columns.length === 0) return null
      const extra = answered.length - columns.length
      return {
        structure: 'roundtable',
        question,
        ...userImages,
        seats: cardSeats,
        processLine:
          `${answered.length} models answered independently — no vote, no single answer` +
          (extra > 0 ? ` (${columns.length} of ${answered.length} shown)` : ''),
        scores: [],
        columns,
      }
    }

    case 'custom':
      // Custom: no defined artifact yet.
      return null

    default:
      assertNever(structure)
      return null
  }
}

/** The clipboard-text companion to the image — quote + result + credit.
 *  Bare text: the `**bold**` runs the painter renders would read as
 *  literal asterisks in a paste, so they're dropped here. */
export function buildShareText(data: ShareCardData): string {
  const bare = (s: string) => s.replace(/\*\*/g, '')
  // The paste can't carry the attachment the card shows — say it existed,
  // or an image question ("where was this photo taken?") reads as a riddle.
  const imageCount = data.userImages?.length ?? 0
  const imagesNote =
    imageCount === 0
      ? []
      : [
          imageCount === 1
            ? '(asked about an attached image)'
            : `(asked about ${imageCount} attached images)`,
        ]
  if (data.verdict) {
    return [
      `“${data.question}”`,
      ...imagesNote,
      '',
      bare(data.verdict.text),
      '',
      `— ${data.verdict.role} by ${data.verdict.modelLabel}, after ${data.processLine}`,
      OFFICIAL_APP_URL,
    ].join('\n')
  }
  // Parallel: the panorama in words — each model's answer under its name.
  const columns = data.columns ?? []
  return [
    `“${data.question}”`,
    ...imagesNote,
    '',
    ...columns.flatMap((c) => [`${c.label}:`, bare(c.excerpt), '']),
    `— ${data.processLine}`,
    OFFICIAL_APP_URL,
  ].join('\n')
}

export function shareCardFilename(question: string): string {
  const slug = question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return `yesbrainer-${slug || 'council'}.png`
}

// Lines that read as "here's the conclusion" — used to skip synthesis
// preamble on the card. The synthesis prompts now ask the model to open
// with the standalone sentence (see storage/prompts.ts), so on well-formed
// output line 0 is already the conclusion and this is a no-op; it's the
// safety net for verbose or legacy verdicts that bury the ruling.
// Tolerates a leading `**` — with `keepBold`, a `# Verdict` heading (or a
// bold opener) reaches this as `**Verdict**`.
const CONCLUSION_OPENER =
  /^\s*(?:\*\*\s*)?(verdict|consensus|recommendation|ruling|bottom line|final answer|the answer|short answer|in short|tl;?dr)\b/i

/**
 * Trim synthesis preamble for the card excerpt: if a conclusion-opener line
 * appears within the first few lines but *isn't* the first, drop everything
 * above it so the card leads with the ruling instead of throat-clearing.
 * Never reorders or rewrites — worst case it returns the text unchanged.
 */
export function verdictExcerpt(plain: string): string {
  const lines = plain.split('\n')
  for (let i = 1; i < Math.min(lines.length, 5); i++) {
    if (CONCLUSION_OPENER.test(lines[i] ?? '')) {
      return lines.slice(i).join('\n')
    }
  }
  return plain
}
