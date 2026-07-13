/**
 * Image-attachment processing: File → base64 `data:image/…` URI, with
 * client-side downscale + recompression on attach (replaced a hard
 * "over 1 MB" rejection that made users resize phone screenshots by hand).
 *
 * Why these numbers:
 *  - **2048 px longest edge.** Providers downscale server-side anyway —
 *    Anthropic's standard tier to 1568 px, its high-res tier (Opus 4.7+/
 *    Sonnet 5) to 2576 px, Gemini/OpenAI in between — so pixels past ~2k
 *    are dead weight in storage and upload. 2048 keeps screenshots crisp
 *    for the high-res tier at roughly half its max visual-token cost.
 *  - **WebP q0.85, JPEG fallback.** WebP encodes UI text cleanly at 0.85;
 *    Safari's canvas can't encode WebP, so it falls back to JPEG (drawn on
 *    a white matte — JPEG has no alpha, and transparent PNGs would
 *    otherwise composite onto black).
 *  - **Quality ladder.** If the encode still busts the budget, retry at
 *    (1568, 0.8) then (1280, 0.7) before giving up — an error should mean
 *    "genuinely couldn't", not "first try was 2% over".
 *  - **~1.5 MiB encoded budget per image.** Bounds a worst-case turn at
 *    ~15 MB in IndexedDB (images are stored inline on the turn row and
 *    re-sent to vision seats with history every following turn).
 *  - **Pass-through for already-small images** (provider-supported format,
 *    ≤ 1 MiB, ≤ 2048 px): no generational recompression of images that
 *    were fine as-is.
 */

export const MAX_IMAGES_PER_TURN = 10

/** Encoded data-URI budget per image (chars ≈ bytes). */
const MAX_DATA_URI_CHARS = 1_572_864 // 1.5 MiB
/** Refuse to even decode monster files — a decode-bomb guard, not a UX cap. */
const MAX_INPUT_BYTES = 52_428_800 // 50 MiB
/** Small-enough originals skip processing entirely (raw bytes). */
const PASSTHROUGH_MAX_BYTES = 1_048_576 // 1 MiB
/** Formats every provider accepts as-is; anything else gets transcoded. */
const PASSTHROUGH_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
])

const TARGET_EDGE = 2048
/** Downscale/quality ladder — first rung that fits the budget wins. */
const ENCODE_LADDER = [
  { edge: 2048, quality: 0.85 },
  { edge: 1568, quality: 0.8 },
  { edge: 1280, quality: 0.7 },
] as const

/** Raw FileReader path — used for pass-through and by tests. */
function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result === 'string') resolve(result)
      else reject(new Error('FileReader produced non-string result'))
    }
    reader.onerror = () =>
      reject(reader.error ?? new Error('FileReader failed'))
    reader.readAsDataURL(file)
  })
}

/**
 * Attach-time pipeline: decode → (maybe) downscale → (maybe) recompress.
 * Resolves to a `data:image/…` URI within the encoded budget; rejects with
 * a user-presentable message on decode failure or an unshrinkable image.
 */
export async function attachImageAsDataUri(file: File): Promise<string> {
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error(`"${file.name}" is too large to process (over 50 MB)`)
  }

  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    try {
      await img.decode()
    } catch {
      throw new Error(`Couldn't read "${file.name}" as an image`)
    }
    const w = img.naturalWidth
    const h = img.naturalHeight
    if (w === 0 || h === 0) {
      throw new Error(`Couldn't read "${file.name}" as an image`)
    }

    if (
      PASSTHROUGH_TYPES.has(file.type) &&
      file.size <= PASSTHROUGH_MAX_BYTES &&
      Math.max(w, h) <= TARGET_EDGE
    ) {
      return await fileToDataUri(file)
    }

    for (const { edge, quality } of ENCODE_LADDER) {
      const uri = encodeScaled(img, w, h, edge, quality)
      if (uri && uri.length <= MAX_DATA_URI_CHARS) return uri
    }
    throw new Error(`Couldn't shrink "${file.name}" enough to attach`)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Draw at ≤`edge` px on the long side (never upscales) and encode as
 *  WebP, falling back to JPEG where canvas WebP-encode is unsupported
 *  (Safari signals that by silently returning a PNG URI). */
function encodeScaled(
  img: HTMLImageElement,
  w: number,
  h: number,
  edge: number,
  quality: number,
): string | null {
  const scale = Math.min(1, edge / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w * scale))
  canvas.height = Math.max(1, Math.round(h * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  // White matte for the JPEG fallback — JPEG has no alpha channel and
  // transparency would otherwise render black. Invisible under WebP.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const webp = canvas.toDataURL('image/webp', quality)
  if (webp.startsWith('data:image/webp')) return webp
  return canvas.toDataURL('image/jpeg', quality)
}
