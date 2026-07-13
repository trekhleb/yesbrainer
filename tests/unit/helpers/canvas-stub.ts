/**
 * Minimal 2D-canvas stand-in for jsdom (which implements none of it).
 * Records draw calls so painter tests can assert *what* was drawn;
 * `measureText` approximates width so wrapping/ellipsis code paths run.
 */

import { vi } from 'vitest'

export interface CanvasRecorder {
  texts: string[]
  ops: string[]
}

export function stubCanvas(): CanvasRecorder {
  const recorder: CanvasRecorder = { texts: [], ops: [] }

  function makeCtx() {
    const record =
      (op: string) =>
      (...args: unknown[]) => {
        recorder.ops.push(op)
        if (op === 'fillText' && typeof args[0] === 'string') {
          recorder.texts.push(args[0])
        }
      }
    return {
      scale: record('scale'),
      fillRect: record('fillRect'),
      fillText: record('fillText'),
      strokeText: record('strokeText'),
      beginPath: record('beginPath'),
      closePath: record('closePath'),
      moveTo: record('moveTo'),
      lineTo: record('lineTo'),
      arcTo: record('arcTo'),
      arc: record('arc'),
      fill: record('fill'),
      stroke: record('stroke'),
      clip: record('clip'),
      save: record('save'),
      restore: record('restore'),
      drawImage: record('drawImage'),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      measureText: (text: string) => ({ width: text.length * 7 }),
      // Style properties are plain assignable fields.
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textBaseline: 'alphabetic',
      globalAlpha: 1,
      shadowColor: '',
      shadowBlur: 0,
      shadowOffsetY: 0,
    }
  }

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => makeCtx() as unknown as CanvasRenderingContext2D,
  )
  ;(
    HTMLCanvasElement.prototype as unknown as {
      toBlob: (cb: (b: Blob | null) => void) => void
    }
  ).toBlob = (cb) => cb(new Blob(['png-bytes'], { type: 'image/png' }))

  return recorder
}
