import { describe, expect, it } from 'vitest'
import {
  bundleCouncilSchema,
  councilBundleSchema,
} from '@/storage/bundle-schema'
import { bundleCouncil } from '../helpers/bundles'
import { participantEvent, turn } from '../helpers/fixtures'

function withTurn(over: Parameters<typeof turn>[0]) {
  return bundleCouncil({ turns: [turn(over)] })
}

describe('councilBundleSchema (envelope)', () => {
  it('accepts only version 1', () => {
    expect(
      councilBundleSchema.safeParse({
        version: 1,
        exportedAt: 1,
        councils: [],
      }).success,
    ).toBe(true)
    expect(
      councilBundleSchema.safeParse({
        version: 2,
        exportedAt: 1,
        councils: [],
      }).success,
    ).toBe(false)
  })
})

describe('bundleCouncilSchema', () => {
  it('accepts a well-formed council', () => {
    const result = bundleCouncilSchema.safeParse(
      withTurn({ events: [participantEvent('s1')] }),
    )
    expect(result.success).toBe(true)
  })

  it('rejects structures and efforts the type system no longer knows', () => {
    expect(
      bundleCouncilSchema.safeParse(
        bundleCouncil({ socialStructure: 'townhall' as never }),
      ).success,
    ).toBe(false)
    expect(
      bundleCouncilSchema.safeParse(
        bundleCouncil({
          seats: [
            {
              id: 's1',
              modelId: 'x',
              config: { reasoningEffort: 'ultra' as never },
            },
          ],
        }),
      ).success,
    ).toBe(false)
    // 'off' / 'max' joined the union later — bundles carrying them parse.
    expect(
      bundleCouncilSchema.safeParse(
        bundleCouncil({
          seats: [
            { id: 's1', modelId: 'x', config: { reasoningEffort: 'max' } },
          ],
        }),
      ).success,
    ).toBe(true)
  })

  it('keeps foreign protocols and remote URLs out of userImages', () => {
    const jsUri = withTurn({
      userImages: ['javascript:alert(1)'] as never,
    })
    const remote = withTurn({
      userImages: ['https://attacker.example/x.png'] as never,
    })
    const dataImage = withTurn({
      userImages: ['data:image/png;base64,AAAA'],
    })
    expect(bundleCouncilSchema.safeParse(jsUri).success).toBe(false)
    expect(bundleCouncilSchema.safeParse(remote).success).toBe(false)
    expect(bundleCouncilSchema.safeParse(dataImage).success).toBe(true)
  })

  it('rejects non-finite numbers so imported totals can’t poison the math', () => {
    expect(
      bundleCouncilSchema.safeParse(
        bundleCouncil({
          tokenTotal: { inputTokens: Number.NaN, outputTokens: 0 },
        }),
      ).success,
    ).toBe(false)
  })

  it('caps free-text and collection sizes (crafted-bundle DoS)', () => {
    const hugeOutput = withTurn({
      events: [participantEvent('s1', { output: 'x'.repeat(1_000_001) })],
    })
    expect(bundleCouncilSchema.safeParse(hugeOutput).success).toBe(false)

    const hugePrompt = bundleCouncil({
      seats: [
        {
          id: 's1',
          modelId: 'x',
          config: { systemPrompt: 'p'.repeat(64_001) },
        },
      ],
    })
    expect(bundleCouncilSchema.safeParse(hugePrompt).success).toBe(false)

    const seatArmy = bundleCouncil({
      seats: Array.from({ length: 65 }, (_, i) => ({
        id: `s${i}`,
        modelId: 'x',
        config: {},
      })),
    })
    expect(bundleCouncilSchema.safeParse(seatArmy).success).toBe(false)
  })

  it('caps rating values so a crafted 1e308 can’t skew the leaderboard', () => {
    const c = withTurn({
      events: [
        participantEvent('s1', {
          roleType: 'vote',
          vote: [
            { targetSeatId: 's2', ratings: { accuracy: 1e308 }, comment: '' },
          ],
        }),
      ],
    })
    expect(bundleCouncilSchema.safeParse(c).success).toBe(false)
  })

  it('strips unknown keys rather than carrying them into storage', () => {
    const parsed = bundleCouncilSchema.safeParse({
      ...bundleCouncil(),
      __proto__polluter: true,
      telemetryUrl: 'https://attacker.example',
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect('telemetryUrl' in parsed.data).toBe(false)
    }
  })

  it('defaults a missing seat config to {} and a missing title to null', () => {
    const parsed = bundleCouncilSchema.safeParse({
      ...bundleCouncil({ title: undefined as never }),
      seats: [{ id: 's1', modelId: 'x' }],
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.title).toBeNull()
      expect(parsed.data.seats[0]?.config).toEqual({})
    }
  })
})
