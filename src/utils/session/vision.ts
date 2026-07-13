import { getModel } from '@/models/registry'

/**
 * Whether a role instance (seat, voter, Judge, Mediator) should receive
 * the turn's image attachments: there are images, and the model actually
 * supports vision. The single home for the rule — the answer fan-out, the
 * voting phase, the Judge phase, and each of their retries must gate
 * identically, or a retry silently sees a different turn than the live
 * run did.
 */
export function modelSeesImages(
  modelId: string,
  images: readonly string[] | undefined,
): boolean {
  return !!images && images.length > 0 && getModel(modelId).capabilities.vision
}
