/**
 * The BYOK boundary — the app's headline promise, and the one property
 * that fails *silently*. A broken pipeline is obvious the moment someone
 * opens the app; a key reaching an origin it shouldn't looks exactly like
 * a working app.
 *
 * Two halves:
 *
 *  - **Where the key goes.** During a real run, assert the key travelled to
 *    the chosen provider, in a header, and that no other external origin
 *    was contacted at all — not a CDN, not a font host, not telemetry.
 *  - **What the shipped policy says.** The CSP is injected at build only,
 *    so it exists exactly here and nowhere the other suites can see. If
 *    `connect-src` ever lost the provider origin the run above would fail
 *    outright: the renderer blocks the request before `page.route` sees
 *    it, so the mock would never fire.
 */

import { expect, test } from '@playwright/test'
import { installAnthropicMock } from './mock-anthropic'
import {
  FAKE_ANTHROPIC_KEY,
  ask,
  emptyCouncil,
  importCouncil,
  recordExternalOrigins,
  seedReadyProfile,
} from './helpers'

test('a run reaches the chosen provider and nothing else', async ({
  page,
}) => {
  const externalOrigins = recordExternalOrigins(page)
  await seedReadyProfile(page)
  const mock = await installAnthropicMock(page, {
    participant: () => 'Answered.',
    title: () => ({ title: 'Boundary Check' }),
  })

  await importCouncil(
    page,
    emptyCouncil('it-boundary', 'roundtable', 'Boundary council'),
  )
  await ask(page, 'Does the key stay where it should?')
  await expect(page.getByText('Answered.').first()).toBeVisible()

  /* Exactly one external destination: the provider the user picked. */
  expect([...externalOrigins]).toEqual(['https://api.anthropic.com'])

  /* The key rides in Anthropic's auth header — never the URL, never the
     request body, where it could end up in a log or a referrer. */
  for (const call of mock.calls) {
    expect(call.headers['x-api-key']).toBe(FAKE_ANTHROPIC_KEY)
    expect(call.prompt).not.toContain(FAKE_ANTHROPIC_KEY)
    expect(call.system).not.toContain(FAKE_ANTHROPIC_KEY)
  }

  /* Anthropic only permits browser-direct calls with this opt-in header;
     without it every real request 403s while every mock stays green. */
  expect(mock.calls[0]?.headers['anthropic-dangerous-direct-browser-access']).toBe(
    'true',
  )
})

test('the shipped bundle carries a CSP that allows only the providers', async ({
  page,
}) => {
  await page.goto('/')
  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content')

  expect(csp).toBeTruthy()
  const connectSrc = csp
    ?.split(';')
    .map((directive) => directive.trim())
    .find((directive) => directive.startsWith('connect-src'))
  expect(connectSrc).toBeDefined()

  /* Every wired provider origin (src/providers/endpoints.ts) must be
     allowed — the build asserts this too, but only here does a browser
     actually enforce it. */
  for (const origin of [
    'https://api.anthropic.com',
    'https://api.openai.com',
    'https://generativelanguage.googleapis.com',
    'https://api.groq.com',
    'https://openrouter.ai',
    'http://localhost:11434',
  ]) {
    expect(connectSrc).toContain(origin)
  }

  /* And the allowlist stays an allowlist. */
  expect(connectSrc).not.toContain('*')
  expect(csp).toContain("object-src 'none'")
  expect(csp).toContain("base-uri 'self'")
  /* The prompt-injection beacon defence: remote images never load. */
  expect(csp).toContain("img-src 'self' data: blob:")

  /* No inline *executable* scripts: `script-src 'self'` would block them,
     so shipping one means a silently dead code path. The JSON-LD
     structured-data block is excluded on purpose — it's data the browser
     never executes, and `script-src` doesn't govern it. */
  const inlineScripts = await page
    .locator('script:not([src]):not([type="application/ld+json"])')
    .count()
  expect(inlineScripts).toBe(0)
})
