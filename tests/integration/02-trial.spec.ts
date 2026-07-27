/**
 * The Trial pipeline, end to end: fan-out → anonymized peer voting →
 * leaderboard → Judge verdict → persisted.
 *
 * This is the highest-value single flow in the suite. It's the only one
 * that drives both provider code paths in one run — `streamText` for the
 * answers and the verdict, `generateObject` for the votes — and it carries
 * the app's one genuine correctness property: **anonymization integrity**.
 *
 * The votes are scored by *content*, never by label. Each seat answers
 * with a distinct marker, and the voter handler awards 5s to whichever
 * label happens to sit above the marker it was told to prefer. So the
 * expected winner is fixed even though the per-turn shuffle decides the
 * letters — and if the label→seat mapping ever inverted, the wrong seat
 * would take the ★ and this test would say so.
 */

import { expect, test } from '@playwright/test'
import { installAnthropicMock, parseLabeledAnswers } from './mock-anthropic'
import {
  SEAT_MODELS,
  ask,
  emptyCouncil,
  importCouncil,
  seedReadyProfile,
} from './helpers'

const QUESTION = 'Should we migrate the monolith to microservices?'

/** Distinct per-seat markers, so votes can be scored by content. */
const MARKERS = {
  sonnet: 'Split the seams that actually hurt, nothing else.',
  fable: 'Keep the monolith and fix the deploy pipeline first.',
  haiku: 'The Colosseum of services reopens at nine.',
} as const

/** The Haiku seat opens by naming itself. `stripSelfIdentification` must
 *  remove that sentence before the answer enters the voting pool — an
 *  unconditional correctness property, per DEVELOPMENT.md. */
const HAIKU_ANSWER = `As Claude, I should say this up front. ${MARKERS.haiku}`

/** Every brand cue that must never reach a voter. */
const BRAND_LEAKS = ['Claude', 'Sonnet', 'Fable', 'Haiku', 'Anthropic']

test('a Trial council answers, votes, and returns a verdict', async ({
  page,
}) => {
  await seedReadyProfile(page)
  const mock = await installAnthropicMock(page, {
    participant: (call) => {
      if (call.model === SEAT_MODELS.sonnet.wire) return MARKERS.sonnet
      if (call.model === SEAT_MODELS.fable.wire) return MARKERS.fable
      return HAIKU_ANSWER
    },
    vote: (call) => {
      // Rate by content: the Sonnet answer is the peers' favourite,
      // whatever letter it wears this turn.
      const answers = parseLabeledAnswers(call.prompt)
      return {
        votes: Object.entries(answers).map(([label, text]) => {
          const top = text.includes(MARKERS.sonnet)
          return {
            label,
            accuracy: top ? 5 : 3,
            completeness: top ? 5 : 3,
            insight: top ? 5 : 3,
            comment: top ? 'Sharpest of the three.' : 'Reasonable but thin.',
          }
        }),
      }
    },
    judge: () => 'Migrate only the seams that hurt. The rest can wait.',
    title: () => ({ title: 'Monolith Versus Microservices' }),
  })

  const councilId = await importCouncil(
    page,
    emptyCouncil('it-trial', 'trial', 'Trial integration council'),
  )
  await ask(page, QUESTION)

  /* --- 1. Fan-out: every seat answered, exactly once each ----------- */
  const judge = page.locator('section[aria-label="Judge"]')
  await expect(judge).toBeVisible({ timeout: 30_000 })

  const answered = mock.of('participant')
  expect(answered.map((call) => call.model).sort()).toEqual(
    [
      SEAT_MODELS.fable.wire,
      SEAT_MODELS.haiku.wire,
      SEAT_MODELS.sonnet.wire,
    ].sort(),
  )
  await expect(page.getByText(MARKERS.sonnet)).toBeVisible()
  await expect(page.getByText(MARKERS.fable)).toBeVisible()

  /* --- 2. Anonymization integrity ---------------------------------- */
  const votes = mock.of('vote')
  expect(votes).toHaveLength(3)
  for (const call of votes) {
    // Each voter rates its two peers, never itself.
    expect(call.labels).toHaveLength(2)
    for (const leak of BRAND_LEAKS) {
      expect(call.prompt).not.toContain(leak)
    }
    // The self-identifying opener is gone; the substance survived.
    expect(call.prompt).not.toContain('I should say this up front')
  }
  expect(votes.some((call) => call.prompt.includes(MARKERS.haiku))).toBe(true)

  /* --- 3. The leaderboard resolved labels back to the right seat ---- */
  const voting = page.locator('section[aria-label="Voting"]').first()
  await expect(voting).toBeVisible()
  const winnerCard = voting
    .locator('header', { has: page.getByLabel('Top peer-rated answer') })
    .first()
  await expect(winnerCard).toContainText('Claude Sonnet 5')
  await expect(winnerCard).toContainText('5.0')

  /* --- 4. The Judge saw the peer signal and its verdict rendered ---- */
  const judgeCalls = mock.of('judge')
  expect(judgeCalls).toHaveLength(1)
  expect(judgeCalls[0]?.prompt).toContain('Sharpest of the three.')
  await expect(judge).toContainText('Migrate only the seams that hurt')

  /* --- 5. All of it persisted ------------------------------------- */
  await page.goto(`/council/${councilId}`)
  await expect(page.getByText(MARKERS.sonnet)).toBeVisible()
  await expect(
    page.locator('section[aria-label="Judge"]'),
  ).toContainText('Migrate only the seams that hurt')
  await expect(
    page
      .locator('section[aria-label="Voting"]')
      .first()
      .locator('header', { has: page.getByLabel('Top peer-rated answer') })
      .first(),
  ).toContainText('Claude Sonnet 5')

  // A rehydrate reads IndexedDB; it must not re-run the council.
  expect(mock.of('participant')).toHaveLength(3)
  expect(mock.of('vote')).toHaveLength(3)
})
