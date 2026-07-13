import { describe, expect, it } from 'vitest'
import { assertNever } from '@/utils/assert-never'

describe('assertNever', () => {
  it('is a runtime no-op — stale persisted values degrade, never crash', () => {
    expect(() => assertNever('stale-enum-value' as never)).not.toThrow()
  })
})
