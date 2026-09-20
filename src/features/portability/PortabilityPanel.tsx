import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  exportCollection,
  parseImport,
  applyImport,
  type ImportCounts,
  type ImportError,
  type ImportErrorCode,
  type ImportRecords,
} from '../../data/portability'
import { ModalHeader } from '../ui/ModalHeader'
import { Button } from '../ui/Button'

/** Local (non-parser) failures, kept as translation keys — never as already-resolved text — so
 * the error paragraph re-resolves in whatever language is active at render time. */
type LocalErrorKey = 'portability.errorExport' | 'portability.errorRead' | 'portability.errorImport'

/** Component-state error shape: a stable code, never pre-translated text (see code review #2). */
type PanelError = { kind: 'local'; key: LocalErrorKey } | { kind: 'import'; error: ImportError }

/** Maps each `parseImport` error code to its translation key under `portability.error.*`.
 * `as const satisfies` keeps the values as literal key types (not widened to `string`), so `t()`
 * below stays checked against the real resource shape via src/types/i18next.d.ts. */
const IMPORT_ERROR_KEYS = {
  invalid_json: 'portability.error.invalidJson',
  not_an_object: 'portability.error.notAnObject',
  wrong_format: 'portability.error.wrongFormat',
  invalid_schema_version: 'portability.error.invalidSchemaVersion',
  schema_too_new: 'portability.error.schemaTooNew',
  no_records: 'portability.error.noRecords',
  invalid_records_shape: 'portability.error.invalidRecordsShape',
  malformed_restaurant: 'portability.error.malformedRestaurant',
  duplicate_restaurant_ids: 'portability.error.duplicateRestaurantIds',
  malformed_visit: 'portability.error.malformedVisit',
  duplicate_visit_ids: 'portability.error.duplicateVisitIds',
} as const satisfies Record<ImportErrorCode, string>

/** Resolves a `PanelError` to display text, calling `t()` at render time so the copy always
 * reflects the currently active language rather than the language in effect when it was set. */
function resolvePanelError(t: TFunction, error: PanelError): string {
  if (error.kind === 'local') return t(error.key)
  const key = IMPORT_ERROR_KEYS[error.error.code]
  if (error.error.code === 'schema_too_new')
    return t(key, { schemaVersion: error.error.schemaVersion })
  return t(key)
}

export function PortabilityPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const fileInputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  // Synchronous guard: React state updates don't flush before a second click is processed, so a
  // state-only `busy` check can't stop a double-submit. The ref does, and also makes export/import
  // mutually exclusive.
  const runningRef = useRef(false)
  const [exportBusy, setExportBusy] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
  const [error, setError] = useState<PanelError | null>(null)
  const [pending, setPending] = useState<ImportRecords | null>(null)
  const [summary, setSummary] = useState<ImportCounts | null>(null)

  const busy = exportBusy || importBusy

  async function exportNow() {
    if (runningRef.current) return
    runningRef.current = true
    setExportBusy(true)
    setError(null)
    try {
      const env = await exportCollection()
      const blob = new Blob([JSON.stringify(env, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `tablemarks-${env.exportedAt.slice(0, 10)}.json`
      // Some browsers (Firefox/Safari) only fire a download for an anchor that is in the document.
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      // Defer revocation so the browser can start the download before the blob URL is invalidated.
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      setError({ kind: 'local', key: 'portability.errorExport' })
    } finally {
      setExportBusy(false)
      runningRef.current = false
    }
  }

  async function pickFile(file: File) {
    if (runningRef.current) return
    runningRef.current = true
    setImportBusy(true)
    setError(null)
    setSummary(null)
    setPending(null)
    try {
      const text = await file.text()
      const result = parseImport(text)
      if (!result.ok) {
        setError({ kind: 'import', error: result.error })
        return
      }
      setPending(result.records)
    } catch {
      setError({ kind: 'local', key: 'portability.errorRead' })
    } finally {
      setImportBusy(false)
      runningRef.current = false
      // Reset the input so re-selecting the same file fires onChange again.
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function confirmImport() {
    if (runningRef.current || !pending) return
    runningRef.current = true
    setImportBusy(true)
    try {
      const counts = await applyImport(pending)
      setSummary(counts)
      setPending(null)
    } catch {
      setError({ kind: 'local', key: 'portability.errorImport' })
    } finally {
      setImportBusy(false)
      runningRef.current = false
    }
  }

  return (
    <>
      <ModalHeader title={t('portability.title')} onClose={onClose} />

      <p className="text-sm text-gray-600">{t('portability.description')}</p>

      <Button
        variant="primary"
        className="mt-3 w-full"
        onClick={() => void exportNow()}
        disabled={busy}
      >
        {exportBusy ? t('portability.exportBusy') : t('portability.exportAction')}
      </Button>

      <div className="mt-4 border-t border-gray-100 pt-4">
        <label htmlFor={fileInputId} className="block text-sm text-gray-600">
          {t('portability.importLabel')}
        </label>
        <input
          id={fileInputId}
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void pickFile(file)
          }}
          className="mt-1 w-full text-sm"
        />
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{resolvePanelError(t, error)}</p>}

      {pending && (
        <div className="bg-brand-soft mt-3 rounded-md p-3 text-sm">
          <p>
            {t('portability.confirm.question', {
              places: t('portability.confirm.place', { count: pending.restaurants.length }),
              visits: t('portability.confirm.visit', { count: pending.visits.length }),
            })}
          </p>
          <Button
            variant="primary"
            className="mt-3"
            onClick={() => void confirmImport()}
            disabled={busy}
          >
            {importBusy ? t('portability.importBusy') : t('portability.confirmImport')}
          </Button>
        </div>
      )}

      {summary && (
        <p className="mt-3 text-sm text-green-700">
          {t('portability.summary', {
            added: summary.added,
            updated: summary.updated,
            unchanged: summary.unchanged,
          })}
        </p>
      )}
    </>
  )
}
