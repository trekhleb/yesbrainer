import { describe, expect, it } from 'vitest'
import {
  SOCIAL_STRUCTURES,
  socialStructureMeta,
  STRUCTURE_ICON,
} from '@/models/social-structures'
import { structureColorSet } from '@/models/social-structure-colors'
import { SOCIAL_STRUCTURE_VALUES } from '@/types/council'

describe('social structure catalogs', () => {
  it('orders the pickable structures simplest → most complex', () => {
    expect(SOCIAL_STRUCTURES.map((s) => s.id)).toEqual([
      'roundtable',
      'consensus',
      'trial',
    ])
  })

  it('meta lookup covers pickable structures; custom deliberately has none', () => {
    expect(socialStructureMeta('trial')?.shortLabel).toBe('Trial')
    expect(socialStructureMeta('custom')).toBeUndefined()
  })

  it('every non-custom structure carries an icon (compile-enforced, spot-checked)', () => {
    expect(Object.keys(STRUCTURE_ICON).sort()).toEqual(
      SOCIAL_STRUCTURE_VALUES.filter((v) => v !== 'custom').sort(),
    )
  })

  it('the colour lookup is total — unknown ids degrade to the custom palette', () => {
    for (const id of SOCIAL_STRUCTURE_VALUES) {
      expect(structureColorSet(id, false).accent).toBeTruthy()
      expect(structureColorSet(id, true).accent).toBeTruthy()
    }
    expect(structureColorSet('townhall' as never, false)).toBe(
      structureColorSet('custom', false),
    )
  })
})
