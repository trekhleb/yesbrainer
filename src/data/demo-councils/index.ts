/**
 * Demo-council inventory — **this folder IS the inventory** (see README.md
 * next to this file for the full workflow).
 *
 * Every `*.json` here is one demo council in the app's own export format:
 * either a bare council object, or the v1 export envelope
 * (`{version: 1, councils: [...]}`) exactly as downloaded from the sidebar
 * kebab → Export or Settings → Storage → Export. Files are picked up by
 * glob — add a file to add a demo, delete a file to remove one, overwrite
 * to replace. **Filename sort order = sidebar order, top to bottom**: the
 * FIRST file (lowest numeric prefix) sits on top. The bundle stamps
 * descending `createdAt` by file order and the import preserves it, so
 * the folder listing reads exactly like the sidebar.
 *
 * `isDemo: true` is stamped here on every council regardless of what the
 * file says, so raw unedited exports work. Content is NOT validated here —
 * the seeder pushes the bundle through the same zod-validated import path
 * user backups use, which reports per-council errors at seed time.
 *
 * This module is loaded via dynamic `import()` from the seeder only, so
 * the JSON payloads (including any base64 photos in image demos) stay out
 * of the main JS chunk.
 */

import type { CouncilBundleV1 } from '@/storage/transfer'
import type { Council } from '@/types/council'

const files = import.meta.glob('./*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>

/** A file is either a bare council or a v1 export envelope. */
function councilsOf(fileData: unknown): unknown[] {
  if (
    fileData &&
    typeof fileData === 'object' &&
    Array.isArray((fileData as { councils?: unknown[] }).councils)
  ) {
    return (fileData as { councils: unknown[] }).councils
  }
  return [fileData]
}

/** Fixed epoch safely in the past: seeded demos must sort *below* anything
 *  the user creates themselves (a new council gets `Date.now()`). */
const DEMO_EPOCH = Date.UTC(2026, 0, 1)
const DEMO_STEP_MS = 60_000

export function demoCouncilBundle(): CouncilBundleV1 {
  const councils = Object.keys(files)
    .sort()
    .flatMap((path) => councilsOf(files[path]))
    .map((c, i) => ({
      ...(c as Council),
      // Honest labeling is non-negotiable for seeded recordings — stamp the
      // flag even when a raw export lacks it. The zod import validates the
      // rest of the shape downstream.
      isDemo: true,
      // The order knob: first file → newest stamp → top of the sidebar
      // (import preserves `createdAt`; see `importCouncils`). Overrides
      // whatever recording-time stamp the export carries, so file order is
      // the single source of demo order.
      createdAt: DEMO_EPOCH - i * DEMO_STEP_MS,
    }))
  return { version: 1, exportedAt: Date.now(), councils }
}
