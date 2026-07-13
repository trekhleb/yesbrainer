/**
 * The shareable verdict card — a canvas-rendered PNG
 * of one council result: the question, the roster, how the deliberation
 * ran, and the synthesis excerpt. People don't share apps, they share
 * artifacts; this is the artifact ("3 AI models deliberated — here's the
 * ruling"), and it carries the brand every time it's posted.
 *
 * Split: `data.ts` builds the payload (pure, per-structure business
 * logic), `paint.ts` renders it (canvas + asset rasterization). Loaded
 * via dynamic `import()` from the share modal only — the painter pulls
 * `react-dom/server`, which has no business in the main chunk.
 */

export {
  buildShareCardData,
  buildShareText,
  shareCardFilename,
  verdictExcerpt,
  type ShareCardColumn,
  type ShareCardData,
  type ShareCardScore,
  type ShareCardSeat,
} from './data'
export { renderShareCard } from './paint'
