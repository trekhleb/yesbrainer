/**
 * IndexedDB persistence via Dexie.
 *
 * Replaces the old server-side SQLite store: same logical shape
 * (`councils` ──< `seats` and `councils` ──< `turns`, with `events`
 * embedded as JSON on the turn row), now living on the user's device.
 *
 * Dexie writes/reads the typed row objects directly — IndexedDB stores
 * the JSON-ish object graph verbatim, no serialisation step.
 *
 * Multi-tenancy is gone: the old `userId` column came along to
 * scope queries; now there's one user per browser profile, so the
 * column is dropped entirely.
 */

import Dexie, { type Table } from 'dexie'
import type {
  CouncilDeliberation,
  Judge,
  Mediator,
  SeatConfig,
  SocialStructure,
  TokenTotals,
  TurnEvent,
} from '@/types/council'

export interface CouncilRow {
  id: string
  title: string | null
  createdAt: number
  socialStructure: SocialStructure
  tokenTotal: TokenTotals
  judge?: Judge
  mediator?: Mediator
  /** Per-council deliberation overrides. Stored verbatim as a JSON
   *  property on the row — not indexed, so no schema version bump. */
  deliberation?: CouncilDeliberation
  /** Seeded demo council (see `Council.isDemo`). Not indexed — no schema
   *  version bump; absent on every non-demo row. */
  isDemo?: boolean
}

export interface SeatRow {
  id: string
  councilId: string
  modelId: string
  config: SeatConfig
  /** Roster position. The `councilId` index returns rows in primary-key
   *  (uuid) order, so without this a seat added later could reappear
   *  mid-list. Not indexed — no schema version bump; rows predating the
   *  field sort first, in their existing order. */
  pos?: number
}

export interface TurnRow {
  id: string
  councilId: string
  idx: number
  userMsg: string
  events: TurnEvent[]
  tokenTotal: TokenTotals
  votingLabels?: Record<string, string>
  userImages?: string[]
}

class CouncilDb extends Dexie {
  councils!: Table<CouncilRow, string>
  seats!: Table<SeatRow, string>
  turns!: Table<TurnRow, string>

  constructor() {
    super('yesbrainer')
    // Index strategy:
    //  - councils.createdAt for sidebar recency sort.
    //  - seats.councilId for per-council seat lookup.
    //  - turns has a compound [councilId+idx] for ordered-by-idx reads
    //    plus a plain councilId for "give me every turn in this council".
    this.version(1).stores({
      councils: '&id, createdAt',
      seats: '&id, councilId',
      turns: '&id, councilId, [councilId+idx]',
    })
  }
}

export const db = new CouncilDb()
