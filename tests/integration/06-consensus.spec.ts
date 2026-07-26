/**
 * The Consensus debate — the app's most expensive mode and its most
 * stateful one: a real loop whose length depends on what the Mediator
 * says, driving roughly `participants × rounds` provider calls.
 *
 * Two endings, and both matter for different reasons:
 *
 *  - **Converged.** The Mediator declares agreement on round 2 and writes
 *    the final summary. This is the happy path users see most.
 *  - **Round cap.** The Mediator never converges and the loop must stop
 *    anyway, surfacing the remaining conflicts rather than manufacturing
 *    agreement. "No fake harmony" is a product promise (README), and a
 *    loop that failed to terminate would be the worst failure in the app —
 *    unbounded spend against the user's own key.
 *
 * The Mediator is scripted by round, so the loop's shape is asserted
 * rather than assumed: exactly one Mediator call per round, one re-answer
 * per seat per round after the first, and nothing after the ending.
 */

import { expect, test } from '@playwright/test'
import { installAnthropicMock, type RecordedCall } from './mock-anthropic'
import {
  SEAT_MODELS,
  ask,
  emptyCouncil,
  importCouncil,
  seedReadyProfile,
} from './helpers'

const QUESTION = 'Is a four-day week workable for a support team?'

/** `divergencePoints` must survive into the next round's re-answer prompt —
 *  that hand-off is the mechanism the whole mode rests on. */
const DIVERGENCE = 'Whether Friday coverage can be automated at all.'

function digest(labels: string[]) {
  return {
    summary: 'Positions moved toward staggered coverage.',
    movements: labels.map((label) => ({
      label,
      stance: 'shifted' as const,
      note: 'Softened on the coverage question.',
    })),
  }
}

/** Labels the Mediator was shown this round. */
function labelsOf(call: RecordedCall): string[] {
  return call.labels
}

test('a Consensus council debates and converges on round two', async ({
  page,
}) => {
  await seedReadyProfile(page)
  let mediatorRound = 0
  const mock = await installAnthropicMock(page, {
    participant: () => 'Round one: coverage is the open question.',
    reanswer: (call) => {
      // The Mediator's divergence points must have reached the debaters.
      expect(call.prompt).toContain(DIVERGENCE)
      return 'Round two: staggered coverage resolves it.'
    },
    mediator: (call) => {
      mediatorRound += 1
      if (mediatorRound === 1) {
        return {
          synthesis: 'The council is split on Friday coverage.',
          convergent: false,
          divergencePoints: DIVERGENCE,
          roundDigest: digest(labelsOf(call)),
        }
      }
      return {
        synthesis: 'A four-day week works with staggered Friday coverage.',
        convergent: true,
        roundDigest: digest(labelsOf(call)),
      }
    },
    title: () => ({ title: 'Four Day Week Coverage' }),
  })

  const councilId = await importCouncil(
    page,
    emptyCouncil('it-consensus', 'consensus', 'Consensus council'),
  )
  await ask(page, QUESTION)

  /* The final summary is the loop's terminal state. */
  await expect(
    page.getByText('A four-day week works with staggered Friday coverage.'),
  ).toBeVisible({ timeout: 30_000 })

  /* Shape of the debate: one answer round, one re-answer round, two
     Mediator rounds — and it stopped there because round 2 converged. */
  expect(mock.of('participant')).toHaveLength(3)
  expect(mock.of('reanswer')).toHaveLength(3)
  expect(mock.of('mediator')).toHaveLength(2)

  /* Every seat debated in both rounds. */
  expect(mock.of('reanswer').map((call) => call.model).sort()).toEqual(
    [
      SEAT_MODELS.fable.wire,
      SEAT_MODELS.haiku.wire,
      SEAT_MODELS.sonnet.wire,
    ].sort(),
  )

  /* The Mediator saw everyone, anonymized, in both rounds. */
  for (const call of mock.of('mediator')) {
    expect(call.labels).toHaveLength(3)
    for (const leak of ['Claude', 'Sonnet', 'Fable', 'Haiku', 'Anthropic']) {
      expect(call.prompt).not.toContain(leak)
    }
  }

  /* Persisted, and a rehydrate doesn't re-debate. */
  await page.goto(`/council/${councilId}`)
  await expect(
    page.getByText('A four-day week works with staggered Friday coverage.'),
  ).toBeVisible()
  await expect(
    page.locator('section[aria-label="Mediator"]').first(),
  ).toBeVisible()
  await expect(
    page.locator('section[aria-label="Reconsider"]').first(),
  ).toBeVisible()
  expect(mock.of('mediator')).toHaveLength(2)
})

test('a Consensus council that never agrees stops at the round cap', async ({
  page,
}) => {
  await seedReadyProfile(page)
  let mediatorRound = 0
  const mock = await installAnthropicMock(page, {
    participant: () => 'Round one: we disagree about coverage.',
    reanswer: () => 'Still unconvinced; holding the position.',
    // Never converges — the cap is the only thing that can end this. The
    // round number rides in the synthesis so the *last* one is
    // distinguishable; otherwise every round renders identical text and
    // the assertions below could pass while the loop was still running.
    mediator: (call) => {
      mediatorRound += 1
      return {
        synthesis: `Round ${mediatorRound}: the council remains split.`,
        convergent: false,
        divergencePoints: DIVERGENCE,
        roundDigest: {
          summary: 'No movement this round.',
          movements: call.labels.map((label) => ({
            label,
            stance: 'held' as const,
            note: 'Position unchanged.',
          })),
        },
      }
    },
    title: () => ({ title: 'Deadlocked Coverage Debate' }),
  })

  await importCouncil(
    page,
    emptyCouncil('it-cap', 'consensus', 'Round-cap council'),
  )
  await ask(page, QUESTION)

  /* Waiting on the *third* round's text is what proves the loop ran to the
     cap rather than the assertions racing an unfinished debate. */
  await expect(
    page.getByText('Round 3: the council remains split.').first(),
  ).toBeVisible({ timeout: 30_000 })

  /* The loop terminated on its own. Three rounds is the default cap, so
     round 1 answers + two re-answer rounds + three Mediator calls — and
     crucially nothing beyond that, since the Mediator would have kept
     saying "not converged" forever. */
  expect(mock.of('mediator')).toHaveLength(3)
  expect(mock.of('participant')).toHaveLength(3)
  expect(mock.of('reanswer')).toHaveLength(6)

  /* The remaining disagreement is surfaced, not smoothed over. */
  await expect(page.getByText(DIVERGENCE).first()).toBeVisible()
})
