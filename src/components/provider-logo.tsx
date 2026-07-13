import { PROVIDER_AVATARS } from '@/models/provider-avatars'
import type { ProviderId } from '@/models/registry'

/**
 * Brand mark for a provider, rendered via `@lobehub/icons` (the de-facto
 * package for LLM provider logos — maintained, license-clean, covers all
 * the providers we ship). The Avatar map itself lives in
 * `models/provider-avatars.ts`, shared with the share-card canvas renderer.
 *
 * `.Avatar` renders the circular branded mark; we use it everywhere a small
 * recognizable badge is needed (settings panel rows, future roster chips).
 */
export interface ProviderLogoProps {
  provider: ProviderId
  size?: number
}

export function ProviderLogo({ provider, size = 16 }: ProviderLogoProps) {
  const Avatar = PROVIDER_AVATARS[provider]
  // Fixed-size centered box: the @lobehub Avatars don't all share the same
  // intrinsic geometry (some have a circular backdrop, some don't), so
  // without a uniform container they sit at visibly different heights when
  // laid out in a row.
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        flexShrink: 0,
        lineHeight: 0,
        verticalAlign: 'middle',
      }}
    >
      <Avatar size={size} />
    </span>
  )
}
