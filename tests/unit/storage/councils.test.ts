import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/storage/db'
import {
  addSeat,
  appendTurn,
  createCouncil,
  deleteCouncil,
  getCouncil,
  listCouncils,
  patchCouncilTitle,
  removeSeat,
  replaceEvent,
  setDeliberation,
  setJudge,
  setMediator,
  updateSeat,
} from '@/storage/councils'
import { clearDb } from '../helpers/db'
import {
  MODEL_A,
  MODEL_B,
  participantEvent,
  seat,
  turn,
} from '../helpers/fixtures'

beforeEach(async () => {
  await clearDb()
})

const judge = { modelId: MODEL_B, config: {} }
const mediator = { modelId: MODEL_B, config: {} }

describe('createCouncil', () => {
  it('requires the structure’s synthesiser and strips the other', async () => {
    await expect(
      createCouncil({ id: 'c1', socialStructure: 'trial', seats: [seat('s1')] }),
    ).rejects.toThrow('judge_required_for_trial')
    await expect(
      createCouncil({
        id: 'c2',
        socialStructure: 'consensus',
        seats: [seat('s1')],
      }),
    ).rejects.toThrow('mediator_required_for_consensus')

    // Parallel strips a judge the caller mistakenly included.
    const c = await createCouncil({
      id: 'c3',
      socialStructure: 'roundtable',
      seats: [seat('s1')],
      judge,
    })
    expect(c.judge).toBeUndefined()
  })

  it('is idempotent on the same id (StrictMode double-fire)', async () => {
    const first = await createCouncil({
      id: 'c1',
      socialStructure: 'roundtable',
      seats: [seat('s1')],
    })
    const second = await createCouncil({
      id: 'c1',
      socialStructure: 'roundtable',
      seats: [seat('s1'), seat('s2')],
    })
    expect(second.id).toBe(first.id)
    // The re-create did NOT reshape the roster.
    expect(second.seats).toHaveLength(1)
  })

  it('assigns roster positions from array order', async () => {
    await createCouncil({
      id: 'c1',
      socialStructure: 'roundtable',
      seats: [seat('b'), seat('a')],
    })
    const c = await getCouncil('c1')
    expect(c?.seats.map((s) => s.id)).toEqual(['b', 'a'])
  })
})

describe('appendTurn', () => {
  beforeEach(async () => {
    await createCouncil({
      id: 'c1',
      socialStructure: 'roundtable',
      seats: [seat('s1')],
    })
  })

  it('persists the turn, aggregates tokens, and auto-titles from the first message', async () => {
    await appendTurn(
      'c1',
      turn({
        id: 't1',
        idx: 0,
        userMsg: 'A question that is quite deliberately much longer than the sixty character clamp',
        events: [participantEvent('s1', { tokens: { input: 3, output: 4 } })],
      }),
    )
    const c = await getCouncil('c1')
    expect(c?.turns).toHaveLength(1)
    expect(c?.tokenTotal).toEqual({ inputTokens: 3, outputTokens: 4 })
    expect(c?.title?.length).toBeLessThanOrEqual(60)
    expect(c?.title?.endsWith('…')).toBe(true)
  })

  it('upserts the same turn id (durability checkpoint → final persist)', async () => {
    const checkpoint = turn({
      id: 't1',
      idx: 0,
      events: [participantEvent('s1', { tokens: { input: 1, output: 1 } })],
    })
    await appendTurn('c1', checkpoint)
    const final = turn({
      id: 't1',
      idx: 0,
      events: [
        ...checkpoint.events,
        participantEvent('s1', {
          roleType: 'judge',
          tokens: { input: 2, output: 2 },
        }),
      ],
      votingLabels: { A: 's1' },
    })
    await appendTurn('c1', final)
    const c = await getCouncil('c1')
    expect(c?.turns).toHaveLength(1)
    expect(c?.turns[0]?.events).toHaveLength(2)
    expect(c?.turns[0]?.votingLabels).toEqual({ A: 's1' })
    expect(c?.tokenTotal).toEqual({ inputTokens: 3, outputTokens: 3 })
  })

  it('rejects a different turn id at a taken idx (double-send guard)', async () => {
    await appendTurn('c1', turn({ id: 't1', idx: 0 }))
    await expect(
      appendTurn('c1', turn({ id: 't2', idx: 0 })),
    ).rejects.toThrow('conflict_idx')
  })

  it('rejects unknown councils and cross-council turn ids', async () => {
    await expect(
      appendTurn('missing', turn({ id: 't1', idx: 0 })),
    ).rejects.toThrow('council_not_found')

    await appendTurn('c1', turn({ id: 't1', idx: 0 }))
    await createCouncil({
      id: 'c2',
      socialStructure: 'roundtable',
      seats: [seat('sx')],
    })
    await expect(
      appendTurn('c2', turn({ id: 't1', idx: 0 })),
    ).rejects.toThrow('turn_id_taken')
  })
})

