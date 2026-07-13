/**
 * Export / import for the full IndexedDB council bundle.
 *
 * The per-council export downloads one council as JSON. This
 * is the *all-councils* variant — the single artefact a user needs to
 * back up the entire app, or to move data to another device /
 * browser. Mirrored by `importCouncils()` which restores from the
 * same JSON shape.
 *
 * Bundle shape is versioned so future schema migrations can detect &
 * upgrade older exports at import time. Today only v1 exists.
 */

import { db } from '@/storage/db'
import type { CouncilRow, SeatRow, TurnRow } from '@/storage/db'
import {
  appendTurn,
  createCouncil,
  fetchCouncilRows,
  patchCouncilTitle,
  seatRowsToRoster,
  setJudge,
  setMediator,
  turnRowToTurn,
} from '@/storage/councils'
import { bundleCouncilSchema, councilBundleSchema } from '@/storage/bundle-schema'
import {
  normalizeSocialStructure,
  normalizeSynthesiser,
} from '@/types/council'
import type { Council } from '@/types/council'

export interface CouncilBundleV1 {
  version: 1
  exportedAt: number
  councils: Council[]
}

/** Raw rows → the bundle's council shape. Shared by the bulk export and the
 *  per-council export — and, via the row mappers it borrows from
 *  `storage/councils.ts`, with the live read path — so none of the three
 *  can drift on which fields round-trip. */
function toBundleCouncil(
  r: CouncilRow,
  seatRows: SeatRow[],
  turnRows: TurnRow[],
): Council {
  const seats = seatRowsToRoster(seatRows)
  // The bulk export reads turns unordered (grouped from a full-table
  // scan), so sort here; the mapper leaves ordering to its caller.
  const turns = [...turnRows].sort((a, b) => a.idx - b.idx).map(turnRowToTurn)
  return {
    id: r.id,
    title: r.title,
    createdAt: r.createdAt,
    // Normalized so a bundle written from stale rows (pre-rename ids)
    // still satisfies the import schema — exports must always round-trip.
    socialStructure: normalizeSocialStructure(r.socialStructure),
    seats,
    turns,
    tokenTotal: r.tokenTotal,
    // Judge / Mediator configs get the same read-boundary treatment as the
    // structure id above and the seats inside `seatRowsToRoster` — a stale
    // enum value that exported raw would fail the import schema's `z.enum`
    // and break the round-trip.
    ...(r.judge ? { judge: normalizeSynthesiser(r.judge) } : {}),
    ...(r.mediator ? { mediator: normalizeSynthesiser(r.mediator) } : {}),
    ...(r.deliberation ? { deliberation: r.deliberation } : {}),
    ...(r.isDemo ? { isDemo: true } : {}),
  }
}

export async function exportAllCouncils(): Promise<CouncilBundleV1> {
  // Pull straight from Dexie rather than going through `listCouncils`
  // / `getCouncil` so the bundle contains the raw rows (including
  // turn order, votingLabels, userImages, every event) — anything the
  // public API hides for sidebar-render purposes still gets backed
  // up here.
  const councilRows = await db.councils
    .orderBy('createdAt')
    .reverse()
    .toArray()
  const seatRows = await db.seats.toArray()
  const turnRows = await db.turns.toArray()

  const seatsByCouncil = new Map<string, typeof seatRows>()
  for (const s of seatRows) {
    let arr = seatsByCouncil.get(s.councilId)
    if (!arr) {
      arr = []
      seatsByCouncil.set(s.councilId, arr)
    }
    arr.push(s)
  }
  const turnsByCouncil = new Map<string, typeof turnRows>()
  for (const t of turnRows) {
    let arr = turnsByCouncil.get(t.councilId)
    if (!arr) {
      arr = []
      turnsByCouncil.set(t.councilId, arr)
    }
    arr.push(t)
  }

  const councils: Council[] = councilRows.map((r) =>
    toBundleCouncil(
      r,
      seatsByCouncil.get(r.id) ?? [],
      turnsByCouncil.get(r.id) ?? [],
    ),
  )

  return {
    version: 1,
    exportedAt: Date.now(),
    councils,
  }
}

/**
 * Export a single council in the same v1 envelope as the bulk export (one
 * council in the array), so there is exactly one file format everywhere:
 * backup, restore, and the seeded demo folder (`src/data/demo-councils/`)
 * all speak it. Sidebar kebab → Export.
 */
export async function exportOneCouncil(
  id: string,
): Promise<CouncilBundleV1 | null> {
  const rows = await fetchCouncilRows(id)
  if (!rows) return null
  return {
    version: 1,
    exportedAt: Date.now(),
    councils: [toBundleCouncil(rows.row, rows.seatRows, rows.turnRows)],
  }
}

