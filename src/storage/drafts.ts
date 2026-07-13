/**
 * Per-council composer draft — the unsent prompt text, kept so a tab
 * discard / refresh / accidental navigation doesn't lose a half-written
 * question (Chrome discards backgrounded tabs and reloads on return).
 *
 * Mirrors `run-options.ts`: composer *state* lives in per-device
 * localStorage (`yesbrainer:draft:<councilId>`), council *data* lives in
 * Dexie. Absent key = no draft. Seeded into the Composer on mount
 * (CouncilView remounts per council — app keys it by id) and cleared on
 * send or when the field goes empty.
 *
 * **Text only** — image attachments are deliberately NOT persisted (base64
 * photos would blow the ~5 MB localStorage quota; they'd belong in Dexie if
 * ever wanted). Like run-options, the key isn't cleaned up on council delete
 * — a few orphaned bytes beat coupling the council store to composer state,
 * and the factory reset's `yesbrainer:*` prefix sweep clears it regardless.
 */

const KEY_PREFIX = 'yesbrainer:draft:'

export function getDraft(councilId: string): string {
  try {
    return localStorage.getItem(KEY_PREFIX + councilId) ?? ''
  } catch {
    return ''
  }
}

export function setDraft(councilId: string, text: string): void {
  try {
    // All-whitespace counts as empty — drop the key so absence stays
    // unambiguous (and "erase to empty" flushes the draft, as intended).
    if (text.trim().length === 0) {
      localStorage.removeItem(KEY_PREFIX + councilId)
      return
    }
    localStorage.setItem(KEY_PREFIX + councilId, text)
  } catch {
    // Quota / private-mode: lose the draft, never block the keystroke or send.
  }
}
