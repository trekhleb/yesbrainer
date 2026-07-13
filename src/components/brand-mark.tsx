/**
 * Yes-Brainer brand mark — the logo from `public/logo.svg`, recoloured to
 * `currentColor` via a CSS mask so it follows the surrounding text colour /
 * theme (ink in light mode, light in dark mode) instead of being locked to
 * the file's solid black. Decorative — callers provide the accessible label
 * (the "Yes-Brainer" wordmark / link), so this is `aria-hidden`.
 *
 * The same `logo.svg` (+ `logo.png`) drives the favicon, apple-touch, and
 * PWA install icons (see `index.html` / `vite.config.ts`).
 */

import { useStyletron } from 'baseui'

export function BrandMark({ size = 24 }: { size?: number }) {
  const [css] = useStyletron()
  return (
    <span
      aria-hidden
      className={css({
        display: 'inline-block',
        flexShrink: 0,
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor: 'currentColor',
        WebkitMaskImage: 'url(/logo.svg)',
        maskImage: 'url(/logo.svg)',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
      })}
    />
  )
}
