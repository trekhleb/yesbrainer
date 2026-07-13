import { db } from '@/storage/db'

/** Wipe every Dexie table — per-test isolation for storage suites. */
export async function clearDb(): Promise<void> {
  await Promise.all([db.councils.clear(), db.seats.clear(), db.turns.clear()])
}
