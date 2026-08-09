/**
 * Telling "the browser took the page away" apart from "the provider failed".
 *
 * When iOS suspends a locked phone (or a desktop tab is discarded), every
 * in-flight provider stream has its transport torn out from under it. The
 * rejections that surface are ordinary network `TypeError`s, so without this
 * the app persists them as errored events and shows a wall of red — the
 * council reads as broken when nothing about it failed.
 *
 * An interruption is *not an error*: the call never got an answer, so the
 * honest record is no record at all. Callers drop the event entirely, which
 * leaves the slot empty and lets `remaining-work.ts` pick it up on resume.
 *
 * Note that a lost connection counts as an interruption whether or not the
 * page was hidden — resuming is the right response to a dropped transport
 * either way. Visibility only decides which *explanation* the user reads,
 * and both are mechanisms rather than diagnoses: neither claims to know why
 * the network went away.
 */

/**
 * Transport-level failure strings across the engines the app runs on.
 * Matched against the whole message because the runners embed it in a
 * larger sentence (`describeProviderFailure`).
 *
 * Deliberately excluded: `aborted` / `AbortError`. A user pressing Stop
 * produces those too, and the runners already report that separately via
 * their `aborted` flag — folding it in here would turn every deliberate
 * cancel into an offer to resume.
 */
const NETWORK_ERROR_PATTERNS: readonly RegExp[] = [
  /load failed/i, // Safari fetch
  /the network connection was lost/i, // Safari / iOS
  /failed to fetch/i, // Chromium fetch
  /networkerror when attempting to fetch/i, // Firefox
  /network (?:error|request failed)/i,
  /connection (?:closed|reset|refused|terminated)/i,
  /err_(?:network_changed|internet_disconnected|connection_closed)/i,
  /socket hang up/i,
]

export function isNetworkClassError(message: string): boolean {
  return NETWORK_ERROR_PATTERNS.some((re) => re.test(message))
}

/** Why a call is being treated as interrupted — picks the user-facing
 *  explanation, never the recovery behaviour (both resume identically). */
export type InterruptionCause = 'backgrounded' | 'connection'

export interface VisibilityWatch {
  /** Epoch ms of the most recent `hidden` transition, or 0 if the page has
   *  stayed visible for this watch's whole lifetime. */
  lastHiddenAt: () => number
  dispose: () => void
}

/**
 * Track when the page was last hidden.
 *
 * Reading `document.visibilityState` at failure time doesn't work: by the
 * moment a suspended page resumes and its promises reject, the page is
 * visible again. Only a recorded transition can answer "was this call in
 * flight while we were away?".
 */
export function watchVisibility(): VisibilityWatch {
  let hiddenAt = 0
  const onChange = () => {
    if (document.visibilityState === 'hidden') hiddenAt = Date.now()
  }
  // A run can be started by a page that is already hidden (an auto-resume
  // racing the foreground transition), so seed from the current state
  // instead of waiting for an edge that already happened.
  onChange()
  document.addEventListener('visibilitychange', onChange)
  return {
    lastHiddenAt: () => hiddenAt,
    dispose: () => document.removeEventListener('visibilitychange', onChange),
  }
}

/**
 * Classify a failed provider call. `null` means a genuine failure that the
 * user should see as an error.
 *
 * `startedAt` is when *this call* was issued, so a page that was hidden
 * earlier in a long run doesn't retroactively excuse a later, real failure.
 */
export function classifyInterruption(args: {
  error: string | undefined
  startedAt: number
  watch: Pick<VisibilityWatch, 'lastHiddenAt'>
}): InterruptionCause | null {
  const { error, startedAt, watch } = args
  if (!error || !isNetworkClassError(error)) return null
  return watch.lastHiddenAt() >= startedAt ? 'backgrounded' : 'connection'
}
