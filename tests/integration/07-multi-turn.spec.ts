/**
 * Multi-turn context — "a council is a conversation", not a series of
 * unrelated one-shots.
 *
 * The property under test is what the *second* turn actually puts on the
 * wire: each seat must receive its own prior answer and the earlier
 * exchange as chat history, or follow-ups silently lose the thread while
 * the UI still looks right. Only an integration test can see this — the
 * unit suite mocks the runner that builds the history, and the visual
 * suite never sends anything.
 */

import { expect, test } from '@playwright/test'
import { installAnthropicMock } from './mock-anthropic'
import {
  SEAT_MODELS,
  ask,
  emptyCouncil,
  importCouncil,
  seedReadyProfile,
} from './helpers'

const Q1 = 'Which database should we start with?'
const Q2 = 'What changes if we expect ten times the traffic?'
const A1 = 'Start with Postgres; it will carry you further than you think.'
const A2 = 'At ten times the traffic, add read replicas before sharding.'

test('a follow-up turn carries the earlier exchange to every seat', async ({
  page,
}) => {
  await seedReadyProfile(page)
  const mock = await installAnthropicMock(page, {
    participant: (call) => (call.prompt.includes(Q2) ? A2 : A1),
    title: () => ({ title: 'Database Choice' }),
  })

  const councilId = await importCouncil(
    page,
    emptyCouncil('it-multiturn', 'roundtable', 'Multi-turn council'),
  )

  /* Turn one. */
  await ask(page, Q1)
  await expect(page.getByText(A1).first()).toBeVisible({ timeout: 30_000 })
  expect(mock.of('participant')).toHaveLength(3)

  /* Turn two. */
  await ask(page, Q2)
  await expect(page.getByText(A2).first()).toBeVisible({ timeout: 30_000 })

  const secondTurnCalls = mock.of('participant').slice(3)
  expect(secondTurnCalls).toHaveLength(3)

  /* Each seat saw the whole conversation, not just the new question. */
  for (const call of secondTurnCalls) {
    expect(call.prompt).toContain(Q1)
    expect(call.prompt).toContain(A1)
    expect(call.prompt).toContain(Q2)
  }

  /* Every seat took part in both turns. */
  expect(secondTurnCalls.map((call) => call.model).sort()).toEqual(
    [
      SEAT_MODELS.fable.wire,
      SEAT_MODELS.haiku.wire,
      SEAT_MODELS.sonnet.wire,
    ].sort(),
  )

  /* The titler runs once for the council, not once per turn. */
  expect(mock.of('title')).toHaveLength(1)

  /* Both turns survive a reload, in order. */
  await page.goto(`/council/${councilId}`)
  await expect(page.getByText(A1).first()).toBeVisible()
  await expect(page.getByText(A2).first()).toBeVisible()
  expect(mock.of('participant')).toHaveLength(6)
})
