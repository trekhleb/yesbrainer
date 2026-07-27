/**
 * Export → factory reset → re-import.
 *
 * This is the app's *only* recovery story. There's no server, no sync and
 * no reset flow: "if you lose a device you lose the data on it, and your
 * last export is the source of truth" (README). A backup that silently
 * fails to round-trip would only be discovered by someone who had already
 * lost everything.
 *
 * Also checks the property the export must hold to be safe to share at
 * all: **it carries no key material.** `transfer.ts` maps explicit fields
 * rather than spreading rows, precisely so a key can never ride along —
 * and users do attach these files to bug reports.
 */

import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { installAnthropicMock } from './mock-anthropic'
import {
  FAKE_ANTHROPIC_KEY,
  ask,
  composerInput,
  emptyCouncil,
  importCouncil,
  seedReadyProfile,
} from './helpers'

const QUESTION = 'What belongs in a disaster-recovery runbook?'
const ANSWER = 'Start with the restore drill; an untested backup is a rumour.'

test('a council survives export, factory reset, and re-import', async ({
  page,
}) => {
  await seedReadyProfile(page)
  await installAnthropicMock(page, {
    participant: () => ANSWER,
    title: () => ({ title: 'Disaster Recovery Runbook' }),
  })

  /* Give the council something worth losing. */
  const councilId = await importCouncil(
    page,
    emptyCouncil('it-backup', 'roundtable', 'Backup council'),
  )
  await ask(page, QUESTION)
  await expect(page.getByText(ANSWER).first()).toBeVisible({ timeout: 30_000 })

  /* Export. */
  await page.goto('/settings/storage')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export all councils' }).click()
  const download = await downloadPromise
  const exportPath = await download.path()
  const exported = readFileSync(exportPath, 'utf8')

  /* The backup is safe to hand to someone else. */
  expect(exported).not.toContain(FAKE_ANTHROPIC_KEY)
  expect(exported).not.toContain('sk-ant')
  expect(exported).toContain(QUESTION)
  expect(exported).toContain(ANSWER)

  /* Factory reset — the real one, behind its confirm dialog. It ends in a
     hard `window.location.reload()`, so the reload has to be awaited:
     navigating into it aborts the pending request (`net::ERR_ABORTED`). */
  await page.getByRole('button', { name: 'Wipe everything' }).click()
  await Promise.all([
    page.waitForEvent('load'),
    page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Wipe everything' })
      .click(),
  ])

  /* The council is genuinely gone. (What the reset does *besides* dropping
     councils — clearing the seed flag so demos return — is the visual
     suite's `13-factory-reset` spec, and isn't repeated here.) */
  await page.goto(`/council/${councilId}`)
  await expect(page.getByText(ANSWER)).toHaveCount(0)

  /* Restore it from the file that was just downloaded. */
  await page.goto('/settings/storage')
  await page.locator('input[type="file"]').setInputFiles({
    name: 'restore.json',
    mimeType: 'application/json',
    buffer: Buffer.from(exported),
  })
  const report = page.getByText(/Imported/)
  await report.waitFor({ state: 'attached' })
  await expect(report).toContainText('0 error')

  /* And the conversation is back, question and answer both. */
  await page.goto(`/council/${councilId}`)
  await expect(composerInput(page)).toBeVisible()
  await expect(page.getByText(ANSWER).first()).toBeVisible()
  await expect(page.getByText(QUESTION).first()).toBeVisible()
})
