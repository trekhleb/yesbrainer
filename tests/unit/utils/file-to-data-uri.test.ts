import { afterEach, describe, expect, it, vi } from 'vitest'
import { attachImageAsDataUri } from '@/utils/file-to-data-uri'
import { stubCanvas } from '../helpers/canvas-stub'

/** A File whose FileReader path yields a fixed data URI. */
function imageFile(name: string, type: string, size: number): File {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

/** Make `new Image()` resolve decode with the given natural dimensions. */
function stubImage(w: number, h: number, fail = false): void {
  class FakeImage {
    naturalWidth = w
    naturalHeight = h
    set src(_v: string) {}
    decode(): Promise<void> {
      return fail ? Promise.reject(new Error('bad')) : Promise.resolve()
    }
  }
  vi.stubGlobal('Image', FakeImage)
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('attachImageAsDataUri', () => {
  it('refuses monster files before decoding (decode-bomb guard)', async () => {
    await expect(
      attachImageAsDataUri(imageFile('huge.png', 'image/png', 60_000_000)),
    ).rejects.toThrow('too large to process')
  })

  it('passes a small supported image straight through FileReader', async () => {
    stubImage(800, 600)
    vi.stubGlobal(
      'FileReader',
      class {
        result = 'data:image/png;base64,SMALL'
        onload: (() => void) | null = null
        onerror: (() => void) | null = null
        readAsDataURL(): void {
          this.onload?.()
        }
      },
    )
    const uri = await attachImageAsDataUri(
      imageFile('small.png', 'image/png', 500_000),
    )
    expect(uri).toBe('data:image/png;base64,SMALL')
  })

  it('transcodes an unsupported format through the canvas ladder', async () => {
    stubImage(3000, 2000)
    const recorder = stubCanvas()
    // Make the webp encode succeed within budget.
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
      'data:image/webp;base64,AAA',
    )
    const uri = await attachImageAsDataUri(
      imageFile('shot.bmp', 'image/bmp', 5_000_000),
    )
    expect(uri).toBe('data:image/webp;base64,AAA')
    // It actually drew onto the scaled canvas.
    expect(recorder.ops).toContain('drawImage')
  })

  it('rejects an undecodable file with a friendly message', async () => {
    stubImage(0, 0, true)
    await expect(
      attachImageAsDataUri(imageFile('broken.png', 'image/png', 5_000_000)),
    ).rejects.toThrow("Couldn't read")
  })

  it('gives up when nothing on the ladder fits the budget', async () => {
    stubImage(4000, 4000)
    stubCanvas()
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
      'data:image/webp;base64,' + 'A'.repeat(2_000_000),
    )
    await expect(
      attachImageAsDataUri(imageFile('big.bmp', 'image/bmp', 5_000_000)),
    ).rejects.toThrow("Couldn't shrink")
  })

  it('rejects when the FileReader yields a non-string result', async () => {
    stubImage(800, 600)
    vi.stubGlobal(
      'FileReader',
      class {
        result: unknown = new ArrayBuffer(4)
        onload: (() => void) | null = null
        onerror: (() => void) | null = null
        readAsDataURL(): void {
          this.onload?.()
        }
      },
    )
    await expect(
      attachImageAsDataUri(imageFile('small.png', 'image/png', 500_000)),
    ).rejects.toThrow('non-string result')
  })

  it('rejects when the FileReader errors', async () => {
    stubImage(800, 600)
    vi.stubGlobal(
      'FileReader',
      class {
        result = ''
        error = new Error('disk gone')
        onload: (() => void) | null = null
        onerror: (() => void) | null = null
        readAsDataURL(): void {
          this.onerror?.()
        }
      },
    )
    await expect(
      attachImageAsDataUri(imageFile('small.png', 'image/png', 500_000)),
    ).rejects.toThrow('disk gone')
  })

  it('rejects a file that decodes to zero dimensions', async () => {
    // decode() resolves, but the image has no pixels (corrupt/empty).
    stubImage(0, 0, false)
    await expect(
      attachImageAsDataUri(imageFile('empty.png', 'image/png', 5_000_000)),
    ).rejects.toThrow("Couldn't read")
  })

  it('falls back to JPEG where the canvas cannot encode WebP (Safari)', async () => {
    stubImage(3000, 2000)
    const recorder = stubCanvas()
    // Safari signals no-WebP by returning a PNG URI from the webp request;
    // the encoder then retries as JPEG.
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(
      (type?: string) =>
        type === 'image/jpeg'
          ? 'data:image/jpeg;base64,JJJ'
          : 'data:image/png;base64,PPP',
    )
    const uri = await attachImageAsDataUri(
      imageFile('shot.bmp', 'image/bmp', 5_000_000),
    )
    expect(uri).toBe('data:image/jpeg;base64,JJJ')
    expect(recorder.ops).toContain('drawImage')
  })
})
