import { describe, expect, it } from 'vitest'
import {
  compareCatalogEntries,
  MAX_CATALOG_MODELS,
  normalizeContextWindow,
  parseOpenRouterCatalog,
  quoteTsString,
} from '../../../scripts/openrouter-catalog.mjs'

const validModel = {
  id: 'vendor/valid',
  name: 'Vendor: Valid',
  pricing: { prompt: '0.000001' },
  architecture: { input_modalities: ['text'] },
  supported_parameters: ['tools'],
  context_length: 128_000,
}

describe('parseOpenRouterCatalog', () => {
  it('keeps valid rows when a sibling row is malformed', () => {
    const parsed = parseOpenRouterCatalog({
      data: [validModel, { ...validModel, id: '', name: 42 }],
    })
    expect(parsed).toEqual({
      ok: true,
      models: [validModel],
      rejectedIndexes: [1],
    })
  })

  it('rejects an unbounded response envelope', () => {
    const parsed = parseOpenRouterCatalog({
      data: Array.from({ length: MAX_CATALOG_MODELS + 1 }),
    })
    expect(parsed.ok).toBe(false)
  })

  it('rejects oversized model fields without suppressing valid rows', () => {
    const parsed = parseOpenRouterCatalog({
      data: [validModel, { ...validModel, name: 'x'.repeat(1_001) }],
    })
    expect(parsed).toMatchObject({
      ok: true,
      models: [validModel],
      rejectedIndexes: [1],
    })
  })
})

describe('generated-source helpers', () => {
  it('escapes quotes, slashes, and every line terminator', () => {
    expect(quoteTsString("a\\b'c\rd\r\ne\nf\u2028g\u2029h")).toBe(
      "'a\\\\b\\'c\\nd\\ne\\nf\\ng\\nh'",
    )
  })

  it('sorts by code point rather than the host locale', () => {
    const entries = [
      { label: 'beta', providerModelId: 'vendor/b' },
      { label: 'Alpha', providerModelId: 'vendor/a' },
      { label: 'Alpha', providerModelId: 'vendor/0' },
    ]
    expect([...entries].sort(compareCatalogEntries)).toEqual([
      { label: 'Alpha', providerModelId: 'vendor/0' },
      { label: 'Alpha', providerModelId: 'vendor/a' },
      { label: 'beta', providerModelId: 'vendor/b' },
    ])
  })

  it('normalizes context windows once for validation and emission', () => {
    expect(normalizeContextWindow('128000.9')).toBe(128_000)
    expect(normalizeContextWindow(200_000_000)).toBe(100_000_000)
    expect(normalizeContextWindow('invalid')).toBe(0)
  })
})
