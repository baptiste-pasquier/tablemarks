import { getDB } from './db'
import { newId, now } from './ids'
import { recomputeRollup } from './rollup'
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

function today(): string {
  return now().slice(0, 10)
}

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
  return record
}

export async function updateVisit(id: string, patch: VisitPatch): Promise<Visit> {
  const db = await getDB()
  const existing = await db.get('visits', id)
  if (!existing) throw new Error(`Visit ${id} not found`)
  const next: Visit = { ...existing, ...patch, id, updated: now() }
  await db.put('visits', next)
  await recomputeRollup(next.restaurantId)
  return next
}

export async function removeVisit(id: string): Promise<void> {
  const db = await getDB()
  const existing = await db.get('visits', id)
  if (!existing) return
  await db.put('visits', { ...existing, deleted: true, updated: now() })
  await recomputeRollup(existing.restaurantId)
}

/** Live visits for a restaurant, most recent first. */
export async function visitsForRestaurant(restaurantId: string): Promise<Visit[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('visits', 'by-restaurant', restaurantId)
  return all.filter((v) => !v.deleted).sort((a, b) => (a.date < b.date ? 1 : -1))
}

/** Low-level write with no `updated` stamp — used by the sync engine. */
export async function putVisitRaw(record: Visit): Promise<void> {
  const db = await getDB()
  await db.put('visits', record)
}
