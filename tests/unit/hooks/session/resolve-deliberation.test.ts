import { describe, expect, it } from 'vitest'
import { resolveDeliberation } from '@/hooks/session/resolve-deliberation'
import {
  DEFAULT_MEDIATOR_MAX_ROUNDS,
  DEFAULT_VOTING_DIMENSIONS,
} from '@/storage/behavior'
import { DEFAULT_VOTING_SYSTEM_PROMPT } from '@/storage/prompts'

function setGlobals(behavior: object, prompts: object = {}): void {
  localStorage.setItem('yesbrainer:behavior', JSON.stringify(behavior))
  localStorage.setItem('yesbrainer:prompts', JSON.stringify(prompts))
}

describe('resolveDeliberation', () => {
  it('falls all the way to the hardcoded defaults with nothing set', () => {
    const r = resolveDeliberation(undefined)
    expect(r.votingDimensions).toEqual(DEFAULT_VOTING_DIMENSIONS)
    expect(r.mediatorMaxRounds).toBe(DEFAULT_MEDIATOR_MAX_ROUNDS)
    expect(r.votingSystem).toBe(DEFAULT_VOTING_SYSTEM_PROMPT)
  })

  it('council overrides win over globals; globals win over defaults', () => {
    setGlobals(
      { mediatorMaxRounds: 5, minCommentLength: 10 },
      { votingSystem: 'global voice' },
    )
    const r = resolveDeliberation({
      mediatorMaxRounds: 2,
      votingSystem: 'council voice',
    })
    expect(r.mediatorMaxRounds).toBe(2) // council
    expect(r.minCommentLength).toBe(10) // global
    expect(r.votingSystem).toBe('council voice')
  })

  it('empty / whitespace strings cascade down instead of blanking a prompt', () => {
    setGlobals({}, { votingSystem: '   ' })
    const r = resolveDeliberation({ votingSystem: '' })
    expect(r.votingSystem).toBe(DEFAULT_VOTING_SYSTEM_PROMPT)
  })

  it('an emptied rubric can never blank the voting schema', () => {
    setGlobals({ votingDimensions: [] })
    const r = resolveDeliberation({ votingDimensions: [] })
    expect(r.votingDimensions).toEqual(DEFAULT_VOTING_DIMENSIONS)
  })

  it('forces divergence back on when both pass-back toggles resolve off', () => {
    const r = resolveDeliberation({
      passDivergence: false,
      passPeerAnswers: false,
    })
    expect(r.passDivergence).toBe(true)
    expect(r.passPeerAnswers).toBe(false)

    const withPeers = resolveDeliberation({
      passDivergence: false,
      passPeerAnswers: true,
    })
    expect(withPeers.passDivergence).toBe(false)
  })
})
