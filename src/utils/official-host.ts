/**
 * Hostname allowlist for the soft clone-guard (`unofficial-copy-notice.tsx`).
 *
 * Official production host + every host development legitimately runs on:
 * localhost/loopback and the RFC1918 private IPv4 ranges (phone-on-LAN
 * testing via `scripts/lan-relay.mjs`, sandboxed-container bridges).
 * `*.github.io` staging is deliberately NOT listed — once the custom domain
 * is configured GitHub redirects there anyway, and before that the notice
 * on a staging URL is accurate.
 */
export function isOfficialHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (h === 'yesbrainer.ai' || h === 'www.yesbrainer.ai') return true
  if (h === 'localhost' || h.endsWith('.localhost')) return true
  if (h === '127.0.0.1' || h === '[::1]' || h === '::1') return true
  // RFC1918 private IPv4 — LAN dev (phone testing) and container bridges.
  if (/^10\.\d+\.\d+\.\d+$/.test(h)) return true
  if (/^192\.168\.\d+\.\d+$/.test(h)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(h)) return true
  return false
}
