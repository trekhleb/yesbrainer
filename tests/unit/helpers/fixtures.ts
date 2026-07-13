/**
 * Shared builders for the domain fixtures unit tests assemble constantly.
 * Every builder takes a partial override so a test states only what it's
 * about. Model ids reference real registry entries (`getModel` resolves
 * them without the unlisted-fallback warning).
 */

import type {
  Council,
  Seat,
  Turn,
  TurnEvent,
} from '@/types/council'
import type { NativeModelId } from '@/models/registry'
import { EMPTY_TOKENS, summarizeEvents } from '@/utils/token-totals'

// Typed against the registry's derived `NativeModelId` union: a model version
// bump (editing `NATIVE_MODELS`) turns every stale id here — and, via the
// typed `seat()` below, every `seat(...)` call across the suite — into a
// compile error. The capability-named handles keep "the vision model" / "the
// text-only model" defined once for the many tests that depend on a specific
// capability (image replay, reasoning-effort gating, …), so a swap is one edit.
export const MODEL_A: NativeModelId = 'anthropic:claude-sonnet-5'
export const MODEL_B: NativeModelId = 'openai:gpt-5.4'
export const MODEL_C: NativeModelId = 'google:gemini-3.5-flash'
/** tools + vision + reasoning (the "rich" seat). */
export const VISION_MODEL: NativeModelId = 'openai:gpt-5.4'
/** no vision, no reasoning (Groq Llama — the only non-reasoning native left). */
export const TEXT_ONLY_MODEL: NativeModelId = 'groq:llama-3.3-70b'

export function seat(id: string, modelId: NativeModelId = MODEL_A): Seat {
  return { id, modelId, config: {} }
}

let eventSeq = 0

export function participantEvent(
  seatId: string,
  over: Partial<TurnEvent> = {},
): TurnEvent {
  eventSeq += 1
  return {
    id: `ev-${eventSeq}`,
    roleType: 'participant',
    seatId,
    modelId: MODEL_A,
    output: `answer from ${seatId}`,
    ts: 1_700_000_000_000 + eventSeq,
    ...over,
  }
}

export function synthesisEvent(
  roleType: 'judge' | 'mediator',
  over: Partial<TurnEvent> = {},
): TurnEvent {
  eventSeq += 1
  return {
    id: `ev-${eventSeq}`,
    roleType,
    modelId: MODEL_B,
    output: `${roleType} synthesis`,
    ts: 1_700_000_000_000 + eventSeq,
    ...over,
  }
}

export function turn(over: Partial<Turn> = {}): Turn {
  const events = over.events ?? []
  return {
    id: `turn-${++eventSeq}`,
    idx: 0,
    userMsg: 'What should we do?',
    events,
    tokenTotal: over.tokenTotal ?? summarizeEvents(events),
    ...over,
  }
}

export function council(over: Partial<Council> = {}): Council {
  return {
    id: `council-${++eventSeq}`,
    title: 'Test council',
    createdAt: 1_700_000_000_000,
    socialStructure: 'roundtable',
    seats: [seat('s1'), seat('s2', MODEL_B)],
    turns: [],
    tokenTotal: EMPTY_TOKENS,
    ...over,
  }
}