describe('replaceEvent', () => {
  it('swaps an event in place and re-aggregates both totals', async () => {
    await createCouncil({
      id: 'c1',
      socialStructure: 'roundtable',
      seats: [seat('s1')],
    })
    const errored = participantEvent('s1', { id: 'target', error: 'boom' })
    await appendTurn('c1', turn({ id: 't1', idx: 0, events: [errored] }))
    await replaceEvent('c1', 't1', {
      ...errored,
      error: undefined,
      output: 'fixed',
      tokens: { input: 7, output: 7 },
    })
    const c = await getCouncil('c1')
    expect(c?.turns[0]?.events[0]?.output).toBe('fixed')
    expect(c?.tokenTotal).toEqual({ inputTokens: 7, outputTokens: 7 })
  })

  it('fails loudly when the event does not exist', async () => {
    await createCouncil({
      id: 'c1',
      socialStructure: 'roundtable',
      seats: [seat('s1')],
    })
    await appendTurn('c1', turn({ id: 't1', idx: 0 }))
    await expect(
      replaceEvent('c1', 't1', participantEvent('s1', { id: 'nope' })),
    ).rejects.toThrow('event_not_found')
  })
})

describe('roster editing', () => {
  beforeEach(async () => {
    await createCouncil({
      id: 'c1',
      socialStructure: 'roundtable',
      seats: [seat('s1')],
    })
  })

  it('addSeat appends at the end; removeSeat refuses the last seat', async () => {
    await addSeat('c1', seat('s2', MODEL_B))
    let c = await getCouncil('c1')
    expect(c?.seats.map((s) => s.id)).toEqual(['s1', 's2'])

    await removeSeat('c1', 's1')
    c = await getCouncil('c1')
    expect(c?.seats.map((s) => s.id)).toEqual(['s2'])
    await expect(removeSeat('c1', 's2')).rejects.toThrow('last_seat')
  })

  it('updateSeat requires at least one field and a real seat', async () => {
    await expect(updateSeat('c1', 's1', {})).rejects.toThrow(
      'at_least_one_field_required',
    )
    await expect(
      updateSeat('c1', 'ghost', { modelId: MODEL_B }),
    ).rejects.toThrow('seat_not_found')
    await updateSeat('c1', 's1', { modelId: MODEL_B })
    const c = await getCouncil('c1')
    expect(c?.seats[0]?.modelId).toBe(MODEL_B)
  })
})

describe('synthesiser slots', () => {
  it('setJudge / setMediator enforce the owning structure', async () => {
    await createCouncil({
      id: 'parallel',
      socialStructure: 'roundtable',
      seats: [seat('s1')],
    })
    await expect(setJudge('parallel', judge)).rejects.toThrow(
      'judge_requires_trial',
    )
    await expect(setMediator('parallel', mediator)).rejects.toThrow(
      'mediator_requires_consensus',
    )

    await createCouncil({
      id: 'trial',
      socialStructure: 'trial',
      seats: [seat('t1')],
      judge,
    })
    await setJudge('trial', { modelId: MODEL_A, config: {} })
    const c = await getCouncil('trial')
    expect(c?.judge?.modelId).toBe(MODEL_A)
  })
})

