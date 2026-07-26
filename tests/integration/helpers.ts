/**
 * Shared setup for the integration suite.
 *
 * Unlike the visual suite — which seeds *finished* councils and photographs
 * them — these specs make the app actually run: a real send, through the
 * real provider adapter, over real `fetch`, into real IndexedDB. The only
 * thing replaced is the provider's HTTP response (see `mock-anthropic.ts`).
 *
 * Two determinism controls matter here, both installed before app code
 * runs:
 *
 *  - **Seeded `Math.random`.** `buildVotingLabels` shuffles seat→label
 *    assignment per turn (deliberate: it defeats cross-turn brand
 *    inference). Without a seed, "which seat did Model A turn out to be"
 *    changes every run and no vote assertion is stable.
 *  - **Demo suppression.** A pristine profile seeds the demo councils on
 *    first load; specs that count sidebar rows or land on "the most recent
 *    council" need that off. `freshOnboarding` deliberately leaves it on.
 */

import { expect, type Locator, type Page } from '@playwright/test'

/** A key shaped like the real thing, so redaction assertions are
 *  meaningful — the mock echoes it back in the 401 body that
 *  `logRedactedError` / `extractErrorMessage` must scrub. */
export const FAKE_ANTHROPIC_KEY = 'sk-ant-api03-integration-not-a-real-key'

/**
 * Seats for integration councils, all Anthropic so the suite maintains one
 * wire format, all distinct so `body.model` identifies the caller.
 *
 * Every id here is one `@ai-sdk/anthropic`'s `getModelCapabilities()`
 * recognises, which keeps `generateObject` on the native structured-output
 * path. `anthropic:claude-opus-5` is deliberately NOT used: the adapter
 * doesn't know that id yet and falls back to a forced `json` tool call.
 * The mock handles both shapes, but pinning the path keeps these specs
 * testing the app rather than the adapter's negotiation.
 */
export const SEAT_MODELS = {
  sonnet: { modelId: 'anthropic:claude-sonnet-5', wire: 'claude-sonnet-5' },
  fable: { modelId: 'anthropic:claude-fable-5', wire: 'claude-fable-5' },
  haiku: {
    modelId: 'anthropic:claude-haiku-4-5',
    wire: 'claude-haiku-4-5-20251001',
  },
} as const

/** Put an Anthropic key in localStorage, and only an Anthropic key: a call
 *  that tried to reach any other provider then fails loudly on a missing
 *  key instead of quietly escaping the mock. */
export async function seedKeys(page: Page): Promise<void> {
  await page.addInitScript((key: string) => {
    localStorage.setItem('yesbrainer:keys', JSON.stringify({ anthropic: key }))
  }, FAKE_ANTHROPIC_KEY)
}

/** Replace `Math.random` with a seeded PRNG (mulberry32) so the per-turn
 *  voting-label shuffle is reproducible. */
export async function seedRandom(page: Page, seed = 0x9e3779b9): Promise<void> {
  await page.addInitScript((initial: number) => {
    let state = initial >>> 0
    Math.random = () => {
      state = (state + 0x6d2b79f5) >>> 0
      let t = state
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }, seed)
}

/** Skip the first-load demo seeding. */
export async function suppressDemos(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('yesbrainer:demos-seeded', '1')
  })
}

/** The usual arrangement: keys present, RNG pinned, no demo councils. */
export async function seedReadyProfile(page: Page): Promise<void> {
  await seedKeys(page)
  await seedRandom(page)
  await suppressDemos(page)
}

/* ------------------------------------------------------------------ */
/* Council fixtures                                                    */
/* ------------------------------------------------------------------ */

/* Structural mirrors of the export-bundle shape (src/storage/transfer.ts).
   Same rationale as tests/visual/fixtures/bundle.ts: the tests project
   can't type-import across the `tsc -b` boundary, and the real drift guard
   is runtime — this rides the app's own zod-validated import. */

interface BundleSeat {
  id: string
  modelId: string
  config: Record<string, never>
}

