import type { Restaurant, Visit } from '../../types/models'

/** Current export file-format version. Distinct from the IndexedDB database version. */
export const EXPORT_SCHEMA_VERSION = 1

/** Identity guard so a non-Tablemarks JSON file is rejected before any record processing. */
export const EXPORT_FORMAT = 'tablemarks-export'

/** A full-fidelity, versioned, round-trippable snapshot of the collection. */
export interface ExportEnvelope {
  format: typeof EXPORT_FORMAT
  /** File-format version; gates import compatibility. */
  schemaVersion: number
  /** ISO timestamp the file was produced. Metadata only. */
  exportedAt: string
  records: {
    restaurants: Restaurant[]
    visits: Visit[]
  }
}

/** Validated, current-shape records ready to merge into the store. */
export interface ImportRecords {
  restaurants: Restaurant[]
  visits: Visit[]
}
