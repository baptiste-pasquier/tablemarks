import { useId, useRef, useState } from 'react'
import { exportCollection, parseImport, applyImport, type ImportCounts, type ImportRecords } from '../../data/portability'
import { Modal } from '../ui/Modal'

export function PortabilityPanel({ onClose }: { onClose: () => void }) {
  const fileInputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  // Synchronous guard: React state updates don't flush before a second click is processed, so a
  // state-only `busy` check can't stop a double-submit. The ref does, and also makes export/import
  // mutually exclusive.
  const runningRef = useRef(false)
  const [exportBusy, setExportBusy] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
      setError('Could not export your collection.')
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
        setError(result.error)
        return
      }
      setPending(result.records)
    } catch {
      setError('Could not read that file.')
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
      setError('Could not import that file.')
    } finally {
      setImportBusy(false)
      runningRef.current = false
    }
  }

  return (
    <Modal onClose={onClose} panelClassName="max-h-[90vh] overflow-y-auto">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Export &amp; import</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600">
          ✕
        </button>
      </div>

      <p className="text-sm text-gray-600">
        Download a full backup of your collection, or merge in a previously exported file.
      </p>

      <button
        type="button"
        onClick={() => void exportNow()}
        disabled={busy}
        className="mt-3 w-full rounded-xl bg-brand px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-strong disabled:opacity-50"
      >
        {exportBusy ? 'Working…' : 'Export collection'}
      </button>

      <div className="mt-4 border-t border-gray-100 pt-4">
        <label htmlFor={fileInputId} className="block text-sm text-gray-600">
          Import a backup file
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

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {pending && (
        <div className="mt-3 rounded-md bg-brand-soft p-3 text-sm">
          <p>
            Import <strong>{pending.restaurants.length}</strong> place{pending.restaurants.length === 1 ? '' : 's'} and{' '}
            <strong>{pending.visits.length}</strong> visit{pending.visits.length === 1 ? '' : 's'}? Existing entries
            merge by last edit; nothing is deleted.
          </p>
          <button
            type="button"
            onClick={() => void confirmImport()}
            disabled={busy}
            className="mt-2 rounded-xl bg-brand px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-strong active:bg-brand-strong active:shadow-none disabled:opacity-50"
          >
            {importBusy ? 'Importing…' : 'Confirm import'}
          </button>
        </div>
      )}

      {summary && (
        <p className="mt-3 text-sm text-green-700">
          Imported: {summary.added} added, {summary.updated} updated, {summary.unchanged} unchanged.
        </p>
      )}
    </Modal>
  )
}
