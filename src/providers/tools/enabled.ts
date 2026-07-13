import { getAvailableToolNamesForEntry } from '@/providers/tools'
import { getModel } from '@/models/registry'
import type { Seat } from '@/types/council'

/**
 * Single source of truth for "which tools does this seat use on this
 * turn". Returns the **filtered list** of tool names
 * the orchestrator should attach to `streamText({ tools })` — empty
 * `[]` means "no tools this turn", which the runner translates into
 * skipping the `tools` param entirely.
 *
 * Three layers gate the decision, in order:
 *
 *   1. **Per-message** — `skipOverride` from the composer's "no tools
 *      this turn" toggle. When true, returns `[]` regardless of the
 *      seat / model.
 *   2. **Capability** — `getAvailableToolNamesForEntry(entry)`. Defends
 *      against a stored seat whose model was later swapped to a
 *      non-tools entry (returns `[]` for it).
 *   3. **Per-seat** — `seat.config.tools`:
 *        - `undefined` / `true` → every available tool (default).
 *        - `false`              → none.
 *        - `string[]`           → allow-list (intersect with
 *                                  available; unknown names dropped).
 *
 * Two consumers: the orchestrator (passes the result to
 * `buildToolsForEntry(entry, names)`), and the seat-config modal
 * (uses the available list to render the checkbox state).
 */
export function getEnabledToolNamesForSeat(
  seat: Seat,
  skipOverride = false,
): string[] {
  if (skipOverride) return []
  const entry = getModel(seat.modelId)
  const available = getAvailableToolNamesForEntry(entry)
  if (available.length === 0) return []
  const config = seat.config.tools
  if (config === false) return []
  if (config === undefined || config === true) return available
  // Allow-list — intersect with available, preserve `available`'s
  // canonical order so the ToolSet keys come out predictable.
  return available.filter((name) => config.includes(name))
}
