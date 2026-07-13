/**
 * Phase-state types for the in-flight orchestrator.
 *
 * `useCouncilSession` (in `src/hooks/use-council-session.ts`) coordinates
 * the overlapping phases per turn — streaming Participant answers, Trial
 * voting + Judge synthesis, and the Consensus debate (Mediator rounds
 * interleaved with Participant re-answers) — each
 * with its own intermediate state. These types describe that state so
 * the chat-thread can render in-flight progress and the hook's API
 * surface (`UseCouncilSession`) stays typed.
 *
 * Lives in `src/types/` so consumers (chat-thread, future phase
 * modules) can import the shapes without dragging in the hook itself.
 */

import type {
  RoundDigest,
  ToolCallSummary,
  VoteEntry,
} from '@/types/council'

export interface PerSeatStream {
  status: 'streaming' | 'done' | 'error'
  error: string | null
  output: string
  modelId: string
  /** Live-only thinking feed (reasoning summary / thoughts) streamed while
   *  the seat deliberates. Ephemeral by construction: it lives only in this
   *  in-flight state and is never written to a `TurnEvent`, so it can't
   *  reach seat histories, voter/judge prompts, exports, or share cards. */
  reasoning?: string
}

export interface StreamingTurn {
  id: string
  userMsg: string
  perSeat: Record<string, PerSeatStream>
  /** Image attachments the user sent with this in-flight turn.
   *  Mirrors `Turn.userImages` — the in-flight UserBubble renders the
   *  same thumbnails the persisted bubble will. */
  userImages?: string[]
}

export interface PerVoterStream {
  status: 'voting' | 'done' | 'error'
  error: string | null
  /** Real-seat-id votes, populated when status === 'done'. */
  vote: VoteEntry[] | null
  /** Voter's model id; mirrors PerSeatStream so the UI can render logos
   *  before the persisted event arrives. */
  modelId: string
  /** Raw model response captured when parsing failed; surfaced in the
   *  error-inspector popover next to the error tag. */
  rawResponse: string | null
}

export interface VotingTurn {
  /** Same id as the answering turn — voting is a phase within one turn. */
  id: string
  perVoter: Record<string, PerVoterStream>
  /** Label → seatId for this turn; the UI uses it to remap any inspector
   *  preview but it's not the canonical reference (events store real ids). */
  votingLabels: Record<string, string>
}

export interface JudgingTurn {
  /** Same id as the answering turn — Judge synthesis is a later phase. */
  id: string
  modelId: string
  status: 'judging' | 'done' | 'error'
  error: string | null
  output: string
}

/**
 * Present while the Consensus debate is in flight. The
 * Participants and Mediator alternate up to `maxRounds` rounds: each round
 * the Mediator assesses convergence (`rounds`), and when it doesn't
 * converge the Participants re-answer (`reanswers`, keyed by the round they
 * belong to). `currentRound` is the round the loop is on. The interleaved
 * chat view reads both maps to render the timeline as it lands.
 */
export interface MediatingTurn {
  id: string
  modelId: string
  maxRounds: number
  currentRound: number
  rounds: MediatorRoundOutcome[]
  /** Per-round Participant re-answer streams, keyed by round number
   *  (≥ 2 — round 1 is the shared answer fan-out in `StreamingTurn`).
   *  Each value mirrors `StreamingTurn.perSeat`. */
  reanswers: Record<number, Record<string, PerSeatStream>>
  /** Per-turn anonymization map (label → seatId), so the in-flight digest
   *  can render movements against real seats before the turn persists. */
  labels: Record<string, string>
  status: 'mediating' | 'done' | 'error'
}

export interface MediatorRoundOutcome {
  round: number
  status: 'mediating' | 'done' | 'error'
  synthesis: string
  convergent?: boolean
  divergencePoints?: string
  /** Per-round transparency digest — who moved / who held. */
  roundDigest?: RoundDigest
  /** Raw model response when the structured-output parser failed —
   *  surfaces in the round card via `<ErrorInspector>` so users can see
   *  what the model actually returned. */
  rawResponse?: string
  error: string | null
}

/**
 * Present while a single errored Participant answer is being re-run in
 * place (the per-seat Retry button on a persisted Parallel turn). The
 * chat thread overlays this on the matching pane — streaming output
 * replaces the error until the retried event lands via `replaceEvent`.
 */
export interface SeatRetryState {
  turnId: string
  seatId: string
  output: string
}

