import { redactSecrets } from '@/utils/redact-secrets'

/**
 * Best-effort coercion of whatever the provider / AI SDK hands us into a
 * human-readable string. The shapes vary widely: native `Error`, AISDKError
 * subclasses, `{ error: { message } }` envelopes, plain strings, sometimes
 * just an object that needs JSON-stringifying. Centralised here so every
 * streamer / generator handles errors the same way.
 *
 * **Always redacted.** Provider errors can serialize the failing request,
 * including its auth header — and this string is persisted to the turn
 * event (and included in exports). Every return path runs through
 * `redactSecrets` so a key can never ride out inside an error message.
 */
export function extractErrorMessage(err: unknown): string {
  return redactSecrets(extractRaw(err))
}

/**
 * Console-log a provider/SDK failure with secrets scrubbed. The raw error
 * object must never reach the console: AI SDK `APICallError`s can carry the
 * failing request — headers (the user's API key) included — and "open the
 * console and paste what you see" is a standard bug-report ask, i.e. the one
 * leak channel the persisted-path redaction in `extractErrorMessage` doesn't
 * cover. Logs a redacted name/message line (+ the provider's response body
 * when present, truncated — that's the part actually useful for debugging)
 * instead of the object. `site` keeps the line greppable per the logging
 * discipline; pass `modelId` whenever a model is involved.
 */
export function logRedactedError(
  site: string,
  err: unknown,
  modelId?: string,
): void {
  console.warn(
    `[${site}]${modelId ? ` ${modelId}` : ''}:`,
    redactSecrets(describeForLog(err)),
  )
}

function describeForLog(err: unknown): string {
  if (err instanceof Error) {
    const parts = [`${err.name}: ${err.message}`]
    const body = (err as { responseBody?: unknown }).responseBody
    if (typeof body === 'string' && body) parts.push(body.slice(0, 2_000))
    const cause = (err as { cause?: unknown }).cause
    if (cause instanceof Error && cause.message) {
      parts.push(`cause: ${cause.message}`)
    }
    return parts.join(' | ')
  }
  return extractRaw(err)
}

function extractRaw(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  if (err && typeof err === 'object') {
    const obj = err as Record<string, unknown>
    if (typeof obj.message === 'string' && obj.message) return obj.message
    if (typeof obj.error === 'string' && obj.error) return obj.error
    if (obj.error && typeof obj.error === 'object') {
      const inner = obj.error as Record<string, unknown>
      if (typeof inner.message === 'string' && inner.message) {
        return inner.message
      }
    }
    if (typeof obj.cause === 'object' && obj.cause) {
      const cause = obj.cause as Record<string, unknown>
      if (typeof cause.message === 'string' && cause.message) {
        return cause.message
      }
    }
    try {
      return JSON.stringify(err)
    } catch {
      return 'Unknown error'
    }
  }
  return String(err)
}
