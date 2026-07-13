/**
 * Single source of truth for social-structure (deliberation-shape)
 * metadata: stable id, display label, one-line description, and the icon
 * used everywhere a structure is surfaced — the New-council picker, the
 * read-only council-header summary, the sidebar row glyph, and first-run
 * onboarding. Keep the copy here, not inline in components, so the picker
 * and the read-only summaries can never drift.
 */

import type { ComponentType } from 'react'
import { LuGitFork, LuHandshake, LuScale } from 'react-icons/lu'
import { rotated, type IconProps } from '@/components/icon'
import type { SocialStructure } from '@/types/council'

/**
 * Single source for the structure / role glyphs. A structure and its synthesis
 * role share one icon — **Trial ↔ Judge = scales**, **Consensus ↔ Mediator =
 * handshake** — so the in-chat role block can never drift from its structure's
 * pill / picker / about glyph: change it here once and everything moves
 * together. The Parallel "fork" is rotated 180° (via the shared `rotated()`
 * wrapper) so the root (your question) sits on top and the branches fan down to
 * the parallel answers.
 */
export const STRUCTURE_ICON = {
  roundtable: rotated(LuGitFork, 180),
  trial: LuScale,
  consensus: LuHandshake,
  // `custom` is deliberately absent (renders neutrally, no glyph); every
  // other structure — including future ones, compile-enforced by the
  // `satisfies` — must carry an icon.
} satisfies Record<Exclude<SocialStructure, 'custom'>, ComponentType<IconProps>>

export interface SocialStructureMeta {
  id: SocialStructure
  /** Full, descriptive name — used where there's room to explain: the
   *  New-council picker, /about cards, and the pill's tooltip / aria. */
  label: string
  /** One-word name for tight, repeated chrome (the `StructurePill` shown
   *  on council cards + the council header). Keeps the type glanceable
   *  without eating horizontal space. */
  shortLabel: string
  description: string
  /** react-icons component; rendered without forwarding the caller's
   *  props so it inherits `currentColor` (matches the surrounding text). */
  Icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean }>
}

/**
 * The three shippable structures, ordered **simplest → most complex**
 * (Parallel → Consensus → Trial) — the single ordering shown everywhere they're
 * listed left-to-right (New-council picker, /about cards, demos, Settings →
 * Councils). `custom` isn't creatable yet, so it has no entry —
 * `socialStructureMeta` returns `undefined` for it and callers fall back
 * gracefully.
 */
export const SOCIAL_STRUCTURES: SocialStructureMeta[] = [
  {
    id: 'roundtable',
    label: 'Parallel answers',
    shortLabel: 'Parallel',
    description:
      'Every participant model answers your question independently — no voting, no single answer. You see all responses side-by-side and compare them yourself.',
    Icon: STRUCTURE_ICON.roundtable,
  },
  {
    id: 'consensus',
    label: 'Consensus debate',
    shortLabel: 'Consensus',
    description:
      'Participant models answer, then debate across rounds — each reconsidering in light of the others while a Mediator referees — until they converge on one answer or the remaining disagreements are surfaced.',
    Icon: STRUCTURE_ICON.consensus,
  },
  {
    id: 'trial',
    label: 'Trial verdict',
    shortLabel: 'Trial',
    description:
      'Participant models answer, then rate each other anonymously. A Judge model reads the answers and the peer ratings, then delivers one final verdict.',
    Icon: STRUCTURE_ICON.trial,
  },
]

export function socialStructureMeta(
  id: SocialStructure,
): SocialStructureMeta | undefined {
  return SOCIAL_STRUCTURES.find((s) => s.id === id)
}