describe('read-boundary normalization', () => {
  it('degrades a stale structure id to custom and drops a stale reasoning effort', async () => {
    // Write rows the way an older build would have — straight into Dexie,
    // bypassing today's types (that's exactly the invariant under test).
    await db.councils.put({
      id: 'stale',
      title: 'old row',
      createdAt: 1,
      socialStructure: 'townhall' as never,
      tokenTotal: { inputTokens: 0, outputTokens: 0 },
      judge: {
        modelId: MODEL_A,
        config: { reasoningEffort: 'ultra' as never },
      },
    })
    await db.seats.put({
      id: 's1',
      councilId: 'stale',
      modelId: MODEL_A,
      // 'max' joined the union later — a live row holding it must
      // survive the read boundary, while off-union ids still drop.
      config: { reasoningEffort: 'max' as never, temperature: 0.5 },
      pos: 0,
    })

    const c = await getCouncil('stale')
    expect(c?.socialStructure).toBe('custom')
    expect(c?.seats[0]?.config.reasoningEffort).toBe('max')
    expect(c?.seats[0]?.config.temperature).toBe(0.5)
    expect(c?.judge?.config.reasoningEffort).toBeUndefined()

    const listed = await listCouncils()
    expect(listed[0]?.socialStructure).toBe('custom')
  })
})

describe('patchCouncilTitle / deleteCouncil', () => {
  it('clamps to 60 chars, rejects empties and missing councils', async () => {
    await createCouncil({
      id: 'c1',
      socialStructure: 'roundtable',
      seats: [seat('s1')],
    })
    await patchCouncilTitle('c1', ` ${'x'.repeat(80)} `)
    const c = await getCouncil('c1')
    expect(c?.title).toBe('x'.repeat(60))
    await expect(patchCouncilTitle('c1', '   ')).rejects.toThrow('title_empty')
    await expect(patchCouncilTitle('ghost', 'hi')).rejects.toThrow('not_found')
  })

  it('deleteCouncil cascades seats and turns', async () => {
    await createCouncil({
      id: 'c1',
      socialStructure: 'roundtable',
      seats: [seat('s1')],
    })
    await appendTurn('c1', turn({ id: 't1', idx: 0 }))
    await deleteCouncil('c1')
    expect(await db.councils.count()).toBe(0)
    expect(await db.seats.count()).toBe(0)
    expect(await db.turns.count()).toBe(0)
  })
})

describe('storage edge cases', () => {
  it('replaceEvent rejects an unknown turn', async () => {
    await createCouncil({
      id: 'c1',
      socialStructure: 'roundtable',
      seats: [seat('s1')],
    })
    await expect(
      replaceEvent('c1', 'ghost-turn', participantEvent('s1')),
    ).rejects.toThrow('turn_not_found')
  })

  it('removeSeat rejects a seat that is not on the council', async () => {
    await createCouncil({
      id: 'c1',
      socialStructure: 'roundtable',
      seats: [seat('s1'), seat('s2')],
    })
    await expect(removeSeat('c1', 'ghost-seat')).rejects.toThrow(
      'seat_not_found',
    )
  })

  it('setDeliberation keeps dimensions, minCommentLength and passPeerAnswers', async () => {
    await createCouncil({
      id: 'c1',
      socialStructure: 'consensus',
      seats: [seat('s1'), seat('s2')],
      mediator,
    })
    await setDeliberation('c1', {
      votingDimensions: [{ name: 'accuracy', description: 'is it right' }],
      minCommentLength: 20,
      passPeerAnswers: true,
    })
    const c = await getCouncil('c1')
    expect(c?.deliberation?.votingDimensions).toHaveLength(1)
    expect(c?.deliberation?.minCommentLength).toBe(20)
    expect(c?.deliberation?.passPeerAnswers).toBe(true)
  })
})
