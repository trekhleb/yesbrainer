/**
 * The composer's keyless face. When no model is
 * usable — no cloud key, no opt-in Ollama — every council (demo or not)
 * swaps its composer for this card: the same floating frosted island, but
 * carrying the one action that unblocks everything instead of an input
 * that could only error seat-by-seat on send. Global rule, not
 * demo-specific: the seeded demo councils get their "add keys to
 * interact" behaviour for free, and the keyless-backstop council stops
 * offering a send that can't succeed.
 */

import { useStyletron } from 'baseui'
import { Button, SIZE as ButtonSize } from 'baseui/button'
import { ParagraphSmall } from 'baseui/typography'
import { FiKey } from 'react-icons/fi'
import { useNavigate } from 'react-router-dom'

import { MOBILE_MEDIA_QUERY } from '@/styles/breakpoints'

export function ComposerKeysGate() {
  const [css, theme] = useStyletron()
  const navigate = useNavigate()
  return (
    <div
      className={css({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexWrap: 'wrap',
        gap: '6px 14px',
        padding: '14px 16px',
        // Mirror the composer island's chrome (border / radius / frosted
        // translucency / soft elevation) so the swap reads as the same
        // surface in a different state, not a new widget.
        border: `1px solid ${theme.colors.borderOpaque}`,
        borderRadius: '24px',
        backgroundColor: `color-mix(in srgb, ${theme.colors.backgroundPrimary} 82%, transparent)`,
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: '0 18px 40px -24px rgba(0, 0, 0, 0.4)',
        [MOBILE_MEDIA_QUERY]: { flexDirection: 'column' },
      })}
    >
      <ParagraphSmall
        marginTop="0"
        marginBottom="0"
        color={theme.colors.contentSecondary}
        overrides={{ Block: { style: { textAlign: 'center' } } }}
      >
        Add your API keys to ask follow-ups or start your own council.
      </ParagraphSmall>
      <Button
        type="button"
        size={ButtonSize.compact}
        onClick={() => navigate('/settings/keys')}
        startEnhancer={() => <FiKey size={14} />}
        overrides={{
          BaseButton: {
            style: { [MOBILE_MEDIA_QUERY]: { width: '100%' } },
          },
        }}
      >
        Add your keys
      </Button>
    </div>
  )
}
