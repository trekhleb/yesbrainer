/**
 * Recovering one failed seat without re-running the council.
 *
 * Partial failure is the normal case in a multi-provider fan-out: one
 * provider rate-limits, the others are fine. The design answer is a
 * per-seat retry that replaces the errored event in place — so what's
 * being checked here is the *scoping*. A retry that quietly re-ran every
 * seat would look identical on screen while charging the user's key three
 * times over, which is why the assertion is on the calls, not the pixels.
 */

import { expect, test } from '@playwright/test'
import { httpError, installAnthropicMock } from './mock-anthropic'
import {
  SEAT_MODELS,
  ask,
  emptyCouncil,
  importCouncil,
  seedReadyProfile,
} from './helpers'

const QUESTION = 'How should we stage the rollout?'
const GOOD = 'Ship behind a flag, ramp by cohort.'
const RECOVERED = 'Recovered: ramp by cohort, and watch the error budget.'

test('a failed seat retries on its own without re-running the others', async ({
  page,
}) => {
  await seedReadyProfile(page)
  let haikuAttempts = 0
  const mock = await installAnthropicMock(page, {
    participant: (call) => {
      if (call.model !== SEAT_MODELS.haiku.wire) return GOOD
      haikuAttempts += 1
      // A 400: deliberately *not* a 429. The AI SDK retries rate limits
      // and 5xx internally, so those never reach the seat as an error
      // unless they persist across its whole retry budget — a transient
      // 429 simply resolves itself and no affordance ever appears. Only a
      // non-retryable status produces the failed-seat state this covers.
      return haikuAttempts === 1
        ? httpError(400, {
            type: 'error',
            error: { type: 'invalid_request_error', message: 'bad request' },
          })
        : RECOVERED
    },
    title: () => ({ title: 'Rollout Staging' }),
  })

  const councilId = await importCouncil(
    page,
    emptyCouncil('it-retry', 'roundtable', 'Retry council'),
  )
  await ask(page, QUESTION)

  /* Two seats answered; the third surfaced its failure with a retry. */
  const retry = page.getByRole('button', { name: 'Retry' })
  await expect(retry).toHaveCount(1, { timeout: 30_000 })
  await expect(page.getByText(GOOD).first()).toBeVisible()
  expect(mock.of('participant')).toHaveLength(3)

  /* Retry that one seat. */
  await retry.click()
  await expect(page.getByText(RECOVERED).first()).toBeVisible({
    timeout: 30_000,
  })

  /* Exactly one extra call, and it was the failed seat's. */
  const calls = mock.of('participant')
  expect(calls).toHaveLength(4)
  expect(calls[3]?.model).toBe(SEAT_MODELS.haiku.wire)
  expect(haikuAttempts).toBe(2)

  /* The error was replaced, not appended — no retry affordance left. */
  await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0)

  /* And the repaired turn is what persisted. */
  await page.goto(`/council/${councilId}`)
  await expect(page.getByText(RECOVERED).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0)
  expect(mock.of('participant')).toHaveLength(4)
})
