/**
 * Top-level React error boundary. Catches render/lifecycle errors anywhere
 * below it and shows the message + stack *on screen* instead of a blank white
 * page — essential for debugging on mobile, where there's no console.
 *
 * The fallback is deliberately plain (native elements + inline styles, no
 * Base Web / styletron): the crash might be in the styling layer itself, so
 * the fallback must not depend on it. A "Copy error" button lets you grab the
 * details on a phone where selecting text is awkward.
 *
 * Caveat: error boundaries only catch errors thrown during render / lifecycle
 * — not in event handlers, timers, or unhandled promise rejections. We add
 * window listeners for those so they surface here too.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { GITHUB_ISSUES_URL } from '@/utils/external-links'
import { redactSecrets } from '@/utils/redact-secrets'

/**
 * The boundary renders raw error text (message / stack) on screen and
 * copies it to the clipboard — and the `unhandledrejection` listener can
 * surface an escaped provider error whose serialization carries the
 * failing request, auth header included. So the same redaction as every
 * other error surface applies here. Best-effort wrapper: the boundary
 * must still render even if redaction itself throws.
 */
function safeRedact(s: string): string {
  try {
    return redactSecrets(s)
  } catch {
    return s
  }
}

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
  componentStack: string | null
  copied: boolean
}

const buttonStyle: React.CSSProperties = {
  appearance: 'none',
  border: '1px solid #ccc',
  borderRadius: 8,
  background: '#fff',
  color: '#111',
  padding: '8px 14px',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: null, copied: false }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? null })
    // Never the raw object: an escaped provider error can serialize its
    // failing request, auth header included, and "open devtools and paste
    // what you see" is the standard bug-report ask. Same redaction as the
    // on-screen details.
    console.error(
      safeRedact(
        [
          `[ErrorBoundary] ${error.name}: ${error.message}`,
          error.stack ?? '(no stack)',
          info.componentStack ? `Component stack:${info.componentStack}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      ),
    )
  }

  componentDidMount() {
    window.addEventListener('error', this.onWindowError)
    window.addEventListener('unhandledrejection', this.onRejection)
  }

  componentWillUnmount() {
    window.removeEventListener('error', this.onWindowError)
    window.removeEventListener('unhandledrejection', this.onRejection)
  }

  // Surface non-render errors (event handlers / async) too — they don't reach
  // error boundaries, so without this they'd only hit the (missing) console.
  private onWindowError = (e: ErrorEvent) => {
    if (this.state.error) return
    // Benign browser notification, not a failure: fired when a ResizeObserver
    // callback itself changes layout so one more observation pass is deferred
    // to the next frame (Base Web's SegmentedControl does this on window
    // resize while repositioning its active pill). Chrome reports it through
    // window.onerror anyway; every error tracker ignores it by default.
    if (e.message.includes('ResizeObserver loop')) return
    this.setState({ error: e.error ?? new Error(e.message) })
  }

  private onRejection = (e: PromiseRejectionEvent) => {
    if (this.state.error) return
    const reason = e.reason
    this.setState({
      error: reason instanceof Error ? reason : new Error(String(reason)),
    })
  }

  private details(): string {
    const { error, componentStack } = this.state
    return safeRedact(
      [
        `${error?.name ?? 'Error'}: ${error?.message ?? ''}`,
        '',
        error?.stack ?? '(no stack)',
        componentStack ? `\nComponent stack:${componentStack}` : '',
        '',
        `URL: ${window.location.href}`,
        `UA:  ${navigator.userAgent}`,
      ].join('\n'),
    )
  }

  private copy = () => {
    void navigator.clipboard
      ?.writeText(this.details())
      .then(() => this.setState({ copied: true }))
      .catch(() => undefined)
  }

  render() {
    const { error, componentStack, copied } = this.state
    if (!error) return this.props.children
    return (
      <div
        role="alert"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 100000,
          overflow: 'auto',
          background: '#fff',
          color: '#111',
          // Full-bleed overlay: clear the notch / home indicator when the
          // installed PWA draws under the transparent status bar.
          padding:
            'calc(20px + env(safe-area-inset-top)) 16px calc(20px + env(safe-area-inset-bottom))',
          font: '14px/1.5 -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
          WebkitTextSizeAdjust: '100%',
        }}
      >
        <h1 style={{ fontSize: 18, margin: '0 0 8px' }}>The app hit an error</h1>
        <p
          style={{
            margin: '0 0 14px',
            color: '#b00020',
            fontWeight: 600,
            overflowWrap: 'anywhere',
          }}
        >
          {error.name}: {safeRedact(error.message)}
        </p>
        <div
          style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}
        >
          <button
            type="button"
            style={buttonStyle}
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
          <button type="button" style={buttonStyle} onClick={this.copy}>
            {copied ? 'Copied ✓' : 'Copy error'}
          </button>
          {/* Plain link, deliberately no prefilled issue body: the error
              text can carry personal context (URLs, model output), so the
              user pastes only what they choose. */}
          <a
            href={GITHUB_ISSUES_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              ...buttonStyle,
              display: 'inline-block',
              textDecoration: 'none',
            }}
          >
            Report a bug
          </a>
        </div>
        <pre
          style={{
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            background: '#f6f6f7',
            border: '1px solid #e2e2e4',
            borderRadius: 8,
            padding: 12,
            margin: 0,
            fontSize: 12,
            lineHeight: 1.45,
          }}
        >
          {safeRedact(error.stack ?? '(no stack)')}
          {componentStack ? `\n\nComponent stack:${componentStack}` : ''}
        </pre>
      </div>
    )
  }
}
