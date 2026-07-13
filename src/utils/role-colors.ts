/**
 * Colour for the tinted chat-thread blocks. Each in-chat phase borrows its
 * **council type's** colour, so a section is associated with its type:
 *
 *   - **Judge** — Trial's verdict — wears the same **gold** as Voting, which
 *     matches the gold Trial type colour.
 *   - **Mediator** — Consensus's key figure — wears the **Consensus / Town
 *     Hall** colour.
 *   - **Roundtable** — the universal answer fan-out — wears the **Parallel**
 *     colour, in every council.
 *
 * These read `structureColorSet`, so they follow `ACTIVE_PALETTE` automatically
 * — reskinning the app retints the chat with it (Judge tracks Trial, etc.).
 *
 *   - **Voting** is the one exception: it keeps its own **amber/gold** — the
 *     "score / rating" cue (matching its gold stars), kept deliberately distinct
 *     from the verdict it precedes so the peer-review phase never masquerades as
 *     the conclusion.
 *
 * The synthesis blocks tint the answer *card* (border + header bar); the sticky
 * stage header stays the neutral page surface, with only its label text + icon
 * chip carrying the colour. Each role exposes a light + dark triple (dark
 * surfaces use the structure module's alpha-blended tints).
 */

import type { Theme } from 'baseui'
import type { StyleObject } from 'styletron-react'
import { structureColorSet } from '@/models/social-structure-colors'
import type { SocialStructure } from '@/types/council'

export type SynthesisRole = 'judge' | 'mediator' | 'voting' | 'roundtable'

export interface RoleColors {
  /** Section background tint. */
  bg: string
  /** Light hairline around the section / internal dividers. */
  border: string
  /** The darker type-coloured **card outline** for the synthesis card — mirrors
   *  `StructureColorSet.cardBorder` so a Judge / Mediator card outlines in the
   *  same token as its council type. */
  cardBorder: string
  /** Saturated colour for the header icon / emphasis. */
  accent: string
  /** AA-safe colour for the sticky stage-header *label text* (on the white
   *  header). */
  label: string
  /** Vivid fill for the gradient icon-chip. */
  solid: string
  /** Optional bright two-stop gradient for that chip (flat palettes omit it). */
  solidGradient?: string
  /** Icon colour on `solid` — white. */
  onSolid: string
}

/** Which council-type structure each coloured role borrows its palette from.
 *  Voting + Judge are absent — they share the gold below. Judge uses Voting's
 *  hand-tuned gold (which matches the gold Trial type) rather than deriving via
 *  `judge: 'trial'` — the structure-derived label darkens the accent ~20% for
 *  AA, which would needlessly bronze the already-dark gold. */
const ROLE_STRUCTURE: Partial<Record<SynthesisRole, SocialStructure>> = {
  mediator: 'consensus',
  roundtable: 'roundtable',
}

function fromStructure(structure: SocialStructure, isDark: boolean): RoleColors {
  const c = structureColorSet(structure, isDark)
  return {
    bg: c.bg,
    border: c.border,
    cardBorder: c.cardBorder,
    accent: c.accent,
    // Light mode: darken the accent ~20% so the small uppercase stage-header
    // label clears WCAG AA on the white header (the brighter type accents —
    // pink / teal — are a touch light as text). Dark mode: the accent is
    // already the light shade, which reads on the near-black surface.
    label: isDark ? c.accent : `color-mix(in srgb, ${c.accent} 80%, #000)`,
    solid: c.solid,
    solidGradient: c.solidGradient,
    onSolid: c.onSolid,
  }
}

// Voting keeps its own gold (the score-rating cue, matching the gold stars) — a
// brighter yellow-gold, not the old bronze-y amber. The chip gradient runs
// yellow-700 → bright yellow-400; the small uppercase label holds at yellow-700,
// the brightest gold that still clears AA as text on the white header (a true
// bright gold would fail there — gold is inherently light). Dark mode lifts the
// accent + label to yellow-400 and alpha-blends the tint over the near-black.
const VOTING_LIGHT: RoleColors = {
  bg: '#fefce8',
  border: '#fef08a',
  // The Judge card (which borrows this gold) outlines in this darker gold.
  cardBorder: '#ca8a04',
  accent: '#ca8a04',
  label: '#a16207',
  solid: '#a16207',
  solidGradient: 'linear-gradient(135deg, #A16207 0%, #FACC15 100%)',
  onSolid: '#ffffff',
}
const VOTING_DARK: RoleColors = {
  bg: 'rgba(234, 179, 8, 0.10)',
  border: 'rgba(234, 179, 8, 0.32)',
  cardBorder: '#facc15',
  accent: '#facc15',
  label: '#facc15',
  solid: '#a16207',
  solidGradient: 'linear-gradient(135deg, #A16207 0%, #FACC15 100%)',
  onSolid: '#ffffff',
}

export function roleColors(role: SynthesisRole, isDark: boolean): RoleColors {
  const structure = ROLE_STRUCTURE[role]
  if (structure) return fromStructure(structure, isDark)
  return isDark ? VOTING_DARK : VOTING_LIGHT
}

/**
 * The role-tinted header bar a synthesis card leads with (Judge verdict,
 * Mediator round): a wrap-friendly chip row on the role's `bg` tint,
 * closed by the neutral divider. The card's colour identity lives *here*
 * — the card outline stays neutral grey like the Roundtable / Voting
 * cards (no coloured borders anywhere). Wrapping (never truncating)
 * keeps every badge fully visible on narrow cards. One definition so the
 * Judge and Mediator headers can't drift apart.
 */
export function roleHeaderBarStyle(theme: Theme, bg: string): StyleObject {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
    paddingTop: '8px',
    paddingBottom: '8px',
    paddingLeft: '12px',
    paddingRight: '12px',
    fontSize: '13px',
    color: theme.colors.contentSecondary,
    backgroundColor: bg,
    borderBottom: `1px solid ${theme.colors.borderOpaque}`,
  }
}
