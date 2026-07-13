import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  Analytics,
  ANALYTICS_DISABLED_KEY,
  consoleProvider,
  nullProvider,
  routePattern,
  type ActionEvent,
  type AnalyticsProvider,
  type PageviewEvent,
} from '@/analytics/analytics'
import { createUmamiProvider } from '@/analytics/umami'
import { resolveProvider } from '@/analytics'

function captureProvider() {
  const events: PageviewEvent[] = []
  const actions: ActionEvent[] = []
  const provider: AnalyticsProvider = {
    trackPageview: (event) => events.push(event),
    trackEvent: (event) => actions.push(event),
  }
  return { events, actions, provider }
}

const SAMPLE_EVENT: PageviewEvent = {
  path: '/about',
  hostname: 'yesbrainer.ai',
  language: 'en-US',
  screen: '1920x1080',
}

describe('routePattern', () => {
  it('collapses pathnames to the closed pattern set', () => {
    expect(routePattern('/')).toBe('/')
    expect(routePattern('/about')).toBe('/about')
    expect(routePattern('/settings')).toBe('/settings')
    expect(routePattern('/council/abc-123')).toBe('/council/:id')
  })

  it('passes known settings tabs as literals; unknown ones stay a pattern', () => {
    expect(routePattern('/settings/keys')).toBe('/settings/keys')
    expect(routePattern('/settings/storage')).toBe('/settings/storage')
    expect(routePattern('/settings/appearance')).toBe('/settings/appearance')
    expect(routePattern('/settings/councils')).toBe('/settings/councils')
    // User-typed / crafted tab slugs never pass through as-is.
    expect(routePattern('/settings/sk-ant-oops')).toBe('/settings/:tab')
    expect(routePattern('/settings/KEYS')).toBe('/settings/:tab')
  })

  it('never passes an unknown shape through', () => {
    // Crafted / mistyped URLs must not become payload content.
    expect(routePattern('/council/abc/extra')).toBe('/other')
    expect(routePattern('/settings/keys/deep')).toBe('/other')
    expect(routePattern('/sk-ant-oops')).toBe('/other')
    expect(routePattern('')).toBe('/other')
  })
})

describe('Analytics', () => {
  it('tracks patterns, not raw pathnames', () => {
    const { events, provider } = captureProvider()
    new Analytics(provider).pageview('/council/super-secret-id')
    expect(events).toHaveLength(1)
    expect(events[0]?.path).toBe('/council/:id')
    // The raw id must appear nowhere in the payload.
    expect(JSON.stringify(events[0])).not.toContain('super-secret-id')
  })

  it('dedupes repeated pathnames (StrictMode double-effects)', () => {
    const { events, provider } = captureProvider()
    const analytics = new Analytics(provider)
    analytics.pageview('/about')
    analytics.pageview('/about')
    analytics.pageview('/settings')
    // Two councils = two views even though both collapse to one pattern.
    analytics.pageview('/council/a')
    analytics.pageview('/council/b')
    expect(events.map((e) => e.path)).toEqual([
      '/about',
      '/settings',
      '/council/:id',
      '/council/:id',
    ])
  })

  it('sends the external referrer on the first pageview only', () => {
    Object.defineProperty(document, 'referrer', {
      value: 'https://news.ycombinator.com/item?id=1',
      configurable: true,
    })
    const { events, provider } = captureProvider()
    const analytics = new Analytics(provider)
    analytics.pageview('/')
    analytics.pageview('/about')
    expect(events[0]?.referrer).toBe('https://news.ycombinator.com/item?id=1')
    expect(events[1]?.referrer).toBeUndefined()
  })

  it('drops a same-host referrer (internal hop, not an arrival)', () => {
    Object.defineProperty(document, 'referrer', {
      value: `${window.location.origin}/about`,
      configurable: true,
    })
    const { events, provider } = captureProvider()
    new Analytics(provider).pageview('/')
    expect(events[0]?.referrer).toBeUndefined()
  })

  it('never lets a provider failure escape', () => {
    const analytics = new Analytics({
      trackPageview: () => {
        throw new Error('provider exploded')
      },
      trackEvent: () => {
        throw new Error('provider exploded')
      },
    })
    expect(() => analytics.pageview('/about')).not.toThrow()
    expect(() => analytics.event('council-deleted')).not.toThrow()
  })

  it('sends events with the current route pattern as context', () => {
    const { actions, provider } = captureProvider()
    const analytics = new Analytics(provider)
    analytics.pageview('/council/some-id')
    analytics.event('council-created:trial')
    analytics.event('key-added:anthropic') // provider-suffixed names too
    expect(actions).toHaveLength(2)
    expect(actions[0]?.name).toBe('council-created:trial')
    expect(actions[1]?.name).toBe('key-added:anthropic')
    expect(actions[0]?.path).toBe('/council/:id')
    expect(JSON.stringify(actions[0])).not.toContain('some-id')
  })

  it('events never dedupe — every occurrence counts', () => {
    const { actions, provider } = captureProvider()
    const analytics = new Analytics(provider)
    analytics.event('demo-opened')
    analytics.event('demo-opened')
    expect(actions).toHaveLength(2)
  })

  describe('localStorage opt-out', () => {
    afterEach(() => {
      localStorage.removeItem(ANALYTICS_DISABLED_KEY)
    })

    it('silences pageviews and events while the flag is set', () => {
      const { events, actions, provider } = captureProvider()
      const analytics = new Analytics(provider)
      localStorage.setItem(ANALYTICS_DISABLED_KEY, '1')
      analytics.pageview('/about')
      analytics.event('demo-opened')
      expect(events).toHaveLength(0)
      expect(actions).toHaveLength(0)
    })

    it('takes effect per call — no reload needed, either direction', () => {
      const { events, provider } = captureProvider()
      const analytics = new Analytics(provider)
      analytics.pageview('/about')
      localStorage.setItem(ANALYTICS_DISABLED_KEY, '1')
      analytics.pageview('/settings')
      localStorage.removeItem(ANALYTICS_DISABLED_KEY)
      analytics.pageview('/')
      expect(events.map((e) => e.path)).toEqual(['/about', '/'])
    })

    it('only the exact value 1 disables', () => {
      const { events, provider } = captureProvider()
      localStorage.setItem(ANALYTICS_DISABLED_KEY, 'true')
      new Analytics(provider).pageview('/about')
      expect(events).toHaveLength(1)
    })
  })
})

