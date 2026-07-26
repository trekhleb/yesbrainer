/**
 * The activation path — every new user's first five minutes, end to end on
 * a pristine profile: the no-usable-model gate, pasting a key, creating a
 * council, asking a question, and finding the answer still there after a
 * reload.
 *
 * This is the flow with the widest blast radius (break it and nobody
 * reaches the product at all) and the one no other suite performs: the
 * unit tests mock `runParticipantStream` outright, and the visual suite
 * only ever photographs councils it seeded as already-finished.
 *
 * Demo councils are deliberately NOT suppressed here — first run seeds
 * them, and the onboarding gate is supposed to show anyway (demos aren't
 * "real" councils for the landing rule). Leaving them in keeps this test
 * honest about what a new visitor actually sees.
 */

import { expect, test } from '@playwright/test'
import { installAnthropicMock } from './mock-anthropic'
import {
  FAKE_ANTHROPIC_KEY,
  ask,
  composerInput,
  seedRandom,
} from './helpers'

const QUESTION = 'What should I see in Rome in three days?'
const ANSWER =
  'Three days in Rome: the Forum and Palatine on day one, the Vatican ' +
  'Museums early on day two, and Trastevere for the third.'

test('a new visitor goes from no key to a persisted answer', async ({
  page,
}) => {
  await seedRandom(page)
  const mock = await installAnthropicMock(page, {
    participant: () => ANSWER,
    // Fires on the first turn of any council; the chain resolves to
    // Haiku here because it's the only reachable rung.
    title: () => ({ title: 'Three Days In Rome' }),
  })

  /* 1. A profile with no keys lands on the capability gate. */
  await page.goto('/')
  const addKeys = page.getByRole('button', { name: 'Add your keys to begin' })
  await expect(addKeys).toBeVisible()

  /* 2. The CTA leads to the Keys panel; paste a key there. */
  await addKeys.click()
  const anthropicField = page.getByPlaceholder('sk-ant-...')
  await expect(anthropicField).toBeVisible()
  await anthropicField.fill(FAKE_ANTHROPIC_KEY)

  /* 3. The gate flips: with a usable model and no councils yet, the
        frontpage offers council creation instead. */
  await page.goto('/')
  const createFirst = page.getByRole('button', {
    name: 'Create your first council',
  })
  await expect(createFirst).toBeVisible()
  await createFirst.click()

  /* 4. Accept the modal's defaults — the roster seeds from the first
        reachable model, which is an Anthropic one because that's the only
        key present. */
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(composerInput(page)).toBeVisible()

  /* 5. Ask. This is the part no other suite reaches: composer submit →
        orchestrator → AI SDK adapter → fetch → SSE → IndexedDB. */
  await ask(page, QUESTION)
  await expect(page.getByText('the Forum and Palatine')).toBeVisible()

  /* The question really did leave the browser, carrying the pasted key. */
  const answered = mock.of('participant')
  expect(answered).toHaveLength(1)
  expect(answered[0]?.prompt).toContain(QUESTION)
  expect(answered[0]?.headers['x-api-key']).toBe(FAKE_ANTHROPIC_KEY)

  /* 6. The event was persisted, not just rendered — a reload rehydrates
        from IndexedDB rather than replaying the run. */
  await page.reload()
  await expect(page.getByText('the Forum and Palatine')).toBeVisible()
  expect(mock.of('participant')).toHaveLength(1)
})
