// Repository-layer facade for data portability. Feature/UI code imports the export/import API
// from here (the data layer) rather than reaching into src/sync/, per the layering rule in
// docs/architecture.md ("Feature/UI code never imports the sync layer"). The implementation lives
// under src/sync/portability/ because import reuses the pure reconcile/LWW core.
export { exportCollection } from '../sync/portability/export'
export { parseImport, applyImport, type ImportCounts } from '../sync/portability/import'
export type { ImportRecords, ImportError, ImportErrorCode } from '../sync/portability/schema'
