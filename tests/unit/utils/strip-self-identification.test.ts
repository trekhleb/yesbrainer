import { describe, expect, it } from 'vitest'
import { stripSelfIdentification } from '@/utils/strip-self-identification'

describe('stripSelfIdentification', () => {
  it('drops unambiguous brand openings up to the first sentence', () => {
    expect(
      stripSelfIdentification('As Claude, I love this. The real answer is 42.'),
    ).toBe('The real answer is 42.')
    expect(
      stripSelfIdentification("I'm GPT, built by OpenAI. Use a heap here."),
    ).toBe('Use a heap here.')
    expect(
      stripSelfIdentification("Hello! I'm Gemini, happy to help. Pick B."),
    ).toBe('Pick B.')
  })

  it('drops trailing sign-offs', () => {
    expect(stripSelfIdentification('Pick B.\n— Claude')).toBe('Pick B.')
    expect(stripSelfIdentification('Pick B.\n\nBest,\nGPT-4')).toBe('Pick B.')
  })

  it('never touches mid-sentence brand mentions (false positives are worse)', () => {
    const text = 'Claude and GPT differ on this: choose the simpler design.'
    expect(stripSelfIdentification(text)).toBe(text)
  })

  it('returns the original text when stripping would leave nothing', () => {
    const refusal = 'As Claude, I cannot answer that.'
    expect(stripSelfIdentification(refusal)).toBe(refusal)
  })
})
