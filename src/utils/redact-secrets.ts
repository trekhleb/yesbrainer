/**
 * Scrub API keys / bearer tokens out of a string before it's stored or
 * shown. Provider SDK errors sometimes serialize the failing request —
 * including its `Authorization: Bearer sk-…` / `x-api-key` header — and that
 * string lands in a turn event's `error` field (persisted to IndexedDB and
 * included in exports) and in the UI. A user sharing an export must never
 * ship their key inside an error message.
 *
 * Two layers, applied in order:
 *  1. **Exact configured values** — redact the literal key strings the user
 *     actually configured (from localStorage). Strongest guarantee: it
 *     doesn't rely on recognizing a format, only on matching what we hold.
 *  2. **Known key/token shapes** — a pattern net for anything key-like the
 *     first layer might miss (a rotated key still echoed by the provider, a
 *     token from a header). Deliberately broad; false positives only cost a
 *     `[redacted]` in an already-failed error string.
 *
 * Pure and dependency-light so it can wrap every error-to-string path.
 */

import { getApiKeys } from '@/storage/keys'

const REDACTED = '[redacted]'

// Provider key + bearer-token shapes. Anchored on distinctive prefixes so we
// don't nuke ordinary prose. Case-insensitive on the header keywords only.
const KEY_PATTERNS: RegExp[] = [
  // OpenAI / OpenRouter / Groq project + legacy keys: sk-…, sk-ant-…, sk-or-…, sk-proj-…
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  // Groq: gsk_…
  /\bgsk_[A-Za-z0-9]{16,}\b/g,
  // Google AI Studio: AIza…
  /\bAIza[A-Za-z0-9_-]{20,}\b/g,
  // OpenRouter: sk-or-v1-… already covered by sk-, but catch the bare form too.
  /\bor-[A-Za-z0-9]{16,}\b/g,
  // Authorization / x-api-key header values (JSON- or header-serialized).
  /(bearer\s+)[A-Za-z0-9._-]{12,}/gi,
  /(("?(?:authorization|x-api-key|api[_-]?key)"?\s*[:=]\s*"?))[A-Za-z0-9._-]{12,}/gi,
]

export function redactSecrets(input: string): string {
  if (!input) return input
  let out = input

  // 1. Exact configured key values — the strongest, format-independent pass.
  // Sort longest-first so a key that's a prefix of another can't leave a tail.
  const values = Object.values(getApiKeys())
    .filter((v): v is string => !!v && v.length >= 8)
    .sort((a, b) => b.length - a.length)
  for (const value of values) {
    out = out.split(value).join(REDACTED)
  }

  // 2. Pattern net for anything key-shaped the first pass didn't cover.
  for (const pattern of KEY_PATTERNS) {
    // For group-less patterns the replacer's second argument is the match
    // *offset* (a number), not a capture — only a string is a real prefix
    // to preserve (the `bearer ` / header-name groups above).
    out = out.replace(pattern, (_m, prefix?: unknown) =>
      typeof prefix === 'string' ? `${prefix}${REDACTED}` : REDACTED,
    )
  }

  return out
}
