import { describe, expect, it } from 'vitest'
import { getModel } from '@/models/registry'
import {
  firstUsableModelId,
  hasUsableModel,
  pickSmartestModelIds,
} from '@/utils/usable-models'

describe('hasUsableModel / firstUsableModelId', () => {
  it('nothing is usable with no keys and Ollama off', () => {
    expect(hasUsableModel({}, false)).toBe(false)
    expect(firstUsableModelId({}, false)).toBeNull()
  })

  it('a cloud key unlocks that provider’s models (optimistic reachability)', () => {
    expect(hasUsableModel({ anthropic: 'k' }, false)).toBe(true)
    const first = firstUsableModelId({ anthropic: 'k' }, false)
    expect(first).not.toBeNull()
    expect(getModel(first!).provider).toBe('anthropic')
  })

  it('Ollama counts only while reachable (the opt-in toggle gate)', () => {
    expect(hasUsableModel({}, true)).toBe(true)
    const first = firstUsableModelId({}, true)
    expect(getModel(first!).provider).toBe('ollama')
  })
})

describe('pickSmartestModelIds', () => {
  it('picks each keyed provider’s `smartest`-flagged model', () => {
    const picks = pickSmartestModelIds(
      { anthropic: 'k', openai: 'k' },
      false,
    )
    expect(picks).toHaveLength(2)
    const entries = picks.map((id) => getModel(id))
    expect(entries.map((m) => m.provider)).toEqual(['anthropic', 'openai'])
    // The explicit designation, not registry position (Anthropic's first
    // entry is Opus — the default seat — but its `smartest` is Fable 5).
    expect(entries.every((m) => m.smartest)).toBe(true)
  })

  it('tops up to the seat floor from the same provider when needed', () => {
    const picks = pickSmartestModelIds({ anthropic: 'k' }, false, 2)
    expect(picks).toHaveLength(2)
    expect(new Set(picks).size).toBe(2)
    expect(picks.every((id) => getModel(id).provider === 'anthropic')).toBe(
      true,
    )
  })

  it('never seats OpenRouter and returns [] with nothing reachable', () => {
    const picks = pickSmartestModelIds({ openrouter: 'k' }, false, 2)
    expect(picks).toEqual([])
    expect(pickSmartestModelIds({}, false)).toEqual([])
  })
})
