/**
 * Zod schema for the council export bundle — the one place user-supplied
 * JSON crosses into the database. An import file is untrusted input (it
 * may be hand-edited, corrupted, or crafted), so every field is validated
 * down to the leaves before a single row is written; unknown keys are
 * stripped by zod's default object behavior.
 *
 * Notable deliberate strictness:
 *  - `userImages` must be `data:image/…` URIs — the chat renders them
 *    straight into `<img src>`, so this is the layer that keeps foreign
 *    protocols (and remote-beacon URLs) out of the DOM. CSP `img-src`
 *    is the second net.
 *  - Numbers must be finite (`z.number()` alone admits NaN/Infinity via
 *    `JSON.parse` never, but hand-built objects reach this in tests) and
 *    token counts non-negative, so imported totals can't poison the
 *    aggregation math.
 *  - Every string and array carries a length ceiling. The tiers are
 *    generous — no export the app itself writes comes near them — but a
 *    crafted bundle can't smuggle unbounded payloads past the validator.
 */

import { z } from 'zod'
import {
  REASONING_EFFORT_VALUES,
  SOCIAL_STRUCTURE_VALUES,
} from '@/types/council'
import type { CouncilDeliberation } from '@/types/council'

// Ceiling tiers (characters). `id` covers ids / model ids / labels /
// record keys; `prompt` covers user-authored prompts and templates;
// `output` covers model-authored free text (answers, errors, raw dumps).
const idString = z.string().min(1).max(1_000)
const promptString = z.string().max(64_000)
const outputString = z.string().max(1_000_000)

const tokenUsageSchema = z.object({
  input: z.number().finite().nonnegative(),
  output: z.number().finite().nonnegative(),
})

const tokenTotalsSchema = z.object({
  inputTokens: z.number().finite().nonnegative(),
  outputTokens: z.number().finite().nonnegative(),
})

const seatConfigSchema = z.object({
  systemPrompt: promptString.optional(),
  temperature: z.number().finite().optional(),
  tools: z
    .union([z.boolean(), z.array(z.string().max(1_000)).max(64)])
    .optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  // Single source with the `ReasoningEffort` union (same rule as
  // `socialStructure` below) — a renamed effort id can't leave the schema
  // accepting values the type system no longer knows.
  reasoningEffort: z.enum(REASONING_EFFORT_VALUES).optional(),
})

const seatSchema = z.object({
  id: idString,
  modelId: idString,
  config: seatConfigSchema.default({}),
})

const synthesiserSchema = z.object({
  modelId: idString,
  config: seatConfigSchema.default({}),
})

const voteEntrySchema = z.object({
  targetSeatId: idString,
  // Rating values are 1–5 by construction; 0–100 leaves room for future
  // scales while keeping a crafted 1e308 out of the leaderboard means.
  ratings: z.record(idString, z.number().finite().min(0).max(100)),
  comment: outputString,
})

const toolCallSchema = z.object({
  name: idString,
  query: outputString.optional(),
})

const movementEntrySchema = z.object({
  label: idString,
  stance: z.enum(['converged', 'shifted', 'held', 'new-point']),
  note: outputString,
})

const roundDigestSchema = z.object({
  summary: outputString,
  movements: z.array(movementEntrySchema).max(256),
})

const mediatorRoundMetadataSchema = z.object({
  round: z.number().int().positive(),
  convergent: z.boolean(),
  divergencePoints: outputString.optional(),
  roundDigest: roundDigestSchema.optional(),
})

const turnEventSchema = z.object({
  id: idString,
  roleType: z.enum(['participant', 'reanswer', 'vote', 'judge', 'mediator']),
  seatId: idString.optional(),
  modelId: idString,
  output: outputString,
  ts: z.number().finite(),
  round: z.number().int().optional(),
  tokens: tokenUsageSchema.optional(),
  error: outputString.optional(),
  vote: z.array(voteEntrySchema).max(256).optional(),
  rawResponse: outputString.optional(),
  mediator: mediatorRoundMetadataSchema.optional(),
  toolCalls: z.array(toolCallSchema).max(1_000).optional(),
})

const turnSchema = z.object({
  id: idString,
  idx: z.number().int().nonnegative(),
  userMsg: outputString,
  events: z.array(turnEventSchema).max(10_000),
  tokenTotal: tokenTotalsSchema,
  votingLabels: z.record(idString, idString).optional(),
  // Caps mirror the composer's attach pipeline (utils/file-to-data-uri.ts:
  // 10 per turn, ~1.5 MiB encoded each) so a crafted bundle can't smuggle
  // unbounded image payloads past what the UI could ever have produced.
  userImages: z
    .array(z.string().startsWith('data:image/').max(1_572_864))
    .max(10)
    .optional(),
})

const dimensionConfigSchema = z.object({
  name: idString,
  description: promptString.optional(),
})

const deliberationSchema = z.object({
  participant: promptString.optional(),
  votingDimensions: z.array(dimensionConfigSchema).max(64).optional(),
  minCommentLength: z.number().int().nonnegative().optional(),
  mediatorMaxRounds: z.number().int().optional(),
  passDivergence: z.boolean().optional(),
  passPeerAnswers: z.boolean().optional(),
  votingSystem: promptString.optional(),
  votingTemplate: promptString.optional(),
  reanswerSystem: promptString.optional(),
  reanswerTemplate: promptString.optional(),
  judgeTemplate: promptString.optional(),
  mediatorTemplate: promptString.optional(),
})

// Completeness check (compile-time): every `CouncilDeliberation` field must
// appear in the schema — one added to the type but missed here would be
// silently stripped from every import (and so wouldn't round-trip a
// backup). All fields are optional, so plain assignability can't catch
// the omission; the key-set difference must be `never`.
type DeliberationFieldsMissingFromSchema = Exclude<
  keyof CouncilDeliberation,
  keyof z.infer<typeof deliberationSchema>
>
void (undefined as unknown as DeliberationFieldsMissingFromSchema satisfies never)

export const bundleCouncilSchema = z.object({
  id: idString,
  title: z.string().max(1_000).nullable().default(null),
  createdAt: z.number().finite(),
  // Single source with the `SocialStructure` union — a renamed id can't
  // leave the schema accepting values the type system no longer knows.
  socialStructure: z.enum(SOCIAL_STRUCTURE_VALUES),
  seats: z.array(seatSchema).min(1).max(64),
  turns: z.array(turnSchema).max(10_000),
  tokenTotal: tokenTotalsSchema,
  judge: synthesiserSchema.optional(),
  mediator: synthesiserSchema.optional(),
  deliberation: deliberationSchema.optional(),
  isDemo: z.boolean().optional(),
})

export const councilBundleSchema = z.object({
  version: z.literal(1),
  exportedAt: z.number().finite(),
  councils: z.array(z.unknown()).max(10_000),
})
