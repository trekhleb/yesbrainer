/**
 * Secret redaction on the error path.
 *
 * Provider SDKs serialize the failing request when a call goes wrong —
 * auth header included. That string then travels further than people
 * expect: into the turn event persisted in IndexedDB, into the JSON export
 * a user might attach to a bug report, into the rendered error, and into
 * the console someone is asked to paste. `extractErrorMessage` and
 * `logRedactedError` exist to scrub it at every one of those exits.
 *
 * The unit suite tests `redactSecrets` on strings. What it can't test is
 * whether a *real* AI SDK error object, produced by a real 401 from a real
 * adapter, still routes through those functions — which is exactly the
 * arrangement that regresses when an error path is added.
 *
 * So the mock answers with a 401 whose body echoes the key back, the way a
 * provider plausibly might, and we check every exit.
 */

import { expect, test } from '@playwright/test'
import { httpError, installAnthropicMock } from './mock-anthropic'
import {
  FAKE_ANTHROPIC_KEY,
  ask,
  emptyCouncil,
  importCouncil,
  seedReadyProfile,
} from './helpers'

test('a provider error that echoes the key never surfaces it', async ({
  page,
}) => {
  const consoleOutput: string[] = []
  page.on('console', (message) => consoleOutput.push(message.text()))

  await seedReadyProfile(page)
  await installAnthropicMock(page, {
    // A hostile-but-plausible envelope: the provider quotes the offending
    // credential straight back at us.
    participant: (call) =>
      httpError(401, {
        type: 'error',
        error: {
          type: 'authentication_error',
          message:
            `invalid x-api-key: ${call.headers['x-api-key']} — check your ` +
            `credentials`,
        },
      }),
    title: () => ({ title: 'Redaction Check' }),
  })

  const councilId = await importCouncil(
    page,
    emptyCouncil('it-redaction', 'roundtable', 'Redaction council'),
  )
  await ask(page, 'What happens when the key is rejected?')

  /* The failure surfaces to the user — redacted. */
  const body = page.locator('body')
  await expect(body).toContainText('[redacted]', { timeout: 30_000 })
  await expect(body).not.toContainText(FAKE_ANTHROPIC_KEY)

  /* It survived a reload as a persisted event, still redacted — this is
     the copy that would ride out inside a JSON export. */
  await page.goto(`/council/${councilId}`)
  await expect(body).toContainText('[redacted]')
  await expect(body).not.toContainText(FAKE_ANTHROPIC_KEY)

  /* And the console — the leak channel persisted-path redaction misses,
     because "paste what the console says" is a standard bug-report ask. */
  const leaked = consoleOutput.filter((line) =>
    line.includes(FAKE_ANTHROPIC_KEY),
  )
  expect(leaked).toEqual([])
})
