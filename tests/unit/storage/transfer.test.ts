import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/storage/db'
import {
  bundleExportFilename,
  councilExportFilename,
  exportAllCouncils,
  exportOneCouncil,
  importCouncils,
} from '@/storage/transfer'
import { appendTurn, createCouncil, getCouncil } from '@/storage/councils'
import { clearDb } from '../helpers/db'
import { bundleCouncil, envelope } from '../helpers/bundles'
import {
  MODEL_B,
  participantEvent,
  seat,
  turn,
} from '../helpers/fixtures'

beforeEach(async () => {
  await clearDb()
})

describe('importCouncils', () => {
  it('rejects anything that is not a v1 envelope', async () => {
    await expect(importCouncils({ version: 2, councils: [] })).rejects.toThrow(
      'not a v1 council export',
    )
    await expect(importCouncils('garbage')).rejects.toThrow()
  })

  it('imports a valid council and skips ids that already exist', async () => {
    await createCouncil({
      id: 'existing',
      socialStructure: 'roundtable',
      seats: [seat('s1')],
    })
    const report = await importCouncils(
      envelope([
        bundleCouncil({ id: 'existing' }),
        bundleCouncil({ id: 'fresh', title: 'Imported' }),
      ]),
    )
    expect(report).toEqual({ imported: 1, skipped: 1, errors: [] })
    const fresh = await getCouncil('fresh')
    expect(fresh?.title).toBe('Imported')
    // The exported createdAt is restored, not stamped at import time.
    expect(fresh?.createdAt).toBe(1_700_000_000_000)
  })

  it('reports a malformed council and still imports its siblings', async () => {
    const report = await importCouncils(
      envelope([
        { id: 'broken', socialStructure: 'nonsense' },
        bundleCouncil({ id: 'good' }),
      ]),
    )
    expect(report.imported).toBe(1)
    expect(report.errors).toHaveLength(1)
    expect(report.errors[0]?.id).toBe('broken')
    expect(await getCouncil('good')).not.toBeNull()
  })

  it('is all-or-nothing per council: a failing turn strands no partial rows', async () => {
    // Two turns at the same idx pass the schema but make the second
    // appendTurn throw conflict_idx mid-import — the transaction must
    // roll the whole council back.
    const doomed = bundleCouncil({
      id: 'doomed',
      turns: [
        turn({ id: 'dt1', idx: 0, events: [participantEvent('s1')] }),
        turn({ id: 'dt2', idx: 0, events: [participantEvent('s1')] }),
      ],
    })
    const report = await importCouncils(envelope([doomed]))
    expect(report.imported).toBe(0)
    expect(report.errors).toHaveLength(1)
    expect(report.errors[0]?.reason).toContain('conflict_idx')
    expect(await db.councils.get('doomed')).toBeUndefined()
    expect(await db.seats.where('councilId').equals('doomed').count()).toBe(0)
    expect(await db.turns.where('councilId').equals('doomed').count()).toBe(0)
  })

  it('skips a duplicate id later in the same bundle instead of re-importing', async () => {
    const report = await importCouncils(
      envelope([bundleCouncil({ id: 'dup' }), bundleCouncil({ id: 'dup' })]),
    )
    expect(report.imported).toBe(1)
    expect(report.skipped).toBe(1)
  })
})

describe('export → import round-trip', () => {
  it('a full backup restores identically (the round-trip contract)', async () => {
    await createCouncil({
      id: 'trial-1',
      socialStructure: 'trial',
      seats: [seat('s1'), seat('s2', MODEL_B)],
      judge: { modelId: MODEL_B, config: { temperature: 0.2 } },
      deliberation: { mediatorMaxRounds: 3 },
    })
    await appendTurn(
      'trial-1',
      turn({
        id: 't1',
        idx: 0,
        userMsg: 'roundtrip?',
        events: [
          participantEvent('s1', { tokens: { input: 1, output: 2 } }),
          participantEvent('s2'),
        ],
        votingLabels: { A: 's1', B: 's2' },
        userImages: ['data:image/png;base64,AAAA'],
      }),
    )

    const backup = await exportAllCouncils()
    expect(backup.version).toBe(1)
    expect(backup.councils).toHaveLength(1)

    await clearDb()
    const report = await importCouncils(backup)
    expect(report).toEqual({ imported: 1, skipped: 0, errors: [] })

    const restored = await exportAllCouncils()
    expect(restored.councils).toEqual(backup.councils)
  })

  it('exportOneCouncil wraps a single council in the same envelope', async () => {
    await createCouncil({
      id: 'solo',
      socialStructure: 'roundtable',
      seats: [seat('s1')],
    })
    const single = await exportOneCouncil('solo')
    expect(single?.councils).toHaveLength(1)
    expect(single?.councils[0]?.id).toBe('solo')
    expect(await exportOneCouncil('ghost')).toBeNull()
  })
})

describe('export filenames', () => {
  it('slugifies titles and dates', () => {
    expect(councilExportFilename('Monolith vs Microservices!')).toBe(
      'yesbrainer-council-monolith-vs-microservices.json',
    )
    expect(councilExportFilename(null)).toBe(
      'yesbrainer-council-untitled.json',
    )
    expect(bundleExportFilename()).toMatch(
      /^yesbrainer-bundle-\d{4}-\d{2}-\d{2}\.json$/,
    )
  })
})
