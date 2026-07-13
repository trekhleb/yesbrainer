import {
  Analytics,
  consoleProvider,
  nullProvider,
  type AnalyticsProvider,
} from './analytics'
import { createUmamiProvider } from './umami'

/**
 * Composition root: the provider is decided once, from build-time env.
 *
 *  - `VITE_ANALYTICS_ENDPOINT` + `VITE_ANALYTICS_WEBSITE_ID` set → Umami
 *    provider. The official deploy injects them as CI variables (see
 *    `deploy.yml`); they are never committed, so a fork that just builds
 *    the repo gets no endpoint — and no analytics origin in its CSP
 *    (`vite.config.ts` adds it only when the env is present).
 *  - dev server without them → console provider: events visible in
 *    devtools, nothing sent. Live end-to-end testing from localhost is an
 *    explicit opt-in — both vars in `.env.local`, pointed at the *dev*
 *    website id, so test traffic never lands in production stats.
 *  - everything else (fork builds, unit tests) → null provider.
 */
export function resolveProvider(env: {
  endpoint: string | undefined
  websiteId: string | undefined
  dev: boolean
  test: boolean
}): AnalyticsProvider {
  if (env.test) return nullProvider
  if (env.endpoint && env.websiteId) {
    return createUmamiProvider(env.endpoint, env.websiteId)
  }
  return env.dev ? consoleProvider : nullProvider
}

export const analytics = new Analytics(
  resolveProvider({
    endpoint: import.meta.env.VITE_ANALYTICS_ENDPOINT,
    websiteId: import.meta.env.VITE_ANALYTICS_WEBSITE_ID,
    dev: import.meta.env.DEV,
    test: import.meta.env.MODE === 'test',
  }),
)