/**
 * Present while an errored synthesis — the Judge verdict, or a Consensus
 * turn's final Mediator round — is being re-run in place (the Retry
 * button on the errored block of a persisted turn). Mirrors
 * `SeatRetryState`: the chat thread overlays the in-flight state on the
 * matching block until the retried event lands via `replaceEvent`.
 * `output` streams for the Judge; a Mediator round is non-streaming
 * (`generateObject`), so its overlay just shows the round loader.
 */
export interface SynthRetryState {
  turnId: string
  role: 'judge' | 'mediator'
  /** Model running the retry — the council's *current* role config, which
   *  may differ from the errored event's model if the role was reassigned
   *  since (often the reason to retry). */
  modelId: string
  /** The Mediator round being re-run (mediator retries only). */
  round?: number
  output: string
}

/* ── Render view-models ──────────────────────────────────────────────────
 *
 * The shapes the pane/round/voter derivations (`utils/chat-panes.ts`,
 * `utils/voter-entries.ts`) produce and the chat-thread components
 * consume. They live here — not with their canonical renderers — so the
 * pure transform layer never has to import component modules to name its
 * own return types. */

/** One Participant answer pane, ready to render (Roundtable / re-answer
 *  rounds). Built by `panesForTurn` / the streaming twin. */
export interface RoundtablePane {
  key: string
  modelId: string
  /** Seat that produced (or should have produced) this answer. Set by
   *  `panesForTurn`; used to target the per-seat answer retry. */
  seatId?: string
  /** Disambiguated label (with `#N` suffix when duplicates exist). Falls
   *  back to the registry label when undefined — used by historical-event
   *  rendering where the seat may have been removed. */
  displayLabel?: string
  output: string
  status: 'streaming' | 'done' | 'error'
  error?: string | null
  /** Render this pane as a ghosted placeholder with the given reason
   *  instead of an answer. Used when a seat was deliberately
   *  skipped from the turn — e.g. an image-bearing turn against a
   *  non-vision model. Sets opacity + hides interactive affordances;
   *  the reason renders in place of the body. */
  ghostReason?: string
  /** Provider-native tool calls the seat ran during streaming.
   *  Surfaces as a small "🌐 Searched the web · 'X'" annotation above
   *  the model output so the user knows the answer used live data. */
  toolCalls?: ToolCallSummary[]
  /** Live thinking feed for the in-flight pane — only ever
   *  set by `panesForStreamingTurn` while the seat streams; persisted
   *  panes never carry it (reasoning is not stored). */
  reasoning?: string
  /** Re-run this seat's errored answer — renders a Retry button inside the
   *  pane's error notification. Attached by `TurnView` only where a retry
   *  is offered (Parallel councils, latest turn, nothing in flight). */
  onRetry?: () => void
}

/**
 * One Mediator round, ready to render (`RoundCard`). Digest labels are
 * already resolved to real seat names — the anonymized Model A/B/C labels
 * are a prompt-only concern; the user sees who actually moved.
 */
export interface MediatorRoundView {
  /** 1-indexed round number. */
  round: number
  modelId: string
  status: 'mediating' | 'done' | 'error'
  /** The Mediator's synthesis attempt for this round. Empty while in flight. */
  synthesis: string
  /** Self-assessed convergence verdict. `undefined` while in flight / on error. */
  convergent?: boolean
  /** What's still in dispute when `convergent === false`. */
  divergencePoints?: string
  /** Per-round transparency digest with labels already mapped to real seats. */
  digest?: ResolvedDigest
  /** Raw model response when the structured-output parser failed. */
  rawResponse?: string
  error?: string | null
  /** Re-run this errored round in place. Attached only where the retry is
   *  offered (the turn's final errored round, latest turn, nothing in
   *  flight); undefined hides the button. */
  onRetry?: () => void
  /** Open the share modal for this round's synthesis.
   *  Attached by the turn view to the *final finished* round only. */
  onShare?: () => void
  /** Play the one-shot arrival entrance (the "reveal") — set by the turn
   *  view on the latest turn's final consensus round. */
  arrival?: boolean
}

export interface ResolvedDigest {
  summary: string
  movements: ResolvedMovement[]
}

export interface ResolvedMovement {
  /** Real seat display label (resolved from the anonymized label). */
  displayLabel: string
  stance: 'converged' | 'shifted' | 'held' | 'new-point'
  note: string
}

/** One voter's row in the voting block — persisted vote events and the
 *  in-flight retry overlay merged into one shape (`mergeVoterEntries`). */
export interface VoterEntry {
  key: string
  voterSeatId: string
  modelId: string
  status: 'voting' | 'done' | 'error'
  error?: string | null
  vote?: VoteEntry[] | null
  /** Raw model response captured on parse failure. */
  rawResponse?: string | null
}
