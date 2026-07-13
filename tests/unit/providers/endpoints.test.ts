import { describe, expect, it } from 'vitest'
import { PROVIDER_API_ORIGINS } from '@/providers/endpoints'
import { PROVIDER_IDS } from '@/models/registry'

describe('PROVIDER_API_ORIGINS', () => {
  it('documents an origin for every provider (the CSP build assertion feeds on this)', () => {
    for (const id of PROVIDER_IDS) {
      const origin = PROVIDER_API_ORIGINS[id]
      // Bare origins only — a path would never match a CSP source.
      expect(origin).toMatch(/^https?:\/\/[^/]+$/)
    }
  })

  it('cloud providers are https; only the local daemon is http', () => {
    for (const [id, origin] of Object.entries(PROVIDER_API_ORIGINS)) {
      if (id === 'ollama') expect(origin).toMatch(/^http:\/\/localhost/)
      else expect(origin).toMatch(/^https:\/\//)
    }
  })
})
