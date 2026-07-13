import { describe, expect, it } from 'vitest'
import {
  getSeatDisplayLabel,
  getSeatDisplayLabelById,
} from '@/utils/seat-label'
import { MODEL_A, MODEL_B, seat } from '../helpers/fixtures'

describe('getSeatDisplayLabel', () => {
  it('keeps the plain registry label for singleton models', () => {
    const seats = [seat('s1', MODEL_A), seat('s2', MODEL_B)]
    expect(getSeatDisplayLabel(seats[0]!, seats)).not.toMatch(/#\d/)
  })

  it('adds #N suffixes only when the model is seated more than once', () => {
    const seats = [seat('s1', MODEL_A), seat('s2', MODEL_A), seat('s3', MODEL_B)]
    expect(getSeatDisplayLabel(seats[0]!, seats)).toMatch(/#1$/)
    expect(getSeatDisplayLabel(seats[1]!, seats)).toMatch(/#2$/)
    expect(getSeatDisplayLabel(seats[2]!, seats)).not.toMatch(/#\d/)
  })
})

describe('getSeatDisplayLabelById', () => {
  const seats = [seat('s1', MODEL_A)]

  it('resolves through the roster when the seat exists', () => {
    expect(getSeatDisplayLabelById('s1', seats, MODEL_B)).toBe(
      getSeatDisplayLabel(seats[0]!, seats),
    )
  })

  it('falls back to the model id argument for removed seats', () => {
    const label = getSeatDisplayLabelById('ghost', seats, MODEL_B)
    expect(label.length).toBeGreaterThan(0)
    expect(label).not.toContain('ghost')
  })

  it('handles an undefined seat id (events without seats)', () => {
    expect(getSeatDisplayLabelById(undefined, seats, MODEL_A).length).toBeGreaterThan(0)
  })
})
