/**
 * The paused state — what a council looks like after the browser took the
 * page away mid-run (iOS suspending a locked phone, a discarded tab).
 *
 * The whole design intent is visual, which is why it earns baselines: the
 * turn must read as *waiting*, not broken. Everything the run finished
 * stays rendered above, and the interruption itself is a quiet neutral
 * card with one action — deliberately not the red notification vocabulary
 * the app reserves for real problems. A regression here would most likely
 * be a styling one (the card creeping toward an error look, or the
 * finished work disappearing behind it), which pixels catch and assertions
 * don't.
 *
 * **Seeded through IndexedDB, not the import path.** `runState` describes
 * a run *this device* had in flight, so `toBundleCouncil` strips it and the
 * import schema drops it — by design (a bundle must never land on another
 * machine offering to resume work it never started). The council itself
 * still arrives through the app's own validated restore; only the run
 * state is written directly afterwards.
 */

import { expect, test, type Page } from '@playwright/test'
import { SEEDED_STATE, gotoCouncil } from './helpers'

test.use({ storageState: SEEDED_STATE })

const COUNCIL_IDS = {
  answers: 'vp-parallel-paused',
  debate: 'vp-consensus-paused',
} as const

const T0 = Date.UTC(2026, 5, 30, 12, 0, 0)

/** Old enough to render a stable "4 minutes ago": the label floors to whole
 *  minutes, so any render within 30s of seeding lands on the same string. */
const PAUSED_AGO_MS = 4.5 * 60_000

function seat(id: string, modelId: string) {
  return { id, modelId, config: {} }
}

function councilSeats(prefix: string) {
  return [
    seat(`${prefix}-s1`, 'anthropic:claude-sonnet-5'),
    seat(`${prefix}-s2`, 'openai:gpt-5.4'),
    seat(`${prefix}-s3`, 'google:gemini-3.5-flash'),
  ]
}

const ANSWER_TEXT = [
  'Stage it behind a flag and ramp by cohort — the rollback path stays one toggle wide the whole way.',
  'Dual-run reads for a week before any write cuts over; the diff is the only honest signal you were right.',
]

function buildPausedBundle() {
  const answerSeats = councilSeats('vp-p')
  const debateSeats = councilSeats('vp-c')
  return {
    version: 1 as const,
    exportedAt: T0,
    councils: [
      {
        // Two of three seats answered; the third's transport died, so its
        // slot is simply absent — an interruption leaves no errored event.
        id: COUNCIL_IDS.answers,
        title: 'Billing migration',
        createdAt: T0,
        socialStructure: 'roundtable' as const,
        seats: answerSeats,
        turns: [
          {
            id: 'vp-turn-p1',
            idx: 0,
            userMsg:
              'Should we migrate the billing service this quarter, or wait until the new pricing tiers ship?',
            events: answerSeats.slice(0, 2).map((s, i) => ({
              id: `vp-ev-p${i + 1}`,
              roleType: 'participant' as const,
              seatId: s.id,
              modelId: s.modelId,
              output: ANSWER_TEXT[i] ?? '',
              ts: T0,
              tokens: { input: 512, output: 88 },
            })),
            tokenTotal: { inputTokens: 1024, outputTokens: 176 },
          },
        ],
        tokenTotal: { inputTokens: 1024, outputTokens: 176 },
      },
      {
        // Cut off between rounds: round 1's assessment is banked, round 2's
        // re-answers never landed.
        id: COUNCIL_IDS.debate,
        title: 'Hiring bar for staff engineers',
        createdAt: T0 + 60_000,
        socialStructure: 'consensus' as const,
        seats: debateSeats,
        mediator: { modelId: 'anthropic:claude-opus-4-8', config: {} },
        turns: [
          {
            id: 'vp-turn-c1',
            idx: 0,
            userMsg:
              'Do we hold the staff-engineer bar where it is, or lower it and invest in ramp-up instead?',
            votingLabels: {
              A: 'vp-c-s1',
              B: 'vp-c-s2',
              C: 'vp-c-s3',
            },
            events: [
              ...debateSeats.map((s, i) => ({
                id: `vp-ev-c${i + 1}`,
                roleType: 'participant' as const,
                seatId: s.id,
                modelId: s.modelId,
                output:
                  ANSWER_TEXT[i % ANSWER_TEXT.length] ??
                  'Hold the bar; ramp-up cost is chronically underestimated.',
                ts: T0,
                tokens: { input: 480, output: 76 },
              })),
              {
                id: 'vp-ev-c-med1',
                roleType: 'mediator' as const,
                modelId: 'anthropic:claude-opus-4-8',
                output:
                  'The council splits on whether ramp-up investment is a substitute for the bar or a complement to it.',
                ts: T0 + 30_000,
                round: 1,
                mediator: {
                  round: 1,
                  convergent: false,
                  divergencePoints:
                    'Whether ramp-up capacity can be assumed to exist at all.',
                },
                tokens: { input: 900, output: 120 },
              },
            ],
            tokenTotal: { inputTokens: 2340, outputTokens: 348 },
          },
        ],
        tokenTotal: { inputTokens: 2340, outputTokens: 348 },
      },
    ],
  }
}

