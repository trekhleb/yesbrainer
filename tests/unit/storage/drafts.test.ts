import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDraft, setDraft } from '@/storage/drafts'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('composer drafts', () => {
  it('returns an empty string when no draft is stored', () => {
    expect(getDraft('c1')).toBe('')
  })

  it('round-trips a draft verbatim, preserving internal whitespace', () => {
    setDraft('c1', '  line one\n\nline two  ')
    expect(getDraft('c1')).toBe('  line one\n\nline two  ')
  })

  it('keys drafts per council', () => {
    setDraft('c1', 'first council')
    setDraft('c2', 'second council')
    expect(getDraft('c1')).toBe('first council')
    expect(getDraft('c2')).toBe('second council')
  })

  it('drops the key when the draft is emptied or whitespace-only', () => {
    setDraft('c1', 'something')
    expect(localStorage.getItem('yesbrainer:draft:c1')).not.toBeNull()
    setDraft('c1', '   \n ')
    expect(localStorage.getItem('yesbrainer:draft:c1')).toBeNull()
    expect(getDraft('c1')).toBe('')
  })

  it('never throws when storage rejects the write (quota / private mode)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => setDraft('c1', 'unsaveable')).not.toThrow()
  })

  it('degrades to empty when reading throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(getDraft('c1')).toBe('')
  })
})
