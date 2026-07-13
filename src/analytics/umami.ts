import type {
  ActionEvent,
  AnalyticsProvider,
  PageviewEvent,
} from './analytics'

/**
 * Envelope for Umami's collect API (the self-hosted instance's `/api/send`,
 * fronted by Caddy on a neutral path). Visitor counting happens server-side
 * (salted IP+UA hash) — the client stores nothing and sends no identifier,
 * which is what keeps the app cookie- and consent-banner-free. A payload
 * with `name` counts as a custom event; without it, a pageview.
 */
type UmamiEnvelope = {
  type: 'event'
  payload: {
    website: string
    url: string
    hostname: string
    language: string
    screen: string
    referrer?: string
    name?: string
  }
}

export function createUmamiProvider(
  endpoint: string,
  websiteId: string,
): AnalyticsProvider {
  const send = (event: PageviewEvent | ActionEvent): void => {
    try {
      const envelope: UmamiEnvelope = {
        type: 'event',
        payload: {
          website: websiteId,
          url: event.path,
          hostname: event.hostname,
          language: event.language,
          screen: event.screen,
          ...('referrer' in event && event.referrer !== undefined
            ? { referrer: event.referrer }
            : {}),
          ...('name' in event ? { name: event.name } : {}),
        },
      }
      // Fire-and-forget by contract: nothing awaits this, no retries, no
      // queue — losing an event is always acceptable, slowing the app never
      // is. `keepalive` lets an event survive tab close / the wipe-everything
      // reload; the timeout keeps an unreachable collector from holding a
      // socket open.
      void fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(envelope),
        credentials: 'omit',
        keepalive: true,
        signal: AbortSignal.timeout(10_000),
      }).catch(() => {
        // Collector down / offline / adblocked — all equivalent, all
        // silent. The browser prints its own network line; the app doesn't.
      })
    } catch {
      // Synchronous throws (CSP block, a browser without
      // AbortSignal.timeout) must not escape either.
    }
  }
  return { trackPageview: send, trackEvent: send }
}
