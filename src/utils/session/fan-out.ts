import type { Seat } from '@/types/council'
import type { PerSeatStream } from '@/types/session'

/**
 * Seed the per-seat state machine for a parallel answer fan-out: every
 * seat starts `streaming` with empty output. Shared by the round-1
 * Participant fan-out and the Consensus re-answer rounds so the two
 * can't drift on the initial shape.
 */
export function seedPerSeatStreams(
  seats: readonly Seat[],
): Record<string, PerSeatStream> {
  const initial: Record<string, PerSeatStream> = {}
  for (const seat of seats) {
    initial[seat.id] = {
      status: 'streaming',
      error: null,
      output: '',
      modelId: seat.modelId,
    }
  }
  return initial
}

/**
 * Run one async task per seat in parallel and collect the outcomes.
 * `Promise.allSettled` is the load-bearing choice: one seat's failure
 * must never kill its siblings mid-stream. A rejected task (a bug —
 * runners return typed errors rather than throwing) drops out of the
 * result; everything the caller needs to persist must come back through
 * `run`'s resolved value.
 */
export async function fanOutSeats<R>(
  seats: readonly Seat[],
  run: (seat: Seat) => Promise<R>,
): Promise<Array<{ seat: Seat; result: R }>> {
  const settled = await Promise.allSettled(
    seats.map(async (seat) => ({ seat, result: await run(seat) })),
  )
  const outcomes: Array<{ seat: Seat; result: R }> = []
  for (const s of settled) {
    if (s.status === 'fulfilled') outcomes.push(s.value)
  }
  return outcomes
}
