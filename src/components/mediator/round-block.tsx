import { useStyletron } from 'baseui'
import { STRUCTURE_ICON } from '@/models/social-structures'
import { RoundCard } from '@/components/mediator/round-card'
import type { MediatorRoundView } from '@/types/session'
import { ModelIdentity } from '@/components/model-identity'
import { RoleBlockHeader } from '@/components/role-block-header'
import { RoleIconChip } from '@/components/role-icon-chip'
import { roleColors } from '@/utils/role-colors'

/**
 * One Mediator assessment in the interleaved Consensus timeline: a
 * sticky "MEDIATOR" stage header + the single round card (convergence
 * verdict + per-round digest + synthesis). Replaces the old multi-round
 * carousel — rounds now stack vertically, interleaved with the Participant
 * re-answer rounds between them, so the debate reads top-to-bottom.
 */
export function MediatorRoundBlock({
  round,
  maxRounds,
  modelId,
  isFinal,
}: {
  round: MediatorRoundView
  maxRounds: number
  /** Mediator model identity (it doesn't swap mid-turn). */
  modelId: string
  /** True for the latest round that produced synthesis — the council's
   *  answer; gets the `Final` badge + emphasis. */
  isFinal: boolean
}) {
  const [, theme] = useStyletron()
  const colors = roleColors('mediator', theme.name === 'dark-theme')
  return (
    <section aria-label="Mediator">
      <RoleBlockHeader
        // Flat header — colour lives on the card below, not a frame around
        // the block. The icon carries the Mediator (Consensus) colour.
        icon={
          <RoleIconChip role="mediator">
            {/* Mediator shares the Consensus structure's icon (handshake). */}
            <STRUCTURE_ICON.consensus size={13} aria-hidden />
          </RoleIconChip>
        }
        label="Mediator"
        accent={colors.label}
        inlineMeta={<ModelIdentity modelId={modelId} hideLabelOnMobile pill />}
      />
      <RoundCard round={round} maxRounds={maxRounds} isFinal={isFinal} />
    </section>
  )
}
