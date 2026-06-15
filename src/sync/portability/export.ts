import { allRestaurantsForSync } from '../../data/restaurants'
import { allVisitsForSync } from '../../data/visits'
import { now } from '../../data/ids'
import { EXPORT_FORMAT, EXPORT_SCHEMA_VERSION, type ExportEnvelope } from './schema'
import type { Restaurant, Visit } from '../../types/models'

/** Wrap records in the versioned envelope. Pure — `exportedAt` is supplied by the caller.
 * `needsPush` is device-local and stripped from the exported envelope. */
export function buildExport(
  restaurants: Restaurant[],
  visits: Visit[],
  exportedAt: string,
): ExportEnvelope {
  return {
    format: EXPORT_FORMAT,
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt,
    records: {
      restaurants: restaurants.map(({ needsPush: _, ...r }) => r),
      visits: visits.map(({ needsPush: _, ...v }) => v),
    },
  }
}

/**
 * Full-fidelity snapshot of the entire collection. Reads the sync views so soft-deleted
 * tombstones and every record's `updated` timestamp are included — required for a
 * round-trippable, last-write-wins-correct backup.
 */
export async function exportCollection(): Promise<ExportEnvelope> {
  const [restaurants, visits] = await Promise.all([allRestaurantsForSync(), allVisitsForSync()])
  return buildExport(restaurants, visits, now())
}
