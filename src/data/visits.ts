import { getDB } from './db'
import { newId } from './ids'
import { now, today } from '../lib/dates'
import { recomputeRollup } from './rollup'
import { emitLocalChange, emitStoreChange } from './events'
import type { Verdict, Visit } from '../types/models'

export interface VisitInput {
  id?: string
  restaurantId: string
  /** ISO date (YYYY-MM-DD); defaults to today. */
  date?: string
  verdict: Verdict
  note?: string
}

export type VisitPatch = Partial<Pick<Visit, 'date' | 'verdict' | 'note'>>

export async function createVisit(input: VisitInput): Promise<Visit> {
  const record: Visit = {
    id: input.id ?? newId(),
    restaurantId: input.restaurantId,
    date: input.date ?? today(),
    verdict: input.verdict,
    note: input.note,
    updated: now(),
    deleted: false,
  }
  const db = await getDB()
  await db.put('visits', record)
  await recomputeRollup(record.restaurantId)
  emitLocalChange()
  return record
}

export async function updateVisit(id: string, patch: VisitPatch): Promise<Visit> {
  const db = await getDB()
  const existing = await db.get('visits', id)
  if (!existing) throw new Error(`Visit ${id} not found`)
  const next: Visit = { ...existing, ...patch, id, updated: now() }
  await db.put('visits', next)
  await recomputeRollup(next.restaurantId)
  emitLocalChange()
  return next
}

export async function removeVisit(id: string): Promise<void> {
  const db = await getDB()
  const existing = await db.get('visits', id)
  if (!existing) return
  await db.put('visits', { ...existing, deleted: true, updated: now() })
  await recomputeRollup(existing.restaurantId)
  emitLocalChange()
}

/** Live visits for a restaurant, most recent first. */
export async function visitsForRestaurant(restaurantId: string): Promise<Visit[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('visits', 'by-restaurant', restaurantId)
  return all.filter((v) => !v.deleted).sort((a, b) => (a.date < b.date ? 1 : -1))
}

/** Low-level write with no `updated` stamp and no change event — used by the sync engine. */
export async function putVisitRaw(record: Visit): Promise<void> {
  const db = await getDB()
  await db.put('visits', record)
  emitStoreChange()
}

/** All visits including tombstones — the sync engine needs to see deletes. */
export async function allVisitsForSync(): Promise<Visit[]> {
  const db = await getDB()
  return db.getAll('visits')
}

/**
 * Stamp the local-only `syncedUpdated` marker after a successful push — no `updated` bump, no
 * change event, used by the sync engine. Get-and-put run in a single readwrite transaction, and
 * the stamp is only written if the record's `updated` still matches `syncedUpdated` (the value the
 * caller read before pushing) — otherwise a concurrent edit or delete raced the push, and blindly
 * writing here would revert that newer change while falsely marking it synced. No-op if the record
 * no longer exists or has moved on.
 */
export async function markVisitSynced(id: string, syncedUpdated: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('visits', 'readwrite')
  const store = tx.objectStore('visits')
  const existing = await store.get(id)
  const stamped = existing !== undefined && existing.updated === syncedUpdated
  if (stamped) await store.put({ ...existing, syncedUpdated })
  await tx.done
  if (stamped) emitStoreChange()
}
