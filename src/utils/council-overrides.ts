/**
 * "Does this council deviate from plain defaults?" — the single source of
 * truth for the customization markers, so the surfaces that show them can't
 * drift on what "customized" means. `isSeatConfigCustomized` powers the
 * per-seat / Judge / Mediator dots on the council-settings roster; the
 * council-wide `councilHasOverrides` rolls those up *plus* the per-council
 * recipe (`deliberation`) bag to light the composer's council-settings dot.
 */

import type { Council, SeatConfig } from '@/types/council'

/** Any persisted per-seat override (system prompt, tools, thinking…). An
 *  all-`undefined` bag is the untouched creation state — cascades to the
 *  defaults, so it doesn't count as customized. */
export function isSeatConfigCustomized(config: SeatConfig): boolean {
  return Object.values(config).some((v) => v !== undefined)
}

/** True when *anything* about the council departs from the defaults: the
 *  per-council recipe (`deliberation`), or any seat / Judge / Mediator with a
 *  tuned config. The roster composition itself never counts — every council
 *  has one, so seating models is not an "override". */
export function councilHasOverrides(council: Council): boolean {
  const recipeOverridden =
    council.deliberation !== undefined &&
    Object.keys(council.deliberation).length > 0
  return (
    recipeOverridden ||
    council.seats.some((s) => isSeatConfigCustomized(s.config)) ||
    (council.judge !== undefined &&
      isSeatConfigCustomized(council.judge.config)) ||
    (council.mediator !== undefined &&
      isSeatConfigCustomized(council.mediator.config))
  )
}