describe('createUmamiProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('POSTs the collect envelope, fire-and-forget', () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response()))
    vi.stubGlobal('fetch', fetchMock)
    const provider = createUmamiProvider('https://stats.example/ybs', 'site-1')
    provider.trackPageview({ ...SAMPLE_EVENT, referrer: 'https://ref.example/' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(url).toBe('https://stats.example/ybs')
    expect(init.method).toBe('POST')
    expect(init.keepalive).toBe(true)
    expect(init.credentials).toBe('omit')
    expect(JSON.parse(String(init.body))).toEqual({
      type: 'event',
      payload: {
        website: 'site-1',
        url: '/about',
        hostname: 'yesbrainer.ai',
        language: 'en-US',
        screen: '1920x1080',
        referrer: 'https://ref.example/',
      },
    })
  })

  it('omits the referrer key when absent', () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response()))
    vi.stubGlobal('fetch', fetchMock)
    createUmamiProvider('https://stats.example/ybs', 'site-1').trackPageview(
      SAMPLE_EVENT,
    )
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const payload: unknown = JSON.parse(String(init.body)).payload
    expect(payload).not.toHaveProperty('referrer')
    // A pageview must not carry an event name either.
    expect(payload).not.toHaveProperty('name')
  })

  it('sends a custom event as the same envelope plus name', () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response()))
    vi.stubGlobal('fetch', fetchMock)
    createUmamiProvider('https://stats.example/ybs', 'site-1').trackEvent({
      ...SAMPLE_EVENT,
      name: 'verdict-shared:consensus',
    })
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({
      type: 'event',
      payload: {
        website: 'site-1',
        url: '/about',
        hostname: 'yesbrainer.ai',
        language: 'en-US',
        screen: '1920x1080',
        name: 'verdict-shared:consensus',
      },
    })
  })

  it('swallows a rejecting fetch — a down collector is invisible', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('server unreachable'))),
    )
    const provider = createUmamiProvider('https://stats.example/ybs', 'site-1')
    expect(() => provider.trackPageview(SAMPLE_EVENT)).not.toThrow()
    // Let the rejection settle: an uncaught one would fail this test.
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

  it('swallows a synchronously-throwing fetch (CSP block)', () => {
    vi.stubGlobal('fetch', () => {
      throw new TypeError('Refused to connect (CSP)')
    })
    const provider = createUmamiProvider('https://stats.example/ybs', 'site-1')
    expect(() => provider.trackPageview(SAMPLE_EVENT)).not.toThrow()
  })
})

describe('resolveProvider', () => {
  const configured = {
    endpoint: 'https://stats.example/ybs',
    websiteId: 'site-1',
  }

  it('is the null provider under test, even when configured', () => {
    expect(resolveProvider({ ...configured, dev: true, test: true })).toBe(
      nullProvider,
    )
  })

  it('is the Umami provider when endpoint + website id are set', () => {
    const provider = resolveProvider({ ...configured, dev: false, test: false })
    expect(provider).not.toBe(nullProvider)
    expect(provider).not.toBe(consoleProvider)
  })

  it('is the console provider in dev without config', () => {
    expect(
      resolveProvider({
        endpoint: undefined,
        websiteId: undefined,
        dev: true,
        test: false,
      }),
    ).toBe(consoleProvider)
  })

  it('is the null provider in prod without config (fork default)', () => {
    // Half a config (endpoint but no id) is also "off", not "half on".
    expect(
      resolveProvider({
        endpoint: configured.endpoint,
        websiteId: undefined,
        dev: false,
        test: false,
      }),
    ).toBe(nullProvider)
  })
})