interface BundleCouncil {
  id: string
  title: string | null
  createdAt: number
  socialStructure: 'roundtable' | 'trial' | 'consensus'
  seats: BundleSeat[]
  turns: []
  tokenTotal: { inputTokens: number; outputTokens: number }
  judge?: { modelId: string; config: Record<string, never> }
  mediator?: { modelId: string; config: Record<string, never> }
}

export interface CouncilBundle {
  version: 1
  exportedAt: number
  councils: BundleCouncil[]
}

const T0 = 1_780_000_000_000

/**
 * An empty council of the given structure — no turns, because these specs
 * produce the turns. Seats are the three Anthropic models above; Trial
 * gets a Judge and Consensus a Mediator.
 */
export function emptyCouncil(
  id: string,
  socialStructure: 'roundtable' | 'trial' | 'consensus',
  title: string,
): CouncilBundle {
  const seats: BundleSeat[] = [
    { id: `${id}-s1`, modelId: SEAT_MODELS.sonnet.modelId, config: {} },
    { id: `${id}-s2`, modelId: SEAT_MODELS.fable.modelId, config: {} },
    { id: `${id}-s3`, modelId: SEAT_MODELS.haiku.modelId, config: {} },
  ]
  const council: BundleCouncil = {
    id,
    title,
    createdAt: T0,
    socialStructure,
    seats,
    turns: [],
    tokenTotal: { inputTokens: 0, outputTokens: 0 },
    ...(socialStructure === 'trial'
      ? { judge: { modelId: SEAT_MODELS.sonnet.modelId, config: {} } }
      : {}),
    ...(socialStructure === 'consensus'
      ? { mediator: { modelId: SEAT_MODELS.sonnet.modelId, config: {} } }
      : {}),
  }
  return { version: 1, exportedAt: T0, councils: [council] }
}

/**
 * Load a bundle through Settings → Storage — the app's own zod-validated
 * restore, so a fixture that drifts from the schema fails here.
 *
 * The report is awaited as **attached** rather than visible: the import is
 * async (file read → zod validate → Dexie transaction) and navigating
 * before it settles abandons it, but the notice itself reads as hidden in
 * some environments even on success. Its "0 errors" is the drift guard.
 */
export async function importCouncil(
  page: Page,
  bundle: CouncilBundle,
): Promise<string> {
  const council = bundle.councils[0]
  if (!council) throw new Error('importCouncil: bundle has no councils')
  await page.goto('/settings/storage')
  await page.locator('input[type="file"]').setInputFiles({
    name: 'integration-fixture.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(bundle)),
  })
  const report = page.getByText(/Imported/)
  await report.waitFor({ state: 'attached' })
  await expect(report).toContainText(`Imported ${bundle.councils.length}`)
  await expect(report).toContainText('0 error')

  await page.goto(councilPath(council.id))
  await expect(composerInput(page)).toBeVisible()
  return council.id
}

/** The app's own canonical council path (mirrors `src/hooks/use-app-route.ts`),
 *  so specs address councils exactly as `<Link>` does — including ids that
 *  need percent-encoding. */
export function councilPath(id: string): string {
  return `/council/${encodeURIComponent(id)}`
}

/* ------------------------------------------------------------------ */
/* Driving the app                                                     */
/* ------------------------------------------------------------------ */

export function composerInput(page: Page): Locator {
  return page.getByPlaceholder('Ask your council…')
}

export function sendButton(page: Page): Locator {
  return page.getByRole('button', { name: 'Send' })
}

/** Type a question and send it. */
export async function ask(page: Page, question: string): Promise<void> {
  await composerInput(page).fill(question)
  await sendButton(page).click()
}

/**
 * Every non-app origin the page contacted. The BYOK promise is that a run
 * talks to the chosen provider and nobody else, so specs assert this is
 * exactly `['https://api.anthropic.com']`.
 *
 * Install before navigating.
 */
export function recordExternalOrigins(page: Page): Set<string> {
  const origins = new Set<string>()
  page.on('request', (request) => {
    const origin = new URL(request.url()).origin
    if (!origin.startsWith('http://localhost')) origins.add(origin)
  })
  return origins
}