/**
 * Stamp run state onto an already-imported turn, straight through
 * IndexedDB — the one piece of this fixture the validated import path
 * intentionally refuses to carry.
 */
async function markPaused(
  page: Page,
  turnId: string,
  runState: Record<string, unknown>,
): Promise<void> {
  await page.evaluate(
    async ({ turnId, runState, agoMs }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('yesbrainer')
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('turns', 'readwrite')
        const store = tx.objectStore('turns')
        const get = store.get(turnId)
        get.onsuccess = () => {
          const row: unknown = get.result
          if (!row || typeof row !== 'object') {
            reject(new Error(`no turn row for ${turnId}`))
            return
          }
          store.put({
            ...row,
            runState: {
              ...runState,
              startedAt: Date.now() - agoMs,
              heartbeatAt: Date.now() - agoMs,
            },
          })
        }
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
      db.close()
    },
    { turnId, runState, agoMs: PAUSED_AGO_MS },
  )
}

/** The localStorage hint the sidebar's paused dot reads. */
async function markHint(
  page: Page,
  councilId: string,
  turnId: string,
): Promise<void> {
  await page.evaluate(
    ({ councilId, turnId }) => {
      localStorage.setItem(
        'yesbrainer:unfinished-runs',
        JSON.stringify({ [councilId]: turnId }),
      )
    },
    { councilId, turnId },
  )
}

async function importPausedBundle(page: Page): Promise<void> {
  const bundle = buildPausedBundle()
  await page.goto('/settings/storage')
  await page.locator('input[type="file"]').setInputFiles({
    name: 'paused-fixtures.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(bundle)),
  })
  const report = page.getByText(/Imported/)
  await expect(report).toBeVisible()
  await expect(report).toContainText(`Imported ${bundle.councils.length}`)
  await expect(report).toContainText('0 errors')
}

test.beforeEach(async ({ page }) => {
  await importPausedBundle(page)
  await markPaused(page, 'vp-turn-p1', {
    status: 'interrupted',
    phase: 'answers',
    activeSeatIds: ['vp-p-s1', 'vp-p-s2', 'vp-p-s3'],
    cause: 'backgrounded',
    // Already past the auto-resume cap, so the card sits still for the
    // camera instead of resuming itself out of frame.
    resumeAttempts: 9,
  })
  await markPaused(page, 'vp-turn-c1', {
    status: 'interrupted',
    phase: 'mediating',
    round: 2,
    maxRounds: 3,
    activeSeatIds: ['vp-c-s1', 'vp-c-s2', 'vp-c-s3'],
    cause: 'connection',
    resumeAttempts: 9,
  })
})

test('a paused answer round keeps the answers that landed', async ({
  page,
}) => {
  await gotoCouncil(page, COUNCIL_IDS.answers)
  await expect(
    page.getByText(/Paused when the app went to the background/),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible()
  // The finished work is what stops this reading as a crash.
  await expect(page.getByText(ANSWER_TEXT[0] ?? '')).toBeVisible()
  await expect(page).toHaveScreenshot('paused-answers.png')
})

test('a paused debate names the round it stopped at', async ({ page }) => {
  await gotoCouncil(page, COUNCIL_IDS.debate)
  await expect(
    page.getByText(/Paused when the connection dropped at round 2 of 3/),
  ).toBeVisible()
  // Round 1's synthesis survives the interruption and stays on screen.
  await expect(page.getByText(/The council splits on whether/)).toBeVisible()
  await expect(page).toHaveScreenshot('paused-debate.png')
})

test('the sidebar marks a council whose run never finished', async ({
  page,
  isMobile,
}) => {
  await markHint(page, COUNCIL_IDS.answers, 'vp-turn-p1')
  // Viewing a *different* council on purpose: the dot's whole job is to
  // report an interruption that happened while the user was elsewhere.
  await gotoCouncil(page, COUNCIL_IDS.debate)
  // On phones the council list lives in a drawer behind the hamburger.
  if (isMobile) {
    await page.getByRole('button', { name: 'Open sidebar' }).click()
  }
  await expect(page.getByLabel('Paused run')).toHaveCount(1)
  await expect(page).toHaveScreenshot('paused-sidebar.png')
})
