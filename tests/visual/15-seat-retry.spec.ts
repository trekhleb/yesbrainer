/**
 * Per-seat answer retry on Trial / Consensus turns whose answers no
 * downstream phase consumed — the partially-keyed send (e.g. a follow-up
 * into a demo council before the keys matching its seats land): every
 * seat fails with "key not configured", voting / the Mediator debate is
 * skipped, and the turn holds errored participant events only. The Retry
 * button must appear inside each failed answer's error notification
 * exactly as it does on Parallel councils; once a turn carries downstream
 * output (a verdict here — votes / debate rounds behave the same) the
 * affordance must stay hidden, since a late answer would be invisible to
 * the recorded outcome.
 *
 * These councils are imported per-test through the app's own validated
 * restore path (same as seed.setup), NOT added to the shared seed bundle:
 * extra sidebar rows there would reflow every committed baseline.
 */

import { expect, test, type Page } from '@playwright/test'
import { SEEDED_STATE, gotoCouncil } from './helpers'

test.use({ storageState: SEEDED_STATE })

const COUNCIL_IDS = {
  trialKeyless: 'vr-trial-keyless',
  consensusKeyless: 'vr-consensus-keyless',
  trialConcluded: 'vr-trial-concluded',
} as const

/** Fixed "now" one day after the seed fixtures' T0, so these rows sort
 *  deterministically in the sidebar of this spec's own screenshots. */
const T0 = Date.UTC(2026, 5, 29, 12, 0, 0)

const zeroTotals = { inputTokens: 0, outputTokens: 0 }

function seat(id: string, modelId: string) {
  return { id, modelId, config: {} }
}

/** The exact string `MissingKeyError` (providers/index.ts) produces — the
 *  error a seat without its provider's key persists on a send. */
function keyError(provider: 'Anthropic' | 'OpenAI' | 'Google'): string {
  return `${provider} API key not configured. Open Settings and paste a key.`
}

/** Seat ids are prefixed per council — the Dexie `seats` table keys on the
 *  seat id globally, so ids shared across imported councils would collide
 *  (only one council would keep its roster). Same convention as the seed
 *  fixtures' `vf-t-s1` / `vf-c-s1` naming. */
const SEAT_COUNT = 3
function councilSeats(prefix: string) {
  return [
    seat(`${prefix}-s1`, 'anthropic:claude-sonnet-5'),
    seat(`${prefix}-s2`, 'openai:gpt-5.4'),
    seat(`${prefix}-s3`, 'google:gemini-3.5-flash'),
  ]
}

let eventSeq = 0
function keylessAnswers(seats: ReturnType<typeof councilSeats>) {
  const providers = ['Anthropic', 'OpenAI', 'Google'] as const
  return seats.map((s, i) => {
    eventSeq += 1
    return {
      id: `vr-ev-${String(eventSeq).padStart(3, '0')}`,
      roleType: 'participant' as const,
      seatId: s.id,
      modelId: s.modelId,
      output: '',
      ts: T0,
      error: keyError(providers[i] as (typeof providers)[number]),
    }
  })
}

