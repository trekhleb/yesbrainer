/**
 * Surviving the browser taking the page away mid-run.
 *
 * This is the failure the app exists to absorb: iOS suspends a locked
 * phone within seconds, and every in-flight provider stream loses its
 * transport at once. Nothing about the council failed, so the two things
 * worth proving here are that **the work already paid for is still there**
 * and that **resuming buys only what the interruption actually took away**
 * — a resume that quietly re-ran finished seats would look identical on
 * screen while billing the user's key twice, which is why the assertions
 * are on the recorded provider calls, not just the pixels.
 *
 * `dropConnection()` rather than an HTTP status on purpose: a status means
 * the provider answered and the app should show a failure; an aborted
 * transport means the call never landed, and only that produces the paused
 * state under test. Running against the built bundle (see the config
 * header) means the real AI SDK, real `fetch` and real IndexedDB all
 * participate in the round trip.
 */

import { expect, test, type Page } from '@playwright/test'
import { dropConnection, installAnthropicMock } from './mock-anthropic'
import {
  SEAT_MODELS,
  ask,
  councilPath,
  emptyCouncil,
  importCouncil,
  seedReadyProfile,
} from './helpers'

const QUESTION = 'Should we migrate the billing service this quarter?'
const LANDED = 'Migrate incrementally, starting with read paths.'
const RESUMED = 'Resumed: cut over writes only after a week of dual-run.'

test('an interrupted seat leaves the turn paused, keeping every answer that landed', async ({
  page,
}) => {
  await seedReadyProfile(page)
  const mock = await installAnthropicMock(page, {
    // One seat's transport dies; the others answer normally.
    participant: (call) =>
      call.model === SEAT_MODELS.haiku.wire ? dropConnection() : LANDED,
    title: () => ({ title: 'Billing Migration' }),
  })

  await importCouncil(
    page,
    emptyCouncil('it-paused', 'roundtable', 'Paused council'),
  )
  await ask(page, QUESTION)

  // The paused card explains the state in the app's own words — and
  // crucially is *not* an error surface.
  await expect(page.getByText(/Paused when/)).toBeVisible({ timeout: 30_000 })
  await expect(
    page.getByText(/only runs while the app is open/),
  ).toBeVisible()

  // The answers that did land are on screen, not thrown away with the run.
  await expect(page.getByText(LANDED).first()).toBeVisible()
  expect(mock.of('participant')).toHaveLength(3)

  // The question survived too — it was written before the first provider
  // call, so even a hard kill during the opening fan-out keeps it.
  await expect(page.getByText(QUESTION)).toBeVisible()
})

test('resuming re-issues only the seat that never answered', async ({
  page,
}) => {
  await seedReadyProfile(page)
  let haikuAttempts = 0
  const mock = await installAnthropicMock(page, {
    participant: (call) => {
      if (call.model !== SEAT_MODELS.haiku.wire) return LANDED
      haikuAttempts += 1
      return haikuAttempts === 1 ? dropConnection() : RESUMED
    },
    title: () => ({ title: 'Billing Migration' }),
  })

  await importCouncil(
    page,
    emptyCouncil('it-resume', 'roundtable', 'Resume council'),
  )
  await ask(page, QUESTION)

  const resume = page.getByRole('button', { name: 'Resume' })
  await expect(resume).toBeVisible({ timeout: 30_000 })
  await resume.click()

  await expect(page.getByText(RESUMED)).toBeVisible({ timeout: 30_000 })
  // The card is gone: the turn finished, so it carries no run state.
  await expect(page.getByText(/Paused when/)).toHaveCount(0)

  // Four participant calls total — three on the first attempt, and exactly
  // one on the resume. The two seats that already answered are replayed
  // from the turn, never re-bought.
  expect(mock.of('participant')).toHaveLength(4)
  expect(haikuAttempts).toBe(2)
  await expect(page.getByText(LANDED).first()).toBeVisible()
})

test('a resumed Consensus debate replays finished rounds instead of re-running them', async ({
  page,
}) => {
  await seedReadyProfile(page)
  let mediatorRounds = 0
  let reanswers = 0
  const mock = await installAnthropicMock(page, {
    participant: () => LANDED,
    // The round-2 re-answers die on their first attempt, stranding the
    // debate *after* round 1's assessment is already banked.
    reanswer: () => {
      reanswers += 1
      return reanswers <= 3
        ? dropConnection()
        : 'Reconsidered in light of the divergence.'
    },
    mediator: () => {
      mediatorRounds += 1
      // Round 1 diverges (so a re-answer round follows), round 2 converges.
      return mediatorRounds === 1
        ? {
            synthesis: 'Positions differ on sequencing.',
            convergent: false,
            divergencePoints: 'Whether writes cut over first.',
          }
        : { synthesis: 'Agreed: read paths first.', convergent: true }
    },
    title: () => ({ title: 'Billing Migration' }),
  })

  await importCouncil(
    page,
    emptyCouncil('it-consensus-resume', 'consensus', 'Debate council'),
  )
  await ask(page, QUESTION)

  // Paused mid-debate, with round 1's synthesis kept.
  const resume = page.getByRole('button', { name: 'Resume' })
  await expect(resume).toBeVisible({ timeout: 40_000 })
  await expect(page.getByText('Positions differ on sequencing.')).toBeVisible()
  expect(mock.of('mediator')).toHaveLength(1)

  await resume.click()
  await expect(page.getByText('Agreed: read paths first.')).toBeVisible({
    timeout: 40_000,
  })
  await expect(page.getByText(/Paused when/)).toHaveCount(0)

  // The heart of it: round 1's assessment was replayed from the turn, not
  // bought again. Two mediator calls total across both attempts — round 1
  // once, round 2 once — and the round-1 answers were never re-streamed.
  expect(mock.of('mediator')).toHaveLength(2)
  expect(mock.of('participant')).toHaveLength(3)
})

