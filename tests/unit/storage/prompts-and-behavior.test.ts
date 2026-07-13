import { describe, expect, it } from 'vitest'
import {
  applyTemplate,
  getUserPrompts,
  resolveCouncilParticipantDefault,
  resolveParticipantDefault,
  setUserPrompts,
} from '@/storage/prompts'
import {
  formatDimensionsDescription,
  getBehaviorSettings,
  setBehaviorSettings,
} from '@/storage/behavior'
import {
  getRunOptions,
  getStickyReasoningEffort,
  setRunOptions,
} from '@/storage/run-options'

describe('applyTemplate', () => {
  it('substitutes every occurrence and leaves values verbatim', () => {
    expect(
      applyTemplate('Q: {q} / again {q} by {who}', {
        q: 'the question',
        who: 'Model {q}', // a literal brace in a VALUE must survive
      }),
    ).toBe('Q: the question / again the question by Model {q}')
  })

  it('leaves unknown placeholders alone', () => {
    expect(applyTemplate('keep {unknown}', {})).toBe('keep {unknown}')
  })
})

describe('resolveParticipantDefault', () => {
  const prompts = {
    participant: 'parallel voice',
    participantTrial: 'trial voice',
    participantConsensus: '  ',
  }

  it('each structure resolves its own independent field', () => {
    expect(resolveParticipantDefault('roundtable', prompts)).toBe(
      'parallel voice',
    )
    expect(resolveParticipantDefault('trial', prompts)).toBe('trial voice')
    // Whitespace-only counts as unset.
    expect(resolveParticipantDefault('consensus', prompts)).toBeUndefined()
    // Custom rides the parallel field.
    expect(resolveParticipantDefault('custom', prompts)).toBe('parallel voice')
  })

  it('the per-council override wins in the council-level resolver', () => {
    expect(
      resolveCouncilParticipantDefault(
        { participant: 'council voice' },
        'trial',
        prompts,
      ),
    ).toBe('council voice')
    expect(
      resolveCouncilParticipantDefault(undefined, 'trial', prompts),
    ).toBe('trial voice')
  })
})

describe('prompts adapter sanitize', () => {
  it('drops empty/whitespace prompt overrides on write', () => {
    setUserPrompts({ judgeSystem: '  keep me  ', votingSystem: '   ' })
    expect(getUserPrompts()).toEqual({ judgeSystem: '  keep me  ' })
  })
})

describe('behavior settings', () => {
  it('round-trips knobs and formats the dimension description block', () => {
    setBehaviorSettings({ mediatorMaxRounds: 4, stripSelfId: false })
    expect(getBehaviorSettings()).toEqual({
      mediatorMaxRounds: 4,
      stripSelfId: false,
    })
    expect(
      formatDimensionsDescription([
        { name: 'accuracy', description: 'is it right?' },
        { name: 'tone' },
      ]),
    ).toBe('- accuracy: is it right?\n- tone')
  })
})

describe('run-options storage', () => {
  it('persists per-council sticky options and guards the enum on read', () => {
    setRunOptions('c1', { mutedTools: ['web_search'], reasoningEffort: 'high' })
    expect(getRunOptions('c1')).toEqual({
      mutedTools: ['web_search'],
      reasoningEffort: 'high',
    })
    // New rungs round-trip; a hand-edited effort off the
    // union degrades to null.
    setRunOptions('c1', { mutedTools: [], reasoningEffort: 'off' })
    expect(getRunOptions('c1').reasoningEffort).toBe('off')
    localStorage.setItem(
      'yesbrainer:run-options:c1',
      JSON.stringify({ mutedTools: [1, 'ok'], reasoningEffort: 'ultra' }),
    )
    expect(getRunOptions('c1')).toEqual({
      mutedTools: ['ok'],
      reasoningEffort: null,
    })
  })

  it('all-defaults drops the key entirely', () => {
    setRunOptions('c1', { mutedTools: ['x'], reasoningEffort: null })
    setRunOptions('c1', { mutedTools: [], reasoningEffort: null })
    expect(localStorage.getItem('yesbrainer:run-options:c1')).toBeNull()
    expect(getRunOptions('missing')).toEqual({
      mutedTools: [],
      reasoningEffort: null,
    })
  })

  it('getStickyReasoningEffort shapes the override for run* call sites', () => {
    setRunOptions('c9', { mutedTools: [], reasoningEffort: 'max' })
    expect(getStickyReasoningEffort('c9')).toBe('max')
    setRunOptions('c9', { mutedTools: [], reasoningEffort: null })
    // `undefined`, not `null` — feeds `resolveReasoningEffort` directly.
    expect(getStickyReasoningEffort('c9')).toBeUndefined()
  })
})
