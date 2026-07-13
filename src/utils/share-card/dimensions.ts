/**
 * The share card's fixed output size. The painter (`paint.ts`) always
 * rasterizes to exactly these dimensions — the verdict text is clamped to
 * fit, the canvas is never resized — so the aspect ratio is known ahead of
 * the render.
 *
 * Kept in its own tiny, dependency-free module (not inside `paint.ts`) so the
 * share modal can reserve the exact preview box *eagerly*, before the heavy
 * painter chunk loads. Pulling these numbers from `paint.ts` would drag
 * `react-dom/server` into the main bundle and defeat the lazy split.
 */

export const SHARE_CARD_WIDTH = 1200
export const SHARE_CARD_HEIGHT = 900

/**
 * `width / height` as a CSS `aspect-ratio` value, derived from the constants
 * above so a reserved layout box can never drift from the real output. The
 * modal pins both the loading placeholder and the rendered `<img>` to this,
 * so swapping the decoded PNG in causes no reflow ("height blink").
 */
export const SHARE_CARD_ASPECT_RATIO = `${SHARE_CARD_WIDTH} / ${SHARE_CARD_HEIGHT}`
