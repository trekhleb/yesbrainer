import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadJson } from '@/utils/download-json'
import {
  parseDimensions,
  serializeDimensions,
} from '@/utils/dimensions-serde'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('downloadJson', () => {
  it('creates an anchor with the filename and clicks it', () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})
    downloadJson({ a: 1 }, 'export.json')
    expect(click).toHaveBeenCalledOnce()
    // The anchor was appended + removed; nothing lingers in the DOM.
    expect(document.querySelector('a[download]')).toBeNull()
  })
})

describe('dimensions serde', () => {
  it('round-trips name / name:description lines', () => {
    const dims = [
      { name: 'accuracy', description: 'is it right?' },
      { name: 'tone' },
    ]
    const text = serializeDimensions(dims)
    expect(text).toBe('accuracy: is it right?\ntone')
    expect(parseDimensions(text)).toEqual(dims)
  })

  it('skips blank lines and nameless entries on parse', () => {
    expect(parseDimensions('\n  \naccuracy\n: orphaned\ntone: warm')).toEqual([
      { name: 'accuracy' },
      { name: 'tone', description: 'warm' },
    ])
  })
})
