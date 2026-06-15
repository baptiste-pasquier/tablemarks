import { VERDICTS, type Restaurant, type Verdict, type Visit } from '../../types/models'

/** Current export file-format version. Distinct from the IndexedDB database version. */
export const EXPORT_SCHEMA_VERSION = 1

/** Identity guard so a non-Tablemarks JSON file is rejected before any record processing. */
export const EXPORT_FORMAT = 'tablemarks-export'

/** Record shapes in the export file — needsPush is device-local and never serialized. */
export type ExportRestaurant = Omit<Restaurant, 'needsPush'>
export type ExportVisit = Omit<Visit, 'needsPush'>

/** A full-fidelity, versioned, round-trippable snapshot of the collection. */
export interface ExportEnvelope {
  format: typeof EXPORT_FORMAT
  /** File-format version; gates import compatibility. */
  schemaVersion: number
  /** ISO timestamp the file was produced. Metadata only. */
  exportedAt: string
  records: {
    restaurants: ExportRestaurant[]
    visits: ExportVisit[]
  }
}

/** Validated, current-shape records ready to merge into the store. */
export interface ImportRecords {
  restaurants: Restaurant[]
  visits: Visit[]
}

export type ValidationResult =
  | { ok: true; records: ImportRecords }
  | { ok: false; error: string }

const DEFAULT_VERDICT: Verdict = 'once_was_enough'

function isString(x: unknown): x is string {
  return typeof x === 'string'
}
/** `updated` is the last-write-wins key (compared as a string); a non-date value would win forever. */
function isValidTimestamp(x: unknown): x is string {
  return isString(x) && !Number.isNaN(Date.parse(x))
}
function isNumberOrNull(x: unknown): x is number | null {
  return x === null || (typeof x === 'number' && Number.isFinite(x))
}
function isStringOrNull(x: unknown): x is string | null {
  return x === null || typeof x === 'string'
}
function isOptionalString(x: unknown): boolean {
  return x === undefined || typeof x === 'string'
}

/** Coerce an unknown verdict to a known value rather than reject the file (mirrors remote ingest). */
function coerceVerdict(x: unknown): Verdict {
  return isString(x) && (VERDICTS as readonly string[]).includes(x) ? (x as Verdict) : DEFAULT_VERDICT
}

function asRestaurant(x: unknown): Restaurant | null {
  if (typeof x !== 'object' || x === null) return null
  const r = x as Record<string, unknown>
  if (!isString(r.id) || r.id === '') return null
  if (!isString(r.name)) return null
  if (!isNumberOrNull(r.lat) || !isNumberOrNull(r.lng)) return null
  if (typeof r.pending !== 'boolean') return null
  if (!isValidTimestamp(r.updated) || typeof r.deleted !== 'boolean') return null
  if (!isOptionalString(r.address) || !isOptionalString(r.mapsUrl) || !isOptionalString(r.cuisine) || !isOptionalString(r.note)) return null
  if (!isStringOrNull(r.latestVisitDate)) return null
  if (typeof r.visitCount !== 'number') return null
  return {
    id: r.id,
    name: r.name,
    lat: r.lat,
    lng: r.lng,
    address: r.address as string | undefined,
    mapsUrl: r.mapsUrl as string | undefined,
    cuisine: r.cuisine as string | undefined,
    note: r.note as string | undefined,
    pending: r.pending,
    // `== null` catches both null and an absent (undefined) field — a visit-less place must
    // stay uncategorized, not get a fabricated default verdict.
    latestVerdict: r.latestVerdict == null ? null : coerceVerdict(r.latestVerdict),
    latestVisitDate: r.latestVisitDate,
    visitCount: r.visitCount,
    updated: r.updated,
    deleted: r.deleted,
    // Imported records are local-ahead-of-cloud until the next sync pushes them.
    needsPush: true,
  }
}

function asVisit(x: unknown): Visit | null {
  if (typeof x !== 'object' || x === null) return null
  const v = x as Record<string, unknown>
  if (!isString(v.id) || v.id === '') return null
  if (!isString(v.restaurantId) || !isString(v.date)) return null
  if (!isValidTimestamp(v.updated) || typeof v.deleted !== 'boolean') return null
  if (!isOptionalString(v.note)) return null
  return {
    id: v.id,
    restaurantId: v.restaurantId,
    date: v.date,
    verdict: coerceVerdict(v.verdict),
    note: v.note as string | undefined,
    updated: v.updated,
    deleted: v.deleted,
    // Imported records are local-ahead-of-cloud until the next sync pushes them.
    needsPush: true,
  }
}

/**
 * Forward-migrate raw records of a known older `schemaVersion` to the current shape.
 * Identity at v1 — the hook exists so future versions add ordered transforms here.
 */
function migrateToCurrent(records: { restaurants: unknown[]; visits: unknown[] }, _fromVersion: number) {
  return records
}

/**
 * Validate an untrusted parsed value as a current-shape export envelope. Pure: touches no store.
 * Rejects wrong format, unknown/future schema versions, non-array record collections, and
 * malformed records — returning a structured error so the caller can leave the store untouched.
 */
export function validateEnvelope(parsed: unknown): ValidationResult {
  if (typeof parsed !== 'object' || parsed === null) return { ok: false, error: 'File is not a JSON object.' }
  const env = parsed as Record<string, unknown>
  if (env.format !== EXPORT_FORMAT) return { ok: false, error: 'Not a Tablemarks export file.' }
  if (typeof env.schemaVersion !== 'number' || !Number.isInteger(env.schemaVersion) || env.schemaVersion < 1) {
    return { ok: false, error: 'Missing or invalid schema version.' }
  }
  if (env.schemaVersion > EXPORT_SCHEMA_VERSION) {
    return { ok: false, error: `This file was made by a newer version (schema ${env.schemaVersion}). Update the app to import it.` }
  }
  const records = env.records
  if (typeof records !== 'object' || records === null) return { ok: false, error: 'File has no records.' }
  const rawR = (records as Record<string, unknown>).restaurants
  const rawV = (records as Record<string, unknown>).visits
  if (!Array.isArray(rawR) || !Array.isArray(rawV)) return { ok: false, error: 'Records must contain restaurant and visit arrays.' }

  const migrated = migrateToCurrent({ restaurants: rawR, visits: rawV }, env.schemaVersion)

  // Duplicate ids within one collection would silently collapse during reconcile (Map-keyed by id),
  // dropping a record and skewing the import counts — reject rather than lose data quietly.
  const restaurants: Restaurant[] = []
  const restaurantIds = new Set<string>()
  for (const raw of migrated.restaurants) {
    const r = asRestaurant(raw)
    if (!r) return { ok: false, error: 'A restaurant record is malformed.' }
    if (restaurantIds.has(r.id)) return { ok: false, error: 'The file contains duplicate restaurant ids.' }
    restaurantIds.add(r.id)
    restaurants.push(r)
  }
  const visits: Visit[] = []
  const visitIds = new Set<string>()
  for (const raw of migrated.visits) {
    const v = asVisit(raw)
    if (!v) return { ok: false, error: 'A visit record is malformed.' }
    if (visitIds.has(v.id)) return { ok: false, error: 'The file contains duplicate visit ids.' }
    visitIds.add(v.id)
    visits.push(v)
  }
  return { ok: true, records: { restaurants, visits } }
}
