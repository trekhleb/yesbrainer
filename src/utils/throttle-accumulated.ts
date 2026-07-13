/**
 * Rate-limit a streaming "full accumulated text" callback.
 *
 * Provider text streams emit 50–100+ deltas/sec. Forwarding every delta to
 * React drives a full thread re-render **and** a from-scratch markdown re-parse
 * (remark → Shiki → sanitize → KaTeX) of the growing message on every token —
 * work that grows quadratically over a long answer and multiplies by the number
 * of seats streaming in parallel. Coalescing to at most one emit per
 * `intervalMs` (~16 fps at 60 ms) is well under human reading speed and cuts
 * that downstream work ~5–10× with no perceptible lag.
 *
 * Contract: call `push(acc)` for each delta, then `flush(acc)` exactly once when
 * the stream ends so the final text is never dropped by the rate limit. Leading
 * edge fires immediately (the first token shows with no delay), and `push`
 * always carries the *full* accumulated string, so a skipped intermediate frame
 * is simply superseded by the next — never lost.
 *
 * (The council orchestrator also writes the authoritative `result.text` when a
 * seat finishes, so a dropped trailing frame would be cosmetic even without
 * `flush` — but flushing keeps this streaming primitive correct on its own,
 * independent of its caller.)
 */
export function throttleAccumulated(
  emit: (value: string) => void,
  intervalMs = 60,
): { push: (value: string) => void; flush: (value: string) => void } {
  // −∞ so the very first push always clears the interval gate (leading edge),
  // independent of the absolute clock value.
  let lastAt = Number.NEGATIVE_INFINITY
  let lastValue: string | null = null
  return {
    push(value: string) {
      const now = Date.now()
      if (now - lastAt < intervalMs) return
      lastAt = now
      lastValue = value
      emit(value)
    },
    flush(value: string) {
      // Idempotent: skip if the leading/interval emit already sent this exact
      // value, so the end-of-stream flush can't double-fire the last frame.
      if (value === lastValue) return
      lastValue = value
      emit(value)
    },
  }
}