test('navigating away mid-resume and back reports the run instead of a dead Resume button', async ({
  page,
}) => {
  // The exact reported flow: "Resume works, but if I click to another
  // council and back, Resume does nothing until I refresh."
  //
  // Runs outlive their view and the app remounts CouncilView per council,
  // so coming back gives this council a fresh hook with no phase state
  // while the earlier run carries on — still holding the turn's lock. The
  // fix is that the view now consults the run registry, so it reports the
  // run rather than offering a Resume that could only bail out silently.
  await seedReadyProfile(page)
  let release: (() => void) | undefined
  const held = new Promise<string>((resolve) => {
    release = () => resolve(RESUMED)
  })
  let haikuAttempts = 0
  await installAnthropicMock(page, {
    participant: (call) => {
      if (call.model !== SEAT_MODELS.haiku.wire) return LANDED
      haikuAttempts += 1
      if (haikuAttempts === 1) return dropConnection()
      // The resume's call is held open, so the run is still in flight while
      // the user navigates.
      return held
    },
    title: () => ({ title: 'Billing Migration' }),
  })

  await importCouncil(
    page,
    emptyCouncil('it-nav-a', 'roundtable', 'Interrupted council'),
  )
  await importCouncil(
    page,
    emptyCouncil('it-nav-b', 'roundtable', 'Somewhere else'),
  )

  await page.goto(councilPath('it-nav-a'))
  await ask(page, QUESTION)
  const resume = page.getByRole('button', { name: 'Resume' })
  await expect(resume).toBeVisible({ timeout: 30_000 })
  await resume.click()

  // Leave mid-resume and come back — by *clicking the sidebar*, which is
  // client-side routing. A `page.goto` here would be a full reload, i.e.
  // the very thing that used to "fix" the bug: it kills the background run.
  await page.getByRole('link', { name: 'Somewhere else' }).click()
  await expect(page.getByRole('link', { name: 'Somewhere else' })).toBeVisible()
  await page.getByRole('link', { name: 'Interrupted council' }).click()

  // The card reports the run that is still going, and offers no button —
  // before the fix this showed a Resume that silently did nothing.
  await expect(page.getByText(/Picking up where it stopped/)).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.getByRole('button', { name: 'Resume' })).toHaveCount(0)

  release?.()
})

test('resuming keeps your place in the thread instead of jumping to the question', async ({
  page,
}) => {
  /**
   * Pin-to-top is for a question you just asked. A resume is not that: you
   * are at the bottom looking at the paused card you just clicked, and the
   * pin would throw you to the top of a turn that can be a whole debate
   * long. Measured, because the symptom is a scroll offset and nothing
   * else on screen changes: without the fix this lands at 0.
   */
  await seedReadyProfile(page)
  // Long enough that the thread genuinely scrolls; otherwise there is no
  // position to preserve and the test would pass vacuously.
  const LONG = `${LANDED} `.repeat(60)
  await installAnthropicMock(page, {
    participant: () => LONG,
    reanswer: () => dropConnection(),
    mediator: () => ({
      synthesis: 'Positions differ on sequencing.',
      convergent: false,
      divergencePoints: 'Whether writes cut over first.',
    }),
    title: () => ({ title: 'Billing Migration' }),
  })

  await importCouncil(
    page,
    emptyCouncil('it-scroll', 'consensus', 'Scroll council'),
  )
  await ask(page, QUESTION)
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible({
    timeout: 40_000,
  })

  // Spend the auto-resume budget, then reload — the state the report
  // describes, and the one where a Resume button is actually on screen
  // (a fresh load with attempts left resumes on its own).
  await exhaustAutoResume(page)
  await page.goto(councilPath('it-scroll'))

  const resume = page.getByRole('button', { name: 'Resume' })
  await expect(resume).toBeVisible({ timeout: 40_000 })
  // A stable handle: the button vanishes the moment the run starts, so a
  // locator filtered by it would go stale exactly when it is needed.
  const thread = page.getByRole('region', { name: 'Council thread' })
  await page.waitForTimeout(900) // let the open-landing settle window close
  const before = await thread.evaluate((el) => el.scrollTop)
  expect(before).toBeGreaterThan(0)

  await resume.click()
  await page.waitForTimeout(1_500) // the pin, if it fired, is a smooth scroll
  const after = await thread.evaluate((el) => el.scrollTop)

  expect(after).toBe(before)
})

/** Push the turn past `MAX_AUTO_RESUME_ATTEMPTS` so it waits for a click
 *  instead of resuming itself. Written straight to IndexedDB: it is device
 *  state the import path deliberately refuses to carry. */
async function exhaustAutoResume(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('yesbrainer')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('turns', 'readwrite')
      tx.objectStore('turns').openCursor().onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
        if (!cursor) return
        const row = cursor.value as { runState?: Record<string, unknown> }
        if (row.runState) {
          row.runState.resumeAttempts = 9
          cursor.update(row)
        }
        cursor.continue()
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  })
}