/** Build a filename like `yesbrainer-council-monolith-vs-microservices.json`. */
export function councilExportFilename(title: string | null): string {
  const slug = (title ?? 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `yesbrainer-council-${slug || 'untitled'}.json`
}

export interface ImportReport {
  imported: number
  /** Councils whose id already existed locally — left untouched. */
  skipped: number
  /** Councils that failed to import (bad shape, write error, …)
   *  with a short reason string. */
  errors: { id: string; reason: string }[]
}

export async function importCouncils(
  raw: unknown,
): Promise<ImportReport> {
  // An import file is untrusted input (hand-edited, corrupted, crafted) —
  // zod-validate the envelope here and every council below, down to the
  // leaves, before a single row is written.
  const envelope = councilBundleSchema.safeParse(raw)
  if (!envelope.success) {
    throw new Error('importCouncils: bundle is not a v1 council export')
  }
  const report: ImportReport = { imported: 0, skipped: 0, errors: [] }

  // Detect existing ids in one read so we can short-circuit duplicates
  // without per-council read latency.
  const existingIds = new Set<string>(
    (await db.councils.toCollection().primaryKeys()) as string[],
  )

  for (const rawCouncil of envelope.data.councils) {
    // Per-council validation (not envelope-level) so one malformed
    // council is reported and skipped instead of rejecting the file.
    const parsed = bundleCouncilSchema.safeParse(rawCouncil)
    if (!parsed.success) {
      const id =
        rawCouncil &&
        typeof rawCouncil === 'object' &&
        typeof (rawCouncil as { id?: unknown }).id === 'string'
          ? (rawCouncil as { id: string }).id
          : '<unknown>'
      const issue = parsed.error.issues[0]
      report.errors.push({
        id,
        reason: issue
          ? `${issue.path.join('.') || 'council'}: ${issue.message}`
          : 'invalid council shape',
      })
      continue
    }
    const c = parsed.data
    if (existingIds.has(c.id)) {
      report.skipped += 1
      continue
    }
    try {
      // All-or-nothing per council: the row seed, judge/mediator config,
      // the `createdAt` restore, every turn, and the title patch commit
      // as one transaction — a bundle failing on turn k of n must not
      // strand a partial council that a re-import would then skip by id.
      // The storage calls inside open sub-transactions on these same
      // tables, which Dexie folds into this one.
      await db.transaction('rw', db.councils, db.seats, db.turns, async () => {
        // createCouncil seeds the row + seats (assigning roster `pos` from
        // array order) + deliberation; appendTurn replays each turn with
        // its events, votingLabels, and userImages intact — reusing the
        // live data path's token re-aggregation and invariants.
        await createCouncil({
          id: c.id,
          socialStructure: c.socialStructure,
          seats: c.seats,
          ...(c.judge ? { judge: c.judge } : {}),
          ...(c.mediator ? { mediator: c.mediator } : {}),
          ...(c.deliberation ? { deliberation: c.deliberation } : {}),
          ...(c.isDemo ? { isDemo: true } : {}),
        })
        // Judge / Mediator config rides on the createCouncil call;
        // setJudge / setMediator only re-fire if the imported council
        // has them but the social structure happens to be different —
        // belt-and-braces for the rare case where an exported council
        // has stale judge config.
        if (c.judge && c.socialStructure === 'trial') {
          await setJudge(c.id, c.judge)
        }
        if (c.mediator && c.socialStructure === 'consensus') {
          await setMediator(c.id, c.mediator)
        }
        // Restore the exported `createdAt` — `createCouncil` stamps import
        // time, which made every restore invert the sidebar: the bulk export
        // writes newest-first, so the newest council imported first, got the
        // *oldest* fresh stamp, and sank to the bottom. Recency is identity
        // for a restored backup (and the demo folder's order knob), so put
        // the original back.
        await db.councils.update(c.id, { createdAt: c.createdAt })
        for (const turn of c.turns) {
          await appendTurn(c.id, turn)
        }
        // The exported title would otherwise be lost — createCouncil
        // always starts at null and no titler run replays history.
        if (c.title && c.title.trim().length > 0) {
          await patchCouncilTitle(c.id, c.title)
        }
      })
      // Count the id as existing from here on, so a bundle carrying the
      // same council twice skips the duplicate instead of re-importing
      // into the just-created rows.
      existingIds.add(c.id)
      report.imported += 1
    } catch (err) {
      const reason =
        err instanceof Error ? err.message : 'unknown import error'
      report.errors.push({ id: c.id, reason })
    }
  }

  return report
}

/** Build a filename like `yesbrainer-bundle-2026-05-24.json`. */
export function bundleExportFilename(): string {
  const date = new Date().toISOString().slice(0, 10)
  return `yesbrainer-bundle-${date}.json`
}