function buildRetryBundle() {
  const trialSeats = councilSeats('vr-t')
  const consensusSeats = councilSeats('vr-c')
  const concludedSeats = councilSeats('vr-d')
  return {
    version: 1 as const,
    exportedAt: T0,
    councils: [
      {
        id: COUNCIL_IDS.trialKeyless,
        title: 'Lease clause pushback',
        createdAt: T0,
        socialStructure: 'trial' as const,
        seats: trialSeats,
        judge: { modelId: 'anthropic:claude-opus-4-8', config: {} },
        turns: [
          {
            id: 'vr-turn-t1',
            idx: 0,
            userMsg:
              'The landlord added “tenant pays all repairs” and “landlord may enter at any time”. Which clause do I push back on hardest, and with what wording?',
            events: keylessAnswers(trialSeats),
            tokenTotal: zeroTotals,
          },
        ],
        tokenTotal: zeroTotals,
      },
      {
        id: COUNCIL_IDS.consensusKeyless,
        title: 'Buy vs rent in 2026',
        createdAt: T0 + 60_000,
        socialStructure: 'consensus' as const,
        seats: consensusSeats,
        mediator: { modelId: 'anthropic:claude-opus-4-8', config: {} },
        turns: [
          {
            id: 'vr-turn-c1',
            idx: 0,
            userMsg:
              'With 20% down saved and a 7-year horizon, do we buy now or keep renting and invest the difference?',
            events: keylessAnswers(consensusSeats),
            tokenTotal: zeroTotals,
          },
        ],
        tokenTotal: zeroTotals,
      },
      {
        // The negative shape: one seat answered, the Judge already ruled
        // (voting skipped — one responder), two seats failed. The verdict
        // consumed the answers, so the errored panes must NOT offer Retry.
        id: COUNCIL_IDS.trialConcluded,
        title: 'Slow query diagnosis',
        createdAt: T0 + 120_000,
        socialStructure: 'trial' as const,
        seats: concludedSeats,
        judge: { modelId: 'anthropic:claude-opus-4-8', config: {} },
        turns: [
          {
            id: 'vr-turn-t2',
            idx: 0,
            userMsg:
              'WHERE DATE(created_at) = CURRENT_DATE is slow on 50M rows despite an index on created_at — what is the fix?',
            events: [
              {
                id: 'vr-ev-done-1',
                roleType: 'participant' as const,
                seatId: 'vr-d-s1',
                modelId: 'anthropic:claude-sonnet-5',
                output:
                  '`DATE(created_at)` wraps the column in a function, so the index never applies. Rewrite as a **sargable range**: `WHERE created_at >= CURRENT_DATE AND created_at < CURRENT_DATE + INTERVAL \'1 day\'`.',
                ts: T0,
                tokens: { input: 640, output: 96 },
              },
              {
                id: 'vr-ev-done-2',
                roleType: 'participant' as const,
                seatId: 'vr-d-s2',
                modelId: 'openai:gpt-5.4',
                output: '',
                ts: T0,
                error: keyError('OpenAI'),
              },
              {
                id: 'vr-ev-done-3',
                roleType: 'participant' as const,
                seatId: 'vr-d-s3',
                modelId: 'google:gemini-3.5-flash',
                output: '',
                ts: T0,
                error: keyError('Google'),
              },
              {
                id: 'vr-ev-done-4',
                roleType: 'judge' as const,
                modelId: 'anthropic:claude-opus-4-8',
                output:
                  '**Verdict: rewrite the predicate as a range.** The function-wrapped column defeats the index; the half-open interval `[CURRENT_DATE, CURRENT_DATE + 1 day)` restores the index scan with identical semantics.',
                ts: T0 + 30_000,
                tokens: { input: 820, output: 74 },
              },
            ],
            tokenTotal: { inputTokens: 1460, outputTokens: 170 },
          },
        ],
        tokenTotal: { inputTokens: 1460, outputTokens: 170 },
      },
    ],
  }
}

/** Import the retry fixtures through Settings → Storage — per test, so the
 *  shared seeded state (and every other spec's sidebar) stays untouched. */
async function importRetryBundle(page: Page): Promise<void> {
  const bundle = buildRetryBundle()
  await page.goto('/settings/storage')
  await page.locator('input[type="file"]').setInputFiles({
    name: 'seat-retry-fixtures.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(bundle)),
  })
  const report = page.getByText(/Imported/)
  await expect(report).toBeVisible()
  await expect(report).toContainText(`Imported ${bundle.councils.length}`)
  await expect(report).toContainText('0 errors')
}

test.beforeEach(async ({ page }) => {
  await importRetryBundle(page)
})

test('trial: every keyless answer offers Retry on its error', async ({
  page,
}) => {
  await gotoCouncil(page, COUNCIL_IDS.trialKeyless)
  const roundtable = page.locator('section[aria-label="Roundtable"]').first()
  await roundtable.scrollIntoViewIfNeeded()
  await expect(
    roundtable.getByRole('button', { name: 'Retry', exact: true }),
  ).toHaveCount(SEAT_COUNT)
  await expect(page).toHaveScreenshot('seat-retry-trial.png')
})

test('consensus: every keyless answer offers Retry on its error', async ({
  page,
}) => {
  await gotoCouncil(page, COUNCIL_IDS.consensusKeyless)
  const roundtable = page.locator('section[aria-label="Roundtable"]').first()
  await roundtable.scrollIntoViewIfNeeded()
  await expect(
    roundtable.getByRole('button', { name: 'Retry', exact: true }),
  ).toHaveCount(SEAT_COUNT)
  await expect(page).toHaveScreenshot('seat-retry-consensus.png')
})

test('concluded trial turn: verdict exists, so errored answers offer no Retry', async ({
  page,
}) => {
  await gotoCouncil(page, COUNCIL_IDS.trialConcluded)
  const roundtable = page.locator('section[aria-label="Roundtable"]').first()
  await roundtable.scrollIntoViewIfNeeded()
  // The failures still render (honest history)…
  await expect(
    roundtable.getByText(keyError('OpenAI'), { exact: true }),
  ).toBeVisible()
  // …but the answers were consumed by the verdict, so no per-seat Retry.
  await expect(
    roundtable.getByRole('button', { name: 'Retry', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.locator('section[aria-label="Judge"]').getByText(/Verdict/).first(),
  ).toBeVisible()
})
